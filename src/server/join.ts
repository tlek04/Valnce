import { Env, JoinApplication, JoinQueuePayload, RosterPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { BOARD_KEY, boardSeats, readSharedBoard } from './board';
import { ROSTER_KEY } from './roster';
import { BOARD_TTL_SECONDS, DEFAULT_RATING as DEFAULT_TIER } from '../constants/game';
import { riotKey } from './identity';
import { fetchRiotRatings } from './mmr';
import { isViewerJoinOpen } from './siteSettingsStore';
import {
  JOIN_QUEUE_MAX,
  checkJoinGlobalRateLimit,
  checkJoinIdentityCooldown,
  checkJoinIpRateLimit,
  markJoinIdentityCooldown,
} from './joinGuards';

const JOIN_KEY = 'join-queue';
const JOIN_STATUS_PREFIX = 'join-status:';

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
  const items = Array.isArray(stored?.items) ? stored.items.filter(item => item && item.createdAt > Date.now() - 7 * 86400000) : [];
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

/** The ApplicationState coordinator serializes requests and atomically commits their writes. */
async function withJoinQueueLock<T>(_env: Env, fn: () => Promise<T>): Promise<T | { lockFailed: true }> {
  return fn();
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
  await env.ROSTER.put(`${JOIN_STATUS_PREFIX}${id}`, JSON.stringify(record), { expirationTtl: 7 * 86400 });
}

async function readJoinStatus(env: Env, id: string): Promise<JoinStatusRecord | null> {
  return (await env.ROSTER.get(`${JOIN_STATUS_PREFIX}${id}`, 'json')) as JoinStatusRecord | null;
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
    playAts: Array.isArray(saved.playAts)
      ? saved.playAts.filter((item): item is number => typeof item === 'number')
      : [],
    playCount: typeof saved.playCount === 'number' && saved.playCount > 0 ? Math.floor(saved.playCount) : 0,
    checkIn: 'ready' as const,
  };
}

function readViewerCookie(request: Request): string | null {
  return (
    request.headers.get('Cookie')?.match(/(?:^|;\s*)valnce-viewer=([a-zA-Z0-9-]{20,100})(?:;|$)/)?.[1] ??
    null
  );
}

type BoardSeat = {
  id?: unknown;
  name?: unknown;
  riotName?: unknown;
  riotTag?: unknown;
  checkIn?: unknown;
};

function seatRiotKey(seat: BoardSeat): string {
  const riotName = typeof seat.riotName === 'string' ? seat.riotName : '';
  const riotTag = typeof seat.riotTag === 'string' ? seat.riotTag : '';
  return riotKey(riotName, riotTag);
}

function findSeatByTagKey(seats: unknown[], tagKey: string): BoardSeat | null {
  if (!tagKey) return null;
  for (const raw of seats) {
    if (!raw || typeof raw !== 'object') continue;
    const seat = raw as BoardSeat;
    if (seatRiotKey(seat) === tagKey) return seat;
  }
  return null;
}

function parseCheckIn(value: unknown): 'ready' | 'away' | null {
  if (value === 'ready' || value === 'away') return value;
  return null;
}

async function resolveViewerTagKey(env: Env, request: Request): Promise<string | null> {
  const cookie = readViewerCookie(request);
  if (!cookie) return null;
  const approved = await env.ROSTER.get('viewer-approved:' + cookie, 'json');
  return typeof approved === 'string' && approved.includes('#') ? approved : null;
}

async function writeSharedBoard(env: Pick<Env, 'ROSTER'>, board: Awaited<ReturnType<typeof readSharedBoard>>) {
  await env.ROSTER.put(BOARD_KEY, JSON.stringify(board), { expirationTtl: BOARD_TTL_SECONDS });
}

async function handleJoinPresence(request: Request, env: Env): Promise<Response> {
  const tagKey = await resolveViewerTagKey(env, request);
  if (!tagKey) {
    return json({ ok: true, onBoard: false, checkIn: null, checkInOpen: false });
  }
  const board = await readSharedBoard(env);
  const seats = boardSeats(board);
  const seat = findSeatByTagKey(seats, tagKey);
  if (!seat) {
    return json({ ok: true, onBoard: false, checkIn: null, checkInOpen: false });
  }
  const checkInOpen = seats.some((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    return (raw as BoardSeat).checkIn === null;
  });
  return json({
    ok: true,
    onBoard: true,
    checkIn: parseCheckIn(seat.checkIn),
    checkInOpen,
    name: typeof seat.name === 'string' ? seat.name : undefined,
  });
}

export async function applyBoardCheckIn(
  env: Pick<Env, 'ROSTER'>,
  seatId: string,
  ready: boolean
): Promise<{ ok: true; checkIn: 'ready' | 'away' } | { ok: false; status: number; error: string }> {
  const board = await readSharedBoard(env);
  const seats = boardSeats(board);
  const seat = seats.find((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    return (raw as BoardSeat).id === seatId;
  }) as BoardSeat | undefined;
  if (!seat || typeof seat.id !== 'string') {
    return {
      ok: false,
      status: 404,
      error: '보드에 없습니다. 참가 신청으로 대기열에 오른 뒤 출석해 주세요.',
    };
  }

  const checkIn = ready ? ('ready' as const) : ('away' as const);
  const patchList = (list: unknown[]) =>
    list.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const row = raw as BoardSeat & Record<string, unknown>;
      if (row.id !== seatId) return raw;
      return { ...row, checkIn };
    });

  const next = {
    ...board,
    waitlist: patchList(board.waitlist),
    team1: patchList(board.team1),
    team2: patchList(board.team2),
    updatedAt: Math.max(Date.now(), board.updatedAt + 1),
  };
  await writeSharedBoard(env, next);
  return { ok: true, checkIn };
}

export function findSeatByNameKey(seats: unknown[], nameKey: string): BoardSeat | null {
  if (!nameKey) return null;
  for (const raw of seats) {
    if (!raw || typeof raw !== 'object') continue;
    const seat = raw as BoardSeat;
    if (typeof seat.name === 'string' && seat.name.normalize('NFC').toLowerCase() === nameKey) {
      return seat;
    }
  }
  return null;
}

export { findSeatByTagKey, parseCheckIn };

async function handleJoinCheckIn(request: Request, env: Env): Promise<Response> {
  const tagKey = await resolveViewerTagKey(env, request);
  if (!tagKey) {
    return json({ ok: false, error: '승인된 시청자 세션이 없습니다. 다시 참가 신청해 주세요.' }, { status: 401 });
  }

  let body: { ready?: boolean };
  try {
    body = (await request.json()) as { ready?: boolean };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }
  if (typeof body.ready !== 'boolean') {
    return json({ ok: false, error: 'ready 값이 필요합니다.' }, { status: 400 });
  }

  const board = await readSharedBoard(env);
  const seats = boardSeats(board);
  const seat = findSeatByTagKey(seats, tagKey);
  if (!seat || typeof seat.id !== 'string') {
    return json(
      { ok: false, error: '보드에 없습니다. 참가 신청으로 대기열에 오른 뒤 출석해 주세요.' },
      { status: 404 }
    );
  }

  const result = await applyBoardCheckIn(env, seat.id, body.ready);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, { status: result.status });
  }
  return json({ ok: true, checkIn: result.checkIn, onBoard: true });
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

  if (path === '/api/join/presence' && request.method === 'GET') {
    return handleJoinPresence(request, env);
  }

  if (path === '/api/join/check-in' && request.method === 'POST') {
    return handleJoinCheckIn(request, env);
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

export async function enqueueJoin(request: Request, env: Env): Promise<Response> {
  let body: { name?: string; riotName?: string; riotTag?: string; canOrder?: boolean };
  try {
    body = (await request.json()) as {
      name?: string;
      riotName?: string;
      riotTag?: string;
      canOrder?: boolean;
    };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const riotName = (body.riotName ?? '').trim().replace(/^#+/, '');
  const riotTag = (body.riotTag ?? '').trim().replace(/^#+/, '');
  const canOrder = Boolean(body.canOrder);
  if (!name) return json({ ok: false, error: '치지직 닉네임을 입력하세요.' }, { status: 400 });
  if (!riotName || !riotTag) {
    return json({ ok: false, error: '발로란트 닉네임과 태그를 입력하세요.' }, { status: 400 });
  }

  const nameKey = name.normalize('NFC').toLowerCase();
  const tagKey = riotKey(riotName, riotTag);

  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)valnce-viewer=([a-zA-Z0-9-]{20,100})(?:;|$)/)?.[1];
  const viewerToken = cookie || crypto.randomUUID();
  const approvedIdentity = cookie ? await env.ROSTER.get('viewer-approved:' + cookie, 'json') : null;
  const approvedReturn = Boolean(cookie && approvedIdentity === tagKey);

  // 승인된 시청자 재합류/출석 복구는 쿨다운에서 제외
  if (!approvedReturn) {
    const identityLimited = await checkJoinIdentityCooldown(env, nameKey, tagKey);
    if (identityLimited) return identityLimited;
  }
  const globalLimited = await checkJoinGlobalRateLimit(env);
  if (globalLimited) return globalLimited;
  const ipLimited = await checkJoinIpRateLimit(env, clientIp(request));
  if (ipLimited) return ipLimited;

  const locked = await withJoinQueueLock(env, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const queue = await readJoinQueue(env);
      const roster = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
      const rosterPlayers = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);
      const seats = boardSeats(await readSharedBoard(env));

      const onBoardAlready = (playerId?: string) =>
        seats.some((raw) => {
          if (!raw || typeof raw !== 'object') return false;
          const seat = raw as {
            id?: unknown;
            name?: unknown;
            riotName?: unknown;
            riotTag?: unknown;
          };
          if (playerId && seat.id === playerId) return true;
          if (
            typeof seat.riotName === 'string' &&
            typeof seat.riotTag === 'string' &&
            riotKey(seat.riotName, seat.riotTag) === tagKey
          ) {
            return true;
          }
          return (
            typeof seat.name === 'string' && seat.name.normalize('NFC').toLowerCase() === nameKey
          );
        });

      const pendingSame = (playerId?: string) =>
        queue.items.some((item) => {
          if (playerId && item.playerId === playerId) return true;
          if (riotKey(item.riotName, item.riotTag) === tagKey) return true;
          return item.name.normalize('NFC').toLowerCase() === nameKey;
        });

      const existingByRiot = rosterPlayers.find(
        (item) =>
          typeof item.riotName === 'string' &&
          typeof item.riotTag === 'string' &&
          riotKey(item.riotName, item.riotTag) === tagKey
      );

      if (existingByRiot && typeof existingByRiot.id === 'string' && approvedIdentity === tagKey) {
        if (onBoardAlready(existingByRiot.id)) {
          const seat = findSeatByTagKey(seats, tagKey);
          return json({
            ok: true,
            alreadyOnBoard: true,
            autoJoined: true,
            name: typeof seat?.name === 'string' ? seat.name : typeof existingByRiot.name === 'string' ? existingByRiot.name : name,
            queueNo:
              seat && typeof (seat as { queueNo?: unknown }).queueNo === 'number'
                ? (seat as { queueNo: number }).queueNo
                : 0,
            checkIn: parseCheckIn(seat?.checkIn),
          });
        }
        if (pendingSame(existingByRiot.id)) {
          await markJoinIdentityCooldown(env, nameKey, tagKey);
          return json(
            { ok: false, error: '이미 대기열 합류 요청이 있습니다.', code: 'duplicate_pending' },
            { status: 409 }
          );
        }

        if (queue.items.length >= JOIN_QUEUE_MAX) {
          return json(
            { ok: false, error: '신청 대기열이 가득 찼습니다.', code: 'queue_full' },
            { status: 429 }
          );
        }
        const application: JoinApplication = {
          id: crypto.randomUUID(),
          name: typeof existingByRiot.name === 'string' ? existingByRiot.name : name,
          riotName: typeof existingByRiot.riotName === 'string' ? existingByRiot.riotName : riotName,
          riotTag: typeof existingByRiot.riotTag === 'string' ? existingByRiot.riotTag : riotTag,
          queueNo: queue.nextNo,
          createdAt: Date.now(),
          ...(canOrder ? { canOrder: true } : {}),
          auto: true,
          playerId: existingByRiot.id,
        };
        const committed = await commitJoinQueue(env, queue.revision ?? 0, {
          nextNo: queue.nextNo + 1,
          items: [...queue.items, application],
        });
        if (!committed) continue;
        await env.ROSTER.put('viewer-application:' + application.id, JSON.stringify(viewerToken), { expirationTtl: 7 * 86400 });
        await writeJoinStatus(env, application.id, {
          status: 'pending',
          queueNo: application.queueNo,
          name: application.name,
          auto: true,
          updatedAt: Date.now(),
        });
        await markJoinIdentityCooldown(env, nameKey, tagKey);
        return json({ ok: true, application, autoJoined: true });
      }

      if (onBoardAlready()) {
        // 승인 쿠키가 있으면 출석 화면 복구용으로 성공 응답
        if (approvedIdentity === tagKey) {
          const seat = findSeatByTagKey(seats, tagKey);
          return json({
            ok: true,
            alreadyOnBoard: true,
            autoJoined: true,
            name: typeof seat?.name === 'string' ? seat.name : name,
            queueNo:
              seat && typeof (seat as { queueNo?: unknown }).queueNo === 'number'
                ? (seat as { queueNo: number }).queueNo
                : 0,
            checkIn: parseCheckIn(seat?.checkIn),
          });
        }
        await markJoinIdentityCooldown(env, nameKey, tagKey);
        return json(
          { ok: false, error: '이미 대기열 또는 경기에 참가 중입니다.', code: 'already_on_board' },
          { status: 409 }
        );
      }

      if (pendingSame()) {
        await markJoinIdentityCooldown(env, nameKey, tagKey);
        return json(
          { ok: false, error: '이미 참가 신청이 대기 중입니다.', code: 'duplicate_pending' },
          { status: 409 }
        );
      }

      const nameTaken =
        queue.items.some((item) => item.name.normalize('NFC').toLowerCase() === nameKey) ||
        rosterPlayers.some(
          (item) =>
            typeof item.name === 'string' && item.name.normalize('NFC').toLowerCase() === nameKey && item !== existingByRiot
        );
      if (nameTaken) {
        await markJoinIdentityCooldown(env, nameKey, tagKey);
        return json(
          { ok: false, error: '같은 치지직 닉네임이 이미 있습니다.', code: 'duplicate_name' },
          { status: 409 }
        );
      }

      const riotTaken =
        queue.items.some((item) => riotKey(item.riotName, item.riotTag) === tagKey) ||
        rosterPlayers.some(
          (item) =>
            typeof item.riotName === 'string' &&
            typeof item.riotTag === 'string' &&
            riotKey(item.riotName, item.riotTag) === tagKey && item !== existingByRiot
        );
      if (riotTaken) {
        await markJoinIdentityCooldown(env, nameKey, tagKey);
        return json(
          { ok: false, error: '같은 발로란트 닉네임#태그가 이미 있습니다.', code: 'duplicate_riot' },
          { status: 409 }
        );
      }

      if (queue.items.length >= JOIN_QUEUE_MAX) {
        return json(
          { ok: false, error: '신청 대기열이 가득 찼습니다.', code: 'queue_full' },
          { status: 429 }
        );
      }
      const application: JoinApplication = {
        id: crypto.randomUUID(),
        name,
        riotName,
        riotTag,
        queueNo: queue.nextNo,
        createdAt: Date.now(),
        ...(canOrder ? { canOrder: true } : {}),
      };
      const committed = await commitJoinQueue(env, queue.revision ?? 0, {
        nextNo: queue.nextNo + 1,
        items: [...queue.items, application],
      });
      if (!committed) continue;
      await env.ROSTER.put('viewer-application:' + application.id, JSON.stringify(viewerToken), { expirationTtl: 7 * 86400 });
      await writeJoinStatus(env, application.id, {
        status: 'pending',
        queueNo: application.queueNo,
        name: application.name,
        auto: false,
        updatedAt: Date.now(),
      });
      await markJoinIdentityCooldown(env, nameKey, tagKey);
      return json({ ok: true, application, autoJoined: false });
    }
    return json({ ok: false, error: '신청 처리가 잠시 충돌했습니다. 다시 시도하세요.' }, { status: 409 });
  });
  if (isLockFailed(locked)) {
    return json({ ok: false, error: '신청 처리가 잠시 바쁩니다. 다시 시도하세요.' }, { status: 409 });
  }
  if (locked.ok) locked.headers.append('Set-Cookie', 'valnce-viewer=' + viewerToken + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000');
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
    playAts: Array.isArray(found?.playAts)
      ? found.playAts.filter((item): item is number => typeof item === 'number')
      : [],
    playCount:
      typeof found?.playCount === 'number' && found.playCount > 0 ? Math.floor(found.playCount) : 0,
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

  const viewerToken = await env.ROSTER.get('viewer-application:' + application.id, 'json');
  if (typeof viewerToken === 'string') await env.ROSTER.put('viewer-approved:' + viewerToken, JSON.stringify(tagKey), { expirationTtl: 30 * 86400 });
  await addApprovedToBoard(env, { ...toSessionPlayer(saved, application.queueNo), canOrder: Boolean(application.canOrder) });
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
      canOrder: Boolean(application.canOrder),
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
      await addApprovedToBoard(env, { ...toSessionPlayer(saved, application.queueNo), canOrder: Boolean(application.canOrder) });
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
        player: {
          ...toSessionPlayer(saved, application.queueNo),
          canOrder: Boolean(application.canOrder) || Boolean(saved.canOrder),
        },
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

async function addApprovedToBoard(env: Env, player: ReturnType<typeof toSessionPlayer>) {
  const board = await readSharedBoard(env);
  const seats = boardSeats(board) as Array<{ id?: string; queueNo?: number }>;
  if (seats.some(row => row.id === player.id)) return;
  const queueNo = Math.max(0, ...seats.map(row => typeof row.queueNo === 'number' ? row.queueNo : 0)) + 1;
  await env.ROSTER.put(BOARD_KEY, JSON.stringify({ ...board, waitlist: [...board.waitlist, { ...player, queueNo }], updatedAt: Math.max(Date.now(), board.updatedAt + 1) }), { expirationTtl: BOARD_TTL_SECONDS });
}
