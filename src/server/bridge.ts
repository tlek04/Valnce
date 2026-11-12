import { Env, RosterPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { boardSeats, readSharedBoard } from './board';
import { ROSTER_KEY } from './roster';
import { riotKey } from './identity';
import { isViewerJoinOpen, readSiteSettings } from './siteSettingsStore';
import {
  applyBoardCheckIn,
  enqueueJoin,
  findSeatByNameKey,
  findSeatByTagKey,
} from './join';
import { checkAndMarkCheckInCooldown, checkJoinIdentityCooldown } from './joinGuards';

export const BRIDGE_HEARTBEAT_KEY = 'bridge:heartbeat';
const BRIDGE_HEARTBEAT_TTL_SEC = 120;
const BRIDGE_CONNECTED_MS = 90_000;

type BridgeEnv = Pick<Env, 'ROSTER' | 'CHAT_BRIDGE_SECRET' | 'HENRIK_API_KEY' | 'STREAMER_PASSWORD' | 'ADMIN_PASSWORD'>;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireBridgeSecret(request: Request, env: BridgeEnv): Response | null {
  const secret = env.CHAT_BRIDGE_SECRET?.trim();
  if (!secret) {
    return json({ ok: false, error: 'CHAT_BRIDGE_SECRET이 설정되지 않았습니다.' }, { status: 503 });
  }
  const provided = (request.headers.get('X-Valnce-Bridge') ?? '').trim();
  if (!provided || !timingSafeEqual(provided, secret)) {
    return json({ ok: false, error: '브릿지 인증에 실패했습니다.' }, { status: 401 });
  }
  return null;
}

function nameKeyOf(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

function asSavedPlayers(raw: unknown[]): Record<string, unknown>[] {
  return raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function parseRiotId(raw: string): { riotName: string; riotTag: string } | null {
  const trimmed = raw.trim();
  const hash = trimmed.lastIndexOf('#');
  if (hash <= 0 || hash >= trimmed.length - 1) return null;
  const riotName = trimmed.slice(0, hash).trim().replace(/^#+/, '');
  const riotTag = trimmed.slice(hash + 1).trim().replace(/^#+/, '');
  if (!riotName || !riotTag) return null;
  return { riotName, riotTag };
}

async function isChatBridgeOpen(env: BridgeEnv): Promise<boolean> {
  return (await readSiteSettings(env)).chatBridgeOpen;
}

async function bridgeEnqueue(
  env: BridgeEnv,
  input: {
    name: string;
    riotName: string;
    riotTag: string;
    canOrder: boolean;
    rateKey: string;
  }
): Promise<Response> {
  if (!(await isViewerJoinOpen(env))) {
    return json({ ok: false, error: '지금은 참가 신청을 받지 않습니다.', code: 'join_closed' }, { status: 403 });
  }

  const viewerToken = crypto.randomUUID();
  const tagKey = riotKey(input.riotName, input.riotTag);
  const roster = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const rosterPlayers = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);
  const existingByRiot = rosterPlayers.find(
    (item) =>
      typeof item.riotName === 'string' &&
      typeof item.riotTag === 'string' &&
      riotKey(item.riotName, item.riotTag) === tagKey
  );
  if (existingByRiot) {
    await env.ROSTER.put('viewer-approved:' + viewerToken, JSON.stringify(tagKey), {
      expirationTtl: 30 * 86400,
    });
  }

  const request = new Request('https://bridge.local/api/join', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: `valnce-viewer=${viewerToken}`,
      'CF-Connecting-IP': `bridge:${input.rateKey.slice(0, 80)}`,
    },
    body: JSON.stringify({
      name: input.name,
      riotName: input.riotName,
      riotTag: input.riotTag,
      canOrder: input.canOrder,
    }),
  });
  return enqueueJoin(request, env as unknown as Env);
}

async function handleBridgeJoin(request: Request, env: BridgeEnv): Promise<Response> {
  let body: {
    name?: string;
    riotName?: string;
    riotTag?: string;
    canOrder?: boolean;
    senderChannelId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const riotName = (body.riotName ?? '').trim().replace(/^#+/, '');
  const riotTag = (body.riotTag ?? '').trim().replace(/^#+/, '');
  const canOrder = Boolean(body.canOrder);
  const rateKey = ((body.senderChannelId ?? nameKeyOf(name)) || 'unknown').trim() || 'unknown';
  if (!name) return json({ ok: false, error: '치지직 닉네임이 필요합니다.' }, { status: 400 });
  if (!riotName || !riotTag) {
    return json({ ok: false, error: '발로란트 닉네임과 태그가 필요합니다.', code: 'need_riot' }, { status: 400 });
  }

  return bridgeEnqueue(env, { name, riotName, riotTag, canOrder, rateKey });
}

async function handleBridgeCheckIn(request: Request, env: BridgeEnv): Promise<Response> {
  let body: { name?: string; ready?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  if (!name) return json({ ok: false, error: '치지직 닉네임이 필요합니다.' }, { status: 400 });
  if (typeof body.ready !== 'boolean') {
    return json({ ok: false, error: 'ready 값이 필요합니다.' }, { status: 400 });
  }

  const cooldown = await checkAndMarkCheckInCooldown(env, nameKeyOf(name));
  if (cooldown) return cooldown;

  const board = await readSharedBoard(env);
  const seats = boardSeats(board);
  const seat = findSeatByNameKey(seats, nameKeyOf(name));
  if (!seat || typeof seat.id !== 'string') {
    return json(
      { ok: false, error: '보드에 없습니다. 참가 신청 후 출석해 주세요.', code: 'not_on_board' },
      { status: 404 }
    );
  }

  const result = await applyBoardCheckIn(env, seat.id, body.ready);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, { status: result.status });
  }
  return json({
    ok: true,
    action: 'check_in',
    checkIn: result.checkIn,
    onBoard: true,
    name: typeof seat.name === 'string' ? seat.name : name,
  });
}

async function handleBridgeParticipate(request: Request, env: BridgeEnv): Promise<Response> {
  let body: {
    name?: string;
    riotName?: string;
    riotTag?: string;
    riotId?: string;
    canOrder?: boolean;
    ready?: boolean;
    senderChannelId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return json({ ok: false, error: '치지직 닉네임이 필요합니다.' }, { status: 400 });
  const nameKey = nameKeyOf(name);
  const rateKey = ((body.senderChannelId ?? nameKey) || 'unknown').trim() || 'unknown';
  const canOrder = Boolean(body.canOrder);
  const ready = body.ready !== false;

  let riotName = (body.riotName ?? '').trim().replace(/^#+/, '');
  let riotTag = (body.riotTag ?? '').trim().replace(/^#+/, '');
  if ((!riotName || !riotTag) && typeof body.riotId === 'string') {
    const parsed = parseRiotId(body.riotId);
    if (parsed) {
      riotName = parsed.riotName;
      riotTag = parsed.riotTag;
    }
  }

  const board = await readSharedBoard(env);
  const seats = boardSeats(board);
  const seatByName = findSeatByNameKey(seats, nameKey);
  if (seatByName && typeof seatByName.id === 'string') {
    const cooldown = await checkAndMarkCheckInCooldown(env, nameKey);
    if (cooldown) return cooldown;
    const result = await applyBoardCheckIn(env, seatByName.id, ready);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, { status: result.status });
    }
    return json({
      ok: true,
      action: 'check_in',
      checkIn: result.checkIn,
      onBoard: true,
      name: typeof seatByName.name === 'string' ? seatByName.name : name,
    });
  }

  if (riotName && riotTag) {
    const seatByRiot = findSeatByTagKey(seats, riotKey(riotName, riotTag));
    if (seatByRiot && typeof seatByRiot.id === 'string') {
      const cooldown = await checkAndMarkCheckInCooldown(env, nameKey);
      if (cooldown) return cooldown;
      const result = await applyBoardCheckIn(env, seatByRiot.id, ready);
      if (!result.ok) {
        return json({ ok: false, error: result.error }, { status: result.status });
      }
      return json({
        ok: true,
        action: 'check_in',
        checkIn: result.checkIn,
        onBoard: true,
        name: typeof seatByRiot.name === 'string' ? seatByRiot.name : name,
      });
    }
  }

  const joinCooldown = await checkJoinIdentityCooldown(env, nameKey, riotKey(riotName, riotTag));
  if (joinCooldown) return joinCooldown;

  const roster = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const rosterPlayers = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);

  if (riotName && riotTag) {
    const joinResponse = await bridgeEnqueue(env, {
      name,
      riotName,
      riotTag,
      canOrder,
      rateKey,
    });
    const data = (await joinResponse.json().catch(() => null)) as Record<string, unknown> | null;
    if (!joinResponse.ok) {
      return json(
        { ok: false, ...(data ?? { error: '신청에 실패했습니다.' }) },
        { status: joinResponse.status }
      );
    }
    return json({ ok: true, action: 'join', ...(data ?? {}) });
  }

  const existingByName = rosterPlayers.find(
    (item) => typeof item.name === 'string' && item.name.normalize('NFC').toLowerCase() === nameKey
  );
  if (
    existingByName &&
    typeof existingByName.riotName === 'string' &&
    typeof existingByName.riotTag === 'string' &&
    existingByName.riotName &&
    existingByName.riotTag
  ) {
    const joinResponse = await bridgeEnqueue(env, {
      name,
      riotName: existingByName.riotName,
      riotTag: existingByName.riotTag,
      canOrder: canOrder || Boolean(existingByName.canOrder),
      rateKey,
    });
    const data = (await joinResponse.json().catch(() => null)) as Record<string, unknown> | null;
    if (!joinResponse.ok) {
      return json(
        { ok: false, ...(data ?? { error: '합류에 실패했습니다.' }) },
        { status: joinResponse.status }
      );
    }
    return json({ ok: true, action: 'join', ...(data ?? {}) });
  }

  return json(
    {
      ok: false,
      code: 'need_riot',
      error: '처음 참가면 !신청 닉#태그 형식으로 신청해 주세요.',
    },
    { status: 400 }
  );
}

async function handleBridgeHeartbeat(request: Request, env: BridgeEnv): Promise<Response> {
  let body: { channelId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const at = Date.now();
  const channelId = typeof body.channelId === 'string' ? body.channelId.trim().slice(0, 100) : '';
  await env.ROSTER.put(
    BRIDGE_HEARTBEAT_KEY,
    JSON.stringify({ at, ...(channelId ? { channelId } : {}) }),
    { expirationTtl: BRIDGE_HEARTBEAT_TTL_SEC }
  );
  return json({ ok: true, at });
}

async function handleBridgeStatus(_request: Request, env: BridgeEnv): Promise<Response> {
  const stored = (await env.ROSTER.get(BRIDGE_HEARTBEAT_KEY, 'json')) as {
    at?: number;
    channelId?: string;
  } | null;
  const at = typeof stored?.at === 'number' ? stored.at : null;
  const connected = at != null && Date.now() - at < BRIDGE_CONNECTED_MS;
  return json({
    ok: true,
    connected,
    lastSeenAt: at,
    channelId: typeof stored?.channelId === 'string' ? stored.channelId : null,
    chatBridgeOpen: (await readSiteSettings(env)).chatBridgeOpen,
  });
}

export async function handleBridge(request: Request, env: BridgeEnv, path: string): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (path === '/api/bridge/status' && request.method === 'GET') {
    const denied = await requireStreamer(request, env);
    if (denied) return denied;
    return handleBridgeStatus(request, env);
  }

  const denied = requireBridgeSecret(request, env);
  if (denied) return denied;

  if (!(await isChatBridgeOpen(env))) {
    return json({ ok: false, error: '채팅 연동이 꺼져 있습니다.', code: 'bridge_closed' }, { status: 403 });
  }

  if (path === '/api/bridge/heartbeat' && request.method === 'POST') {
    return handleBridgeHeartbeat(request, env);
  }
  if (path === '/api/bridge/join' && request.method === 'POST') {
    return handleBridgeJoin(request, env);
  }
  if (path === '/api/bridge/check-in' && request.method === 'POST') {
    return handleBridgeCheckIn(request, env);
  }
  if (path === '/api/bridge/participate' && request.method === 'POST') {
    return handleBridgeParticipate(request, env);
  }

  return json({ error: 'Not found' }, { status: 404 });
}
