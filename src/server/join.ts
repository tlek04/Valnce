import { Env, JoinApplication, JoinQueuePayload, RosterPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { ROSTER_KEY } from './roster';
import { DEFAULT_RATING as DEFAULT_TIER } from '../constants/game';
import { riotKey } from './identity';

const JOIN_KEY = 'join-queue';

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

    const application: JoinApplication = {
      id: crypto.randomUUID(),
      name: typeof existingByRiot.name === 'string' ? existingByRiot.name : name,
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
  const remaining = queue.items.filter((item) => item.id !== id);
  await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });

  const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
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
  await env.ROSTER.put(ROSTER_KEY, JSON.stringify({ updatedAt, players: nextPlayers }));

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

async function claimAutoJoin(env: Env, id: string): Promise<Response> {
  const queue = await readJoinQueue(env);
  const application = queue.items.find((item) => item.id === id);
  if (!application || !application.auto || !application.playerId) {
    return json({ ok: false, error: '자동 합류 신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const remaining = queue.items.filter((item) => item.id !== id);
  await writeJoinQueue(env, { nextNo: queue.nextNo, items: remaining });

  const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
  const saved = players.find((item) => item.id === application.playerId);
  if (!saved) {
    return json({ ok: false, error: '명단에서 플레이어를 찾을 수 없습니다.' }, { status: 404 });
  }

  return json({
    ok: true,
    player: toSessionPlayer(saved, application.queueNo),
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
