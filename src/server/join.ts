import { Env, JoinApplication, JoinQueuePayload, RosterPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { ROSTER_KEY } from './roster';
import { DEFAULT_RATING as DEFAULT_TIER } from '../constants/game';
import { riotKey } from './identity';
import { fetchRiotRatings } from './mmr';

const JOIN_KEY = 'join-queue';
const JOIN_STATUS_PREFIX = 'join-status:';
const JOIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const JOIN_RATE_MAX = 12;

type JoinStatusState = 'pending' | 'approved' | 'rejected' | 'joined' | 'cancelled';

interface JoinStatusRecord {
  status: JoinStatusState;
  queueNo?: number;
  name?: string;
  auto?: boolean;
  updatedAt: number;
}

function clientIp(request: Request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local'
  );
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

async function writeJoinStatus(env: Env, id: string, record: JoinStatusRecord) {
  await env.ROSTER.put(`${JOIN_STATUS_PREFIX}${id}`, JSON.stringify(record));
}

async function readJoinStatus(env: Env, id: string): Promise<JoinStatusRecord | null> {
  return (await env.ROSTER.get(`${JOIN_STATUS_PREFIX}${id}`, 'json')) as JoinStatusRecord | null;
}

async function checkJoinRateLimit(env: Env, ip: string): Promise<Response | null> {
  const key = `auth:join:${ip}`;
  const now = Date.now();
  const stored = (await env.ROSTER.get(key, 'json')) as { count?: number; resetAt?: number } | null;
  let count = 0;
  let resetAt = now + JOIN_RATE_WINDOW_MS;
  if (stored && typeof stored.resetAt === 'number' && stored.resetAt > now) {
    count = typeof stored.count === 'number' ? stored.count : 0;
    resetAt = stored.resetAt;
  }
  if (count >= JOIN_RATE_MAX) {
    return json({ ok: false, error: '신청이 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 });
  }
  await env.ROSTER.put(key, JSON.stringify({ count: count + 1, resetAt }));
  return null;
}

function asSavedPlayers(raw: unknown[]): Record<string, unknown>[] {
  return raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function toSessionPlayer(saved: Record<string, unknown>, queueNo: number) {
  return {
    id: typeof saved.id === 'string' ? saved.id : crypto.randomUUID(),
    name: typeof saved.name === 'string' ? saved.name : '플레이어',
    currentTier: saved.currentTier ?? DEFAULT_TIER,
    maxTier: saved.maxTier ?? saved.currentTier ?? DEFAULT_TIER,
    ...(saved.internalTier ? { internalTier: saved.internalTier } : {}),
    canOrder: Boolean(saved.canOrder),
    restrictions: Array.isArray(saved.restrictions) ? saved.restrictions : [],
    lockedTeam: saved.lockedTeam === 'TEAM_1' || saved.lockedTeam === 'TEAM_2' ? saved.lockedTeam : null,
    rivalIds: Array.isArray(saved.rivalIds) ? saved.rivalIds : [],
    allyIds: Array.isArray(saved.allyIds) ? saved.allyIds : [],
    riotName: typeof saved.riotName === 'string' ? saved.riotName : '',
    riotTag: typeof saved.riotTag === 'string' ? saved.riotTag : '',
    matchSeed: Boolean(saved.matchSeed),
    queueNo,
    wins: typeof saved.wins === 'number' ? saved.wins : 0,
    losses: typeof saved.losses === 'number' ? saved.losses : 0,
    streak: typeof saved.streak === 'number' ? saved.streak : 0,
  };
}

export async function handleJoin(request: Request, env: Env, path: string): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  const statusMatch = path.match(/^\/api\/join\/status\/([^/]+)$/);
  if (statusMatch && request.method === 'GET') {
    const id = decodeURIComponent(statusMatch[1]);
    const record = await readJoinStatus(env, id);
    if (!record) {
      const queue = await readJoinQueue(env);
      const item = queue.items.find((row) => row.id === id);
      if (item) {
        return json({
          ok: true,
          status: 'pending' as JoinStatusState,
          queueNo: item.queueNo,
          name: item.name,
          auto: Boolean(item.auto),
        });
      }
      return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
    }
    return json({
      ok: true,
      status: record.status,
      queueNo: record.queueNo,
      name: record.name,
      auto: record.auto,
    });
  }

  const approveMatch = path.match(/^\/api\/join\/([^/]+)\/approve$/);
  const rejectMatch = path.match(/^\/api\/join\/([^/]+)\/reject$/);
  const claimMatch = path.match(/^\/api\/join\/([^/]+)\/claim$/);

  if (approveMatch && request.method === 'POST') {
    const denied = await requireStreamer(request, env);
    if (denied) return denied;
    return approveJoin(env, decodeURIComponent(approveMatch[1]));
  }

  if (rejectMatch && request.method === 'POST') {
    const denied = await requireStreamer(request, env);
    if (denied) return denied;
    return rejectJoin(env, decodeURIComponent(rejectMatch[1]));
  }

  if (claimMatch && request.method === 'POST') {
    const denied = await requireStreamer(request, env);
    if (denied) return denied;
    return claimAutoJoin(env, decodeURIComponent(claimMatch[1]));
  }

  if (path !== '/api/join') {
    return json({ error: 'Not found' }, { status: 404 });
  }

  if (request.method === 'GET') {
    const denied = await requireStreamer(request, env);
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
  const limited = await checkJoinRateLimit(env, clientIp(request));
  if (limited) return limited;

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
  const roster = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const rosterPlayers = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);

  const existingByRiot = rosterPlayers.find(
    (item) =>
      typeof item.riotName === 'string' &&
      typeof item.riotTag === 'string' &&
      riotKey(item.riotName, item.riotTag) === tagKey
  );

  if (existingByRiot && typeof existingByRiot.id === 'string') {
    const alreadyQueued = queue.items.some(
      (item) =>
        item.auto &&
        (item.playerId === existingByRiot.id || riotKey(item.riotName, item.riotTag) === tagKey)
    );
    if (alreadyQueued) {
      return json({ ok: false, error: '이미 대기열 합류 요청이 있습니다.' }, { status: 409 });
    }

    // 치지직 닉이 바뀌었으면 명단에 반영
    const prevName = typeof existingByRiot.name === 'string' ? existingByRiot.name : '';
    if (prevName.normalize('NFC').toLowerCase() !== nameKey) {
      const updatedAt = Date.now();
      const nextPlayers = rosterPlayers.map((item) =>
        item.id === existingByRiot.id ? { ...item, name } : item
      );
      await env.ROSTER.put(ROSTER_KEY, JSON.stringify({ updatedAt, players: nextPlayers }));
    }

    const application: JoinApplication = {
      id: crypto.randomUUID(),
      name,
      riotName: typeof existingByRiot.riotName === 'string' ? existingByRiot.riotName : riotName,
      riotTag: typeof existingByRiot.riotTag === 'string' ? existingByRiot.riotTag : riotTag,
      queueNo: queue.nextNo,
      createdAt: Date.now(),
      auto: true,
      playerId: existingByRiot.id,
    };
    await writeJoinQueue(env, {
      nextNo: queue.nextNo + 1,
      items: [...queue.items, application],
    });
    await writeJoinStatus(env, application.id, {
      status: 'pending',
      queueNo: application.queueNo,
      name: application.name,
      auto: true,
      updatedAt: Date.now(),
    });
    return json({ ok: true, application, autoJoined: true });
  }

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
  await writeJoinStatus(env, application.id, {
    status: 'pending',
    queueNo: application.queueNo,
    name: application.name,
    auto: false,
    updatedAt: Date.now(),
  });
  return json({ ok: true, application, autoJoined: false });
}

async function approveJoin(env: Env, id: string): Promise<Response> {
  const queue = await readJoinQueue(env);
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) {
    return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  const application = queue.items[index];
  if (application.auto) {
    return json({ ok: false, error: '기존 시청자 합류는 승인이 필요 없습니다.' }, { status: 400 });
  }

  let currentTier = DEFAULT_TIER;
  let maxTier = DEFAULT_TIER;
  let mmr: 'ok' | 'fallback' = 'fallback';
  if (env.HENRIK_API_KEY) {
    try {
      const ratings = await fetchRiotRatings(
        application.riotName,
        application.riotTag,
        env.HENRIK_API_KEY
      );
      if (ratings) {
        currentTier = ratings.currentTier;
        maxTier = ratings.maxTier;
        mmr = 'ok';
      }
    } catch {
      /* keep defaults */
    }
  }

  const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
  const playerId = crypto.randomUUID();
  const saved = {
    id: playerId,
    name: application.name,
    currentTier,
    maxTier,
    riotName: application.riotName,
    riotTag: application.riotTag,
    queueNo: application.queueNo,
    wins: 0,
    losses: 0,
    streak: 0,
  };
  const nextPlayers = [...players.filter((item) => item.id !== playerId), saved];
  const updatedAt = Date.now();

  try {
    await env.ROSTER.put(ROSTER_KEY, JSON.stringify({ updatedAt, players: nextPlayers }));
  } catch {
    return json({ ok: false, error: '명단 저장에 실패했습니다.' }, { status: 500 });
  }

  // 승인 시 대기열 순번은 재정렬하지 않음(신청 시 받은 번호 유지). 거절 때만 재번호.
  const remaining = queue.items.filter((item) => item.id !== id);
  await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });
  await writeJoinStatus(env, application.id, {
    status: 'approved',
    queueNo: application.queueNo,
    name: application.name,
    auto: false,
    updatedAt: Date.now(),
  });

  const sessionPlayer = {
    ...saved,
    maxTier,
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
    mmr,
    items: remaining,
  });
}

async function claimAutoJoin(env: Env, id: string): Promise<Response> {
  const queue = await readJoinQueue(env);
  const application = queue.items.find((item) => item.id === id);
  if (!application || !application.auto || !application.playerId) {
    return json({ ok: false, error: '자동 합류 신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
  const saved = players.find((item) => item.id === application.playerId);

  if (!saved) {
    const remaining = queue.items.filter((item) => item.id !== id);
    await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });
    await writeJoinStatus(env, application.id, {
      status: 'cancelled',
      queueNo: application.queueNo,
      name: application.name,
      auto: true,
      updatedAt: Date.now(),
    });
    return json({ ok: false, error: '명단에서 플레이어를 찾을 수 없습니다.', items: remaining }, { status: 404 });
  }

  const remaining = queue.items.filter((item) => item.id !== id);
  await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });
  await writeJoinStatus(env, application.id, {
    status: 'joined',
    queueNo: application.queueNo,
    name: application.name,
    auto: true,
    updatedAt: Date.now(),
  });

  return json({
    ok: true,
    player: toSessionPlayer(saved, application.queueNo),
    items: remaining,
  });
}

async function rejectJoin(env: Env, id: string): Promise<Response> {
  const queue = await readJoinQueue(env);
  const target = queue.items.find((item) => item.id === id);
  if (!target) {
    return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }
  // 거절해도 재번호하지 않음. nextNo는 줄이지 않아 보드·신청 순번 중복을 막는다.
  const remaining = queue.items.filter((item) => item.id !== id);
  await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });
  await writeJoinStatus(env, id, {
    status: 'rejected',
    queueNo: target.queueNo,
    name: target.name,
    auto: Boolean(target.auto),
    updatedAt: Date.now(),
  });
  return json({ ok: true, items: remaining });
}
