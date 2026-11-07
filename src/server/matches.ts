import { Env, SeedIdentity, RosterIdentity, QualifyingMatch } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { normalizeRiotPart, riotKey } from './identity';

/** 시드당 기존 조회 개수를 유지한다. */
const PAGE_SIZE = 15;

/** 가장 최근 8월 1일 0시부터 */
function matchHistoryCutoff(now = Date.now()) {
  const date = new Date(now);
  const seasonYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(seasonYear, 7, 1, 0, 0, 0, 0).getTime();
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

type SeedFetchResult = { ok: true; matches: unknown[] } | { ok: false; reason: string };

/** 닉네임#태그가 틀리거나 API 오류여도 전체 동기화를 막지 않는다. */
async function fetchSeedMatches(
  seed: SeedIdentity,
  apiKey: string,
  cutoff: number
): Promise<SeedFetchResult> {
  const label = `${seed.riotName}#${seed.riotTag}`;
  try {
    const url =
      `https://api.henrikdev.xyz/valorant/v4/matches/kr/pc/` +
      `${encodeURIComponent(seed.riotName)}/${encodeURIComponent(seed.riotTag)}` +
      `?size=${PAGE_SIZE}&start=0&queue=custom`;

    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      if (response.status === 404) {
        return { ok: false, reason: `${label} 전적 없음(닉네임 확인)` };
      }
      return { ok: false, reason: `${label} 조회 실패(${response.status})` };
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
    return { ok: true, matches: collected };
  } catch (error) {
    const message = error instanceof Error ? error.message : '조회 실패';
    return { ok: false, reason: `${label} ${message}` };
  }
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

export async function handleMatchImport(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  const denied = await requireStreamer(request, env);
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
    .slice(0, 1);
  const roster = (body.roster ?? []).filter((item) => item?.id && item?.riotName?.trim() && item?.riotTag?.trim());

  if (seeds.length === 0) {
    return json({ ok: false, error: '시드가 필요합니다.', matches: [] }, { status: 400 });
  }
  if (roster.length === 0) {
    return json({ ok: false, error: '닉네임#태그가 등록된 명단이 필요합니다.', matches: [] }, { status: 400 });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const rateKey = 'match-import:' + ip;
  const last = await env.ROSTER.get(rateKey, 'json');
  if (typeof last === 'number' && Date.now() - last < 10000) return json({ ok: false, error: '전적 조회 후 10초 뒤 다시 시도하세요.', matches: [] }, { status: 429 });
  await env.ROSTER.put(rateKey, JSON.stringify(Date.now()), { expirationTtl: 60 });
  const cutoff = matchHistoryCutoff();
  const raw: unknown[] = [];
  const skippedSeeds: string[] = [];
  let seedOk = 0;
  for (const seed of seeds) {
    const result = await fetchSeedMatches(seed, env.HENRIK_API_KEY, cutoff);
    if (result.ok) {
      seedOk += 1;
      raw.push(...result.matches);
    } else {
      skippedSeeds.push(result.reason);
    }
  }
  if (seedOk === 0) {
    return json(
      {
        ok: false,
        error: skippedSeeds[0] || '시드 전적을 가져오지 못했습니다. 닉네임#태그를 확인하세요.',
        matches: [],
        skippedSeeds,
      },
      { status: 502 }
    );
  }
  const matches = toQualifyingMatches(raw, roster);
  return json({
    ok: true,
    matches,
    seedCalls: seedOk,
    ...(skippedSeeds.length > 0 ? { skippedSeeds } : {}),
  });
}

