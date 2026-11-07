import { Env, JoinApplication, JoinQueuePayload, RosterPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { ROSTER_KEY } from './roster';
import { DEFAULT_RATING as DEFAULT_TIER } from '../constants/game';
import { riotKey } from './identity';
import { fetchRiotRatings } from './mmr';
import { isViewerJoinOpen } from './siteSettingsStore';

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
  playerId?: string;
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
  const revision = typeof stored?.revision === 'number' && stored.revision >= 0 ? stored.revision : 0;
  return { nextNo, items, revision };
}

async function writeJoinQueue(env: Env, payload: JoinQueuePayload) {
  await env.ROSTER.put(
    JOIN_KEY,
    JSON.stringify({
      nextNo: payload.nextNo,
      items: payload.items,
      revision: payload.revision ?? 0,
    })
  );
}

const JOIN_LOCK_KEY = 'join-queue-lock';
const JOIN_LOCK_TTL_MS = 12_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** KV는 원자적 CAS가 없어, 토큰 락 + 즉시 read/write로 덮어쓰기 레이스를 줄인다. */
async function withJoinQueueLock<T>(env: Env, fn: () => Promise<T>): Promise<T | { lockFailed: true }> {
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 30; attempt++) {
    const now = Date.now();
    const lock = (await env.ROSTER.get(JOIN_LOCK_KEY, 'json')) as { at?: number; token?: string } | null;
    const held = typeof lock?.at === 'number' && lock.at > 0 && now - lock.at < JOIN_LOCK_TTL_MS;
    if (!held) {
      await env.ROSTER.put(JOIN_LOCK_KEY, JSON.stringify({ at: now, token }));
      try {
        return await fn();
      } finally {
        const current = (await env.ROSTER.get(JOIN_LOCK_KEY, 'json')) as { token?: string } | null;
        if (current?.token === token) {
          await env.ROSTER.put(JOIN_LOCK_KEY, JSON.stringify({ at: 0 }));
        }
      }
    }
    await sleep(40 + Math.floor(Math.random() * 80));
  }
  return { lockFailed: true };
}

function isLockFailed<T>(value: T | { lockFailed: true }): value is { lockFailed: true } {
  return Boolean(value && typeof value === 'object' && 'lockFailed' in value && value.lockFailed);
}

async function commitJoinQueue(
  env: Env,
  expectedRevision: number,
  next: Omit<JoinQueuePayload, 'revision'> & { revision?: number }
): Promise<boolean> {
  const fresh = await readJoinQueue(env);
  if (fresh.revision !== expectedRevision) return false;
  await writeJoinQueue(env, {
    nextNo: next.nextNo,
    items: next.items,
    revision: expectedRevision + 1,
  });
  return true;
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
    lockedTeam:
      saved.lockedTeam === 'TEAM_1' || saved.lockedTeam === 'TEAM_2'
        ? saved.lockedTeam
        : saved.lockedTeam === 'MATCH' || saved.lockedTeam === 'WAITLIST'
          ? 'MATCH'
          : null,
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
    if (!(await isViewerJoinOpen(env))) {
      return json({ ok: false, error: '지금은 참가 신청을 받지 않습니다.' }, { status: 403 });
    }
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
    return json({ ok: false, error: '발로란트 닉네임과 태그를 입력하세요.' }, { status: 400 });
  }

  const nameKey = name.normalize('NFC').toLowerCase();
  const tagKey = riotKey(riotName, riotTag);

  const locked = await withJoinQueueLock(env, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
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
        const committed = await commitJoinQueue(env, queue.revision ?? 0, {
          nextNo: queue.nextNo + 1,
          items: [...queue.items, application],
        });
        if (!committed) continue;
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
          (item) =>
            typeof item.name === 'string' && item.name.normalize('NFC').toLowerCase() === nameKey
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
        return json({ ok: false, error: '같은 발로란트 닉네임#태그가 이미 있습니다.' }, { status: 409 });
      }

      const application: JoinApplication = {
        id: crypto.randomUUID(),
        name,
        riotName,
        riotTag,
        queueNo: queue.nextNo,
        createdAt: Date.now(),
      };
      const committed = await commitJoinQueue(env, queue.revision ?? 0, {
        nextNo: queue.nextNo + 1,
        items: [...queue.items, application],
      });
      if (!committed) continue;
      await writeJoinStatus(env, application.id, {
        status: 'pending',
        queueNo: application.queueNo,
        name: application.name,
        auto: false,
        updatedAt: Date.now(),
      });
      return json({ ok: true, application, autoJoined: false });
    }
    return json({ ok: false, error: '신청 처리가 잠시 충돌했습니다. 다시 시도하세요.' }, { status: 409 });
  });
  if (isLockFailed(locked)) {
    return json({ ok: false, error: '신청 처리가 잠시 바쁩니다. 다시 시도하세요.' }, { status: 409 });
  }
  return locked;
}

async function requeueApplication(env: Env, application: JoinApplication) {
  await withJoinQueueLock(env, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const queue = await readJoinQueue(env);
      if (queue.items.some((item) => item.id === application.id)) return true;
      const committed = await commitJoinQueue(env, queue.revision ?? 0, {
        nextNo: Math.max(queue.nextNo, application.queueNo + 1),
        items: [...queue.items, application],
      });
      if (committed) return true;
    }
    return false;
  });
}

async function buildApprovedResponse(
  env: Env,
  application: JoinApplication,
  mmr: 'ok' | 'fallback',
  currentTier: typeof DEFAULT_TIER,
  maxTier: typeof DEFAULT_TIER
) {
  const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
  const tagKey = riotKey(application.riotName, application.riotTag);
  const found = players.find(
    (item) =>
      typeof item.riotName === 'string' &&
      typeof item.riotTag === 'string' &&
      riotKey(item.riotName, item.riotTag) === tagKey
  );

  const playerId =
    found && typeof found.id === 'string' ? found.id : crypto.randomUUID();
  const saved = {
    id: playerId,
    name: application.name,
    currentTier: found?.currentTier ?? currentTier,
    maxTier: found?.maxTier ?? maxTier,
    riotName: application.riotName,
    riotTag: application.riotTag,
    wins: typeof found?.wins === 'number' ? found.wins : 0,
    losses: typeof found?.losses === 'number' ? found.losses : 0,
    streak: typeof found?.streak === 'number' ? found.streak : 0,
  };
  if (!found) {
    saved.currentTier = currentTier;
    saved.maxTier = maxTier;
  }
  const nextPlayers = [...players.filter((item) => item.id !== playerId), saved];
  const updatedAt = Date.now();

  try {
    await env.ROSTER.put(ROSTER_KEY, JSON.stringify({ updatedAt, players: nextPlayers }));
  } catch {
    await requeueApplication(env, application);
    return json({ ok: false, error: '명단 저장에 실패했습니다.' }, { status: 500 });
  }

  await writeJoinStatus(env, application.id, {
    status: 'approved',
    queueNo: application.queueNo,
    name: application.name,
    auto: false,
    playerId,
    updatedAt: Date.now(),
  });

  const freshQueue = await readJoinQueue(env);
  return json({
    ok: true,
    player: {
      ...saved,
      maxTier: saved.maxTier,
      canOrder: false,
      restrictions: [],
      lockedTeam: null,
      rivalIds: [],
      allyIds: [],
      queueNo: application.queueNo,
    },
    roster: { updatedAt, players: nextPlayers },
    mmr,
    items: freshQueue.items,
  });
}

async function replayApprovedJoin(env: Env, id: string): Promise<Response | null> {
  const prior = await readJoinStatus(env, id);
  if (prior?.status !== 'approved') return null;
  const queue = await readJoinQueue(env);
  const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
  const saved =
    (prior.playerId && players.find((item) => item.id === prior.playerId)) ||
    (prior.name &&
      players.find(
        (item) =>
          typeof item.name === 'string' &&
          item.name.normalize('NFC').toLowerCase() === prior.name!.normalize('NFC').toLowerCase()
      )) ||
    null;
  if (!saved) return null;
  return json({
    ok: true,
    player: toSessionPlayer(saved, prior.queueNo ?? 0),
    roster: {
      updatedAt: typeof existing?.updatedAt === 'number' ? existing.updatedAt : Date.now(),
      players,
    },
    mmr: 'fallback' as const,
    items: queue.items,
    replayed: true,
  });
}

async function approveJoin(env: Env, id: string): Promise<Response> {
  const replayed = await replayApprovedJoin(env, id);
  if (replayed) return replayed;

  // 큐에서 먼저 제거(느린 MMR 전에) — 더블클릭·동시 승인 차단. 명단 실패 시 재삽입.
  const taken = await withJoinQueueLock(env, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const queue = await readJoinQueue(env);
      const application = queue.items.find((item) => item.id === id);
      if (!application) {
        return { kind: 'missing' as const, remaining: queue.items };
      }
      if (application.auto) {
        return { kind: 'auto' as const };
      }
      const remaining = queue.items.filter((item) => item.id !== id);
      const committed = await commitJoinQueue(env, queue.revision ?? 0, {
        nextNo: queue.nextNo,
        items: remaining,
      });
      if (!committed) continue;
      return { kind: 'taken' as const, application };
    }
    return { kind: 'busy' as const };
  });

  if (isLockFailed(taken)) {
    return json({ ok: false, error: '승인 처리가 잠시 바쁩니다. 다시 시도하세요.' }, { status: 409 });
  }
  if (taken.kind === 'auto') {
    return json({ ok: false, error: '기존 시청자 합류는 승인이 필요 없습니다.' }, { status: 400 });
  }
  if (taken.kind === 'busy') {
    return json({ ok: false, error: '승인 처리가 잠시 충돌했습니다. 다시 시도하세요.' }, { status: 409 });
  }
  if (taken.kind === 'missing') {
    const again = await replayApprovedJoin(env, id);
    if (again) return again;
    return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { application } = taken;
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

  return buildApprovedResponse(env, application, mmr, currentTier, maxTier);
}

async function claimAutoJoin(env: Env, id: string): Promise<Response> {
  const prior = await readJoinStatus(env, id);
  if (prior?.status === 'joined' && prior.playerId) {
    const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
    const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
    const saved = players.find((item) => item.id === prior.playerId);
    const queue = await readJoinQueue(env);
    if (saved) {
      return json({
        ok: true,
        player: toSessionPlayer(saved, prior.queueNo ?? 0),
        items: queue.items,
        replayed: true,
      });
    }
  }

  const locked = await withJoinQueueLock(env, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const queue = await readJoinQueue(env);
      const application = queue.items.find((item) => item.id === id);
      if (!application || !application.auto || !application.playerId) {
        return json({ ok: false, error: '자동 합류 신청을 찾을 수 없습니다.' }, { status: 404 });
      }

      const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
      const players = asSavedPlayers(Array.isArray(existing?.players) ? existing!.players : []);
      const saved = players.find((item) => item.id === application.playerId);
      const remaining = queue.items.filter((item) => item.id !== id);

      if (!saved) {
        const committed = await commitJoinQueue(env, queue.revision ?? 0, {
          nextNo: queue.nextNo,
          items: remaining,
        });
        if (!committed) continue;
        await writeJoinStatus(env, application.id, {
          status: 'cancelled',
          queueNo: application.queueNo,
          name: application.name,
          auto: true,
          updatedAt: Date.now(),
        });
        return json(
          { ok: false, error: '명단에서 플레이어를 찾을 수 없습니다.', items: remaining },
          { status: 404 }
        );
      }

      const committed = await commitJoinQueue(env, queue.revision ?? 0, {
        nextNo: queue.nextNo,
        items: remaining,
      });
      if (!committed) continue;
      await writeJoinStatus(env, application.id, {
        status: 'joined',
        queueNo: application.queueNo,
        name: application.name,
        auto: true,
        playerId: application.playerId,
        updatedAt: Date.now(),
      });

      return json({
        ok: true,
        player: toSessionPlayer(saved, application.queueNo),
        items: remaining,
      });
    }
    return json({ ok: false, error: '합류 처리가 잠시 충돌했습니다. 다시 시도하세요.' }, { status: 409 });
  });
  if (isLockFailed(locked)) {
    return json({ ok: false, error: '합류 처리가 잠시 바쁩니다. 다시 시도하세요.' }, { status: 409 });
  }
  return locked;
}

async function rejectJoin(env: Env, id: string): Promise<Response> {
  const locked = await withJoinQueueLock(env, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const queue = await readJoinQueue(env);
      const target = queue.items.find((item) => item.id === id);
      if (!target) {
        return json({ ok: false, error: '신청을 찾을 수 없습니다.' }, { status: 404 });
      }
      const remaining = queue.items.filter((item) => item.id !== id);
      const committed = await commitJoinQueue(env, queue.revision ?? 0, {
        nextNo: queue.nextNo,
        items: remaining,
      });
      if (!committed) continue;
      await writeJoinStatus(env, id, {
        status: 'rejected',
        queueNo: target.queueNo,
        name: target.name,
        auto: Boolean(target.auto),
        updatedAt: Date.now(),
      });
      return json({ ok: true, items: remaining });
    }
    return json({ ok: false, error: '거절 처리가 잠시 충돌했습니다. 다시 시도하세요.' }, { status: 409 });
  });
  if (isLockFailed(locked)) {
    return json({ ok: false, error: '거절 처리가 잠시 바쁩니다. 다시 시도하세요.' }, { status: 409 });
  }
  return locked;
}
