interface Env {
  ROSTER: KVNamespace;
  ASSETS: Fetcher;
  HENRIK_API_KEY?: string;
}

interface RosterPayload {
  updatedAt: number;
  players: unknown[];
}

interface RosterIdentity {
  id: string;
  riotName: string;
  riotTag: string;
}

interface SeedIdentity {
  riotName: string;
  riotTag: string;
}

interface QualifyingMatch {
  matchId: string;
  playedAt: number;
  mapName: string;
  results: { playerId: string; result: 'win' | 'loss' }[];
}

const KEY = 'shared-roster';
const PAGE_SIZE = 10;
const MAX_PAGES_PER_SEED = 20;

/** 가장 최근 8월 1일 0시(UTC 날짜 기준 로컬과 동일하게 month=7)부터 */
function matchHistoryCutoff(now = Date.now()) {
  const date = new Date(now);
  const seasonYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(seasonYear, 7, 1, 0, 0, 0, 0).getTime();
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

function riotKey(name: string, tag: string) {
  return `${name.trim().toLowerCase()}#${tag.trim().toLowerCase()}`;
}

function isCustomQueue(queue: { id?: string; name?: string } | null | undefined) {
  const id = queue?.id?.toLowerCase() ?? '';
  const name = queue?.name?.toLowerCase() ?? '';
  return id === 'custom' || name.includes('custom') || name.includes('커스텀');
}

async function handleRoster(request: Request, env: Env): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (request.method === 'GET') {
    const stored = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
    return json({
      updatedAt: stored?.updatedAt ?? 0,
      players: Array.isArray(stored?.players) ? stored.players : [],
    });
  }

  if (request.method === 'PUT') {
    let body: Partial<RosterPayload>;
    try {
      body = (await request.json()) as Partial<RosterPayload>;
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }

    if (!Array.isArray(body.players)) {
      return json({ error: 'players 배열이 필요합니다.' }, { status: 400 });
    }

    const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
    const existing = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
    if (existing && typeof existing.updatedAt === 'number' && existing.updatedAt > updatedAt) {
      return json(
        { ok: false, newer: true, updatedAt: existing.updatedAt, players: existing.players },
        { status: 409 },
      );
    }

    const payload: RosterPayload = {
      updatedAt,
      players: body.players,
    };
    await env.ROSTER.put(KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

async function fetchSeedMatches(
  seed: SeedIdentity,
  apiKey: string,
  cutoff: number
): Promise<unknown[]> {
  const collected: unknown[] = [];
  for (let page = 0; page < MAX_PAGES_PER_SEED; page += 1) {
    const start = page * PAGE_SIZE;
    const url =
      `https://api.henrikdev.xyz/valorant/v4/matches/kr/pc/` +
      `${encodeURIComponent(seed.riotName)}/${encodeURIComponent(seed.riotTag)}` +
      `?size=${PAGE_SIZE}&start=${start}&queue=custom`;

    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      if (response.status === 404) break;
      throw new Error(`HenrikDev ${response.status}`);
    }

    const payload = (await response.json()) as { data?: unknown[] };
    const batch = Array.isArray(payload.data) ? payload.data : [];
    if (batch.length === 0) break;

    let reachedCutoff = false;
    for (const match of batch) {
      const meta = (match as { metadata?: { started_at?: string } }).metadata;
      const startedAt = meta?.started_at ? Date.parse(meta.started_at) : NaN;
      if (!Number.isFinite(startedAt)) continue;
      if (startedAt < cutoff) {
        reachedCutoff = true;
        continue;
      }
      collected.push(match);
    }
    if (reachedCutoff || batch.length < PAGE_SIZE) break;
  }
  return collected;
}

function toQualifyingMatches(rawMatches: unknown[], roster: RosterIdentity[]): QualifyingMatch[] {
  const idByRiot = new Map(roster.map((player) => [riotKey(player.riotName, player.riotTag), player.id]));
  const byMatchId = new Map<string, QualifyingMatch>();

  for (const raw of rawMatches) {
    const match = raw as {
      metadata?: {
        match_id?: string;
        started_at?: string;
        is_completed?: boolean;
        map?: { name?: string };
        queue?: { id?: string; name?: string };
      };
      players?: { name?: string; tag?: string; team_id?: string }[];
      teams?: { team_id?: string; won?: boolean }[];
    };

    const meta = match.metadata;
    if (!meta?.match_id || !meta.is_completed || !isCustomQueue(meta.queue)) continue;
    const playedAt = meta.started_at ? Date.parse(meta.started_at) : NaN;
    if (!Number.isFinite(playedAt)) continue;

    const teamWon = new Map<string, boolean>();
    for (const team of match.teams ?? []) {
      if (team.team_id) teamWon.set(team.team_id, Boolean(team.won));
    }

    const results: QualifyingMatch['results'] = [];
    for (const participant of match.players ?? []) {
      if (!participant.name || !participant.tag || !participant.team_id) continue;
      const playerId = idByRiot.get(riotKey(participant.name, participant.tag));
      if (!playerId) continue;
      const won = teamWon.get(participant.team_id);
      if (won == null) continue;
      results.push({ playerId, result: won ? 'win' : 'loss' });
    }

    const uniqueIds = new Set(results.map((item) => item.playerId));
    if (uniqueIds.size < 3) continue;

    byMatchId.set(meta.match_id, {
      matchId: meta.match_id,
      playedAt,
      mapName: meta.map?.name ?? '',
      results,
    });
  }

  return [...byMatchId.values()].sort((a, b) => a.playedAt - b.playedAt);
}

async function handleMatchImport(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!env.HENRIK_API_KEY) {
    return json({ ok: false, error: 'HENRIK_API_KEY 시크릿이 없습니다.', matches: [] }, { status: 503 });
  }

  let body: { seeds?: SeedIdentity[]; roster?: RosterIdentity[] };
  try {
    body = (await request.json()) as { seeds?: SeedIdentity[]; roster?: RosterIdentity[] };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.', matches: [] }, { status: 400 });
  }

  const seeds = (body.seeds ?? [])
    .filter((item) => item?.riotName?.trim() && item?.riotTag?.trim())
    .slice(0, 2);
  const roster = (body.roster ?? []).filter((item) => item?.id && item?.riotName?.trim() && item?.riotTag?.trim());

  if (seeds.length === 0) {
    return json({ ok: false, error: '시드가 필요합니다.', matches: [] }, { status: 400 });
  }
  if (roster.length < 3) {
    return json({ ok: false, error: '등록 태그가 3명 이상 필요합니다.', matches: [] }, { status: 400 });
  }

  const cutoff = matchHistoryCutoff();
  try {
    const raw: unknown[] = [];
    for (const seed of seeds) {
      const matches = await fetchSeedMatches(seed, env.HENRIK_API_KEY, cutoff);
      raw.push(...matches);
    }
    const matches = toQualifyingMatches(raw, roster);
    return json({ ok: true, matches });
  } catch (error) {
    const message = error instanceof Error ? error.message : '전적 조회 실패';
    return json({ ok: false, error: message, matches: [] }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/roster' || url.pathname === '/api/roster/') {
      return handleRoster(request, env);
    }
    if (url.pathname === '/api/matches/import' || url.pathname === '/api/matches/import/') {
      return handleMatchImport(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
