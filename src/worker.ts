interface Env {
  ROSTER: KVNamespace;
  ASSETS: Fetcher;
  HENRIK_API_KEY?: string;
  STREAMER_PASSWORD?: string;
}

interface RosterPayload {
  updatedAt: number;
  players: unknown[];
}

interface RosterIdentity {
  id: string;
  name?: string;
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

interface JoinApplication {
  id: string;
  name: string;
  riotName: string;
  riotTag: string;
  queueNo: number;
  createdAt: number;
}

interface JoinQueuePayload {
  nextNo: number;
  items: JoinApplication[];
}

const KEY = 'shared-roster';
const JOIN_KEY = 'join-queue';
/** 시드당 Henrik 호출 1회에 가져올 커스텀 판 수 */
const PAGE_SIZE = 15;
const DEFAULT_TIER = { tier: 'Gold', division: 2 };

/** 가장 최근 8월 1일 0시부터 */
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

function normalizeRiotPart(value: string) {
  return value.trim().normalize('NFC').replace(/^#+/, '').toLowerCase();
}

function riotKey(name: string, tag: string) {
  const n = normalizeRiotPart(name);
  const t = normalizeRiotPart(tag);
  if (!n || !t) return '';
  return `${n}#${t}`;
}

function bearerToken(request: Request) {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

function requireStreamer(request: Request, env: Env): Response | null {
  if (!env.STREAMER_PASSWORD) {
    return json({ error: 'STREAMER_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }
  if (bearerToken(request) !== env.STREAMER_PASSWORD) {
    return json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  return null;
}

function isCustomQueue(queue: { id?: string; name?: string } | null | undefined) {
  const id = queue?.id?.toLowerCase() ?? '';
  const name = queue?.name?.toLowerCase() ?? '';
  return id === 'custom' || name.includes('custom') || name.includes('커스텀');
}

function teamDidWin(
  teamWon: Map<string, boolean>,
  teamId: string,
  teams: { team_id?: string; won?: boolean; rounds?: { won?: number; lost?: number } }[]
): boolean | null {
  if (teamWon.has(teamId)) return teamWon.get(teamId)!;
  const team = teams.find((item) => item.team_id === teamId);
  if (!team) return null;
  if (typeof team.won === 'boolean') return team.won;
  const wonRounds = team.rounds?.won;
  const lostRounds = team.rounds?.lost;
  if (typeof wonRounds === 'number' && typeof lostRounds === 'number') {
    if (wonRounds === lostRounds) return null;
    return wonRounds > lostRounds;
  }
  return null;
}

async function readJoinQueue(env: Env): Promise<JoinQueuePayload> {
  const stored = (await env.ROSTER.get(JOIN_KEY, 'json')) as JoinQueuePayload | null;
  const items = Array.isArray(stored?.items) ? stored!.items : [];
  const nextNo = typeof stored?.nextNo === 'number' && stored.nextNo > 0 ? stored.nextNo : 1;
  return { nextNo, items };
}

async function writeJoinQueue(env: Env, payload: JoinQueuePayload) {
  await env.ROSTER.put(JOIN_KEY, JSON.stringify(payload));
}

function asSavedPlayers(raw: unknown[]): Record<string, unknown>[] {
  return raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!env.STREAMER_PASSWORD) {
    return json({ ok: false, error: 'STREAMER_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }
  if ((body.password ?? '').trim() !== env.STREAMER_PASSWORD) {
    return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  return json({ ok: true });
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
    const denied = requireStreamer(request, env);
    if (denied) return denied;

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
        { status: 409 }
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

async function handleJoin(request: Request, env: Env, path: string): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  const approveMatch = path.match(/^\/api\/join\/([^/]+)\/approve$/);
  const rejectMatch = path.match(/^\/api\/join\/([^/]+)\/reject$/);

  if (approveMatch && request.method === 'POST') {
    const denied = requireStreamer(request, env);
    if (denied) return denied;
    return approveJoin(env, decodeURIComponent(approveMatch[1]));
  }

  if (rejectMatch && request.method === 'POST') {
    const denied = requireStreamer(request, env);
    if (denied) return denied;
    return rejectJoin(env, decodeURIComponent(rejectMatch[1]));
  }

  if (path !== '/api/join') {
    return json({ error: 'Not found' }, { status: 404 });
  }

  if (request.method === 'GET') {
    const denied = requireStreamer(request, env);
    if (denied) return denied;
    const queue = await readJoinQueue(env);
    return json({ items: queue.items });
  }

  if (request.method === 'POST') {
    return enqueueJoin(request, env);
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

async function enqueueJoin(request: Request, env: Env): Promise<Response> {
  let body: { name?: string; riotName?: string; riotTag?: string };
  try {
    body = (await request.json()) as { name?: string; riotName?: string; riotTag?: string };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const riotName = (body.riotName ?? '').trim().replace(/^#+/, '');
  const riotTag = (body.riotTag ?? '').trim().replace(/^#+/, '');
  if (!name) return json({ ok: false, error: '치지직 닉네임을 입력하세요.' }, { status: 400 });
  if (!riotName || !riotTag) {
    return json({ ok: false, error: '발로란트 닉과 태그를 입력하세요.' }, { status: 400 });
  }

  const nameKey = name.normalize('NFC').toLowerCase();
  const tagKey = riotKey(riotName, riotTag);
  const queue = await readJoinQueue(env);
  const roster = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
  const rosterPlayers = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);

  const nameTaken =
    queue.items.some((item) => item.name.normalize('NFC').toLowerCase() === nameKey) ||
    rosterPlayers.some(
      (item) => typeof item.name === 'string' && item.name.normalize('NFC').toLowerCase() === nameKey
    );
  if (nameTaken) {
    return json({ ok: false, error: '같은 치지직 닉네임이 이미 있습니다.' }, { status: 409 });
  }

  const riotTaken =
    queue.items.some((item) => riotKey(item.riotName, item.riotTag) === tagKey) ||
    rosterPlayers.some(
      (item) =>
        typeof item.riotName === 'string' &&
        typeof item.riotTag === 'string' &&
        riotKey(item.riotName, item.riotTag) === tagKey
    );
  if (riotTaken) {
    return json({ ok: false, error: '같은 발로란트 닉#태그가 이미 있습니다.' }, { status: 409 });
  }

  const application: JoinApplication = {
    id: crypto.randomUUID(),
    name,
    riotName,
    riotTag,
    queueNo: queue.nextNo,
    createdAt: Date.now(),
  };
  await writeJoinQueue(env, {
    nextNo: queue.nextNo + 1,
    items: [...queue.items, application],
  });
  return json({ ok: true, application });
}

async function approveJoin(env: Env, id: string): Promise<Response> {
  const queue = await readJoinQueue(env);
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) {
    return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  const application = queue.items[index];
  const remaining = queue.items.filter((item) => item.id !== id);
  await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });

  const existing = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
  const playerId = crypto.randomUUID();
  const saved = {
    id: playerId,
    name: application.name,
    currentTier: DEFAULT_TIER,
    riotName: application.riotName,
    riotTag: application.riotTag,
    queueNo: application.queueNo,
    wins: 0,
    losses: 0,
    streak: 0,
  };
  const nextPlayers = [...players.filter((item) => item.id !== playerId), saved];
  const updatedAt = Date.now();
  await env.ROSTER.put(KEY, JSON.stringify({ updatedAt, players: nextPlayers }));

  const sessionPlayer = {
    ...saved,
    maxTier: DEFAULT_TIER,
    canOrder: false,
    restrictions: [],
    lockedTeam: null,
    rivalIds: [],
    allyIds: [],
  };

  return json({
    ok: true,
    player: sessionPlayer,
    roster: { updatedAt, players: nextPlayers },
  });
}

async function rejectJoin(env: Env, id: string): Promise<Response> {
  const queue = await readJoinQueue(env);
  if (!queue.items.some((item) => item.id === id)) {
    return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  await writeJoinQueue(env, {
    nextNo: queue.nextNo,
    items: queue.items.filter((item) => item.id !== id),
  });
  return json({ ok: true });
}

async function fetchSeedMatches(
  seed: SeedIdentity,
  apiKey: string,
  cutoff: number
): Promise<unknown[]> {
  const url =
    `https://api.henrikdev.xyz/valorant/v4/matches/kr/pc/` +
    `${encodeURIComponent(seed.riotName)}/${encodeURIComponent(seed.riotTag)}` +
    `?size=${PAGE_SIZE}&start=0&queue=custom`;

  const response = await fetch(url, {
    headers: { Authorization: apiKey },
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`HenrikDev ${response.status}`);
  }

  const payload = (await response.json()) as { data?: unknown[] };
  const batch = Array.isArray(payload.data) ? payload.data : [];
  const collected: unknown[] = [];
  for (const match of batch) {
    const meta = (match as { metadata?: { started_at?: string } }).metadata;
    const startedAt = meta?.started_at ? Date.parse(meta.started_at) : NaN;
    if (!Number.isFinite(startedAt) || startedAt < cutoff) continue;
    collected.push(match);
  }
  return collected;
}

function toQualifyingMatches(rawMatches: unknown[], roster: RosterIdentity[]): QualifyingMatch[] {
  const idByRiot = new Map<string, string>();
  const idsByRiotName = new Map<string, string[]>();
  const idByDisplayName = new Map<string, string>();

  for (const player of roster) {
    const key = riotKey(player.riotName, player.riotTag);
    if (key && !idByRiot.has(key)) idByRiot.set(key, player.id);

    const riotName = normalizeRiotPart(player.riotName);
    if (riotName) {
      const list = idsByRiotName.get(riotName) ?? [];
      if (!list.includes(player.id)) list.push(player.id);
      idsByRiotName.set(riotName, list);
    }

    const display = (player.name ?? '').trim().normalize('NFC').toLowerCase();
    if (display && !idByDisplayName.has(display)) idByDisplayName.set(display, player.id);
  }

  const resolvePlayerId = (name?: string, tag?: string) => {
    if (!name) return undefined;
    if (tag) {
      const key = riotKey(name, tag);
      if (key && idByRiot.has(key)) return idByRiot.get(key);
    }
    const riotName = normalizeRiotPart(name);
    const byName = idsByRiotName.get(riotName);
    if (byName?.length === 1) return byName[0];
    const display = name.trim().normalize('NFC').toLowerCase();
    return idByDisplayName.get(display);
  };

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
      players?: { name?: string; tag?: string; team_id?: string; team?: string }[];
      teams?: { team_id?: string; won?: boolean; rounds?: { won?: number; lost?: number } }[];
    };

    const meta = match.metadata;
    if (!meta?.match_id || !meta.is_completed || !isCustomQueue(meta.queue)) continue;
    const playedAt = meta.started_at ? Date.parse(meta.started_at) : NaN;
    if (!Number.isFinite(playedAt)) continue;

    const teams = match.teams ?? [];
    const teamWon = new Map<string, boolean>();
    for (const team of teams) {
      if (!team.team_id) continue;
      if (typeof team.won === 'boolean') teamWon.set(team.team_id, team.won);
      else if (typeof team.rounds?.won === 'number' && typeof team.rounds?.lost === 'number') {
        if (team.rounds.won !== team.rounds.lost) {
          teamWon.set(team.team_id, team.rounds.won > team.rounds.lost);
        }
      }
    }

    const results: QualifyingMatch['results'] = [];
    for (const participant of match.players ?? []) {
      const teamId = participant.team_id || participant.team;
      if (!participant.name || !teamId) continue;
      const playerId = resolvePlayerId(participant.name, participant.tag);
      if (!playerId) continue;
      const won = teamDidWin(teamWon, teamId, teams);
      if (won == null) continue;
      results.push({ playerId, result: won ? 'win' : 'loss' });
    }

    const uniqueIds = new Set(results.map((item) => item.playerId));
    if (uniqueIds.size < 2) continue;

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
  const denied = requireStreamer(request, env);
  if (denied) return denied;

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
  if (roster.length === 0) {
    return json({ ok: false, error: '닉#태그가 등록된 명단이 필요합니다.', matches: [] }, { status: 400 });
  }

  const cutoff = matchHistoryCutoff();
  try {
    const raw: unknown[] = [];
    for (const seed of seeds) {
      const matches = await fetchSeedMatches(seed, env.HENRIK_API_KEY, cutoff);
      raw.push(...matches);
    }
    const matches = toQualifyingMatches(raw, roster);
    return json({ ok: true, matches, seedCalls: seeds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : '전적 조회 실패';
    return json({ ok: false, error: message, matches: [] }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/auth/login') {
      return handleAuthLogin(request, env);
    }
    if (path === '/api/roster') {
      return handleRoster(request, env);
    }
    if (path === '/api/matches/import') {
      return handleMatchImport(request, env);
    }
    if (path === '/api/join' || path.startsWith('/api/join/')) {
      return handleJoin(request, env, path);
    }
    return env.ASSETS.fetch(request);
  },
};
