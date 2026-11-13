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
  findSeatByChannelId,
  findSeatByNameKey,
  findSeatByTagKey,
} from './join';
import { checkAndMarkCheckInCooldown, checkJoinIdentityCooldown } from './joinGuards';
import {
  checkChannelRiotBinding,
  mergeChannelBinding,
  seatChannelId,
  seatRiotTagKey,
} from './chzzkBinding';

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

/** 명단에 channelId·닉 백필 — 기존 다른 channel 바인딩은 덮어쓰지 않음 */
async function backfillRosterBinding(
  env: BridgeEnv,
  input: { channelId?: string; name?: string; tagKey?: string; playerId?: string }
): Promise<{ ok: true } | { ok: false; code: 'channel_bound_other' | 'riot_bound_other' }> {
  const channelId = input.channelId?.trim().slice(0, 100);
  const name = input.name?.trim();
  if (!channelId && !name) return { ok: true };

  const roster = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const players = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);
  if (channelId && input.tagKey) {
    const conflict = checkChannelRiotBinding(players, channelId, input.tagKey);
    if (!conflict.ok) return { ok: false, code: conflict.code };
  }

  const idx = players.findIndex((item) => {
    if (input.playerId && item.id === input.playerId) return true;
    if (
      input.tagKey &&
      typeof item.riotName === 'string' &&
      typeof item.riotTag === 'string' &&
      riotKey(item.riotName, item.riotTag) === input.tagKey
    ) {
      return true;
    }
    if (channelId && typeof item.chzzkChannelId === 'string' && item.chzzkChannelId === channelId) {
      return true;
    }
    return false;
  });
  if (idx < 0) return { ok: true };

  const merged = mergeChannelBinding(players[idx], { channelId, name });
  if (merged.refused) return { ok: false, code: merged.refused };
  if (!merged.changed) return { ok: true };
  const nextPlayers = [...players];
  nextPlayers[idx] = merged.next;
  await env.ROSTER.put(
    ROSTER_KEY,
    JSON.stringify({ updatedAt: Date.now(), players: nextPlayers })
  );
  return { ok: true };
}

async function bridgeEnqueue(
  env: BridgeEnv,
  input: {
    name: string;
    riotName: string;
    riotTag: string;
    canOrder: boolean;
    rateKey: string;
    chzzkChannelId?: string;
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
  if (input.chzzkChannelId) {
    const conflict = checkChannelRiotBinding(rosterPlayers, input.chzzkChannelId, tagKey);
    if (!conflict.ok) {
      return json(
        {
          ok: false,
          code: conflict.code,
          error:
            conflict.code === 'channel_bound_other'
              ? '이 치지직 계정은 다른 발로란트 닉에 이미 연결되어 있습니다.'
              : '이 발로란트 닉은 다른 치지직 계정에 이미 연결되어 있습니다.',
        },
        { status: 409 }
      );
    }
  }

  if (existingByRiot) {
    await env.ROSTER.put('viewer-approved:' + viewerToken, JSON.stringify(tagKey), {
      expirationTtl: 30 * 86400,
    });
    const filled = await backfillRosterBinding(env, {
      channelId: input.chzzkChannelId,
      name: input.name,
      tagKey,
      playerId: typeof existingByRiot.id === 'string' ? existingByRiot.id : undefined,
    });
    if (!filled.ok) {
      return json(
        {
          ok: false,
          code: filled.code,
          error: '이 발로란트 닉은 다른 치지직 계정에 이미 연결되어 있습니다.',
        },
        { status: 409 }
      );
    }
  }

  const secret = env.CHAT_BRIDGE_SECRET?.trim() ?? '';
  const request = new Request('https://bridge.local/api/join', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Cookie: `valnce-viewer=${viewerToken}`,
      'CF-Connecting-IP': `bridge:${input.rateKey.slice(0, 80)}`,
      ...(secret ? { 'X-Valnce-Bridge': secret } : {}),
    },
    body: JSON.stringify({
      name: input.name,
      riotName: input.riotName,
      riotTag: input.riotTag,
      canOrder: input.canOrder,
      ...(input.chzzkChannelId ? { chzzkChannelId: input.chzzkChannelId } : {}),
    }),
  });
  return enqueueJoin(request, env as unknown as Env);
}

async function respondCheckIn(
  env: BridgeEnv,
  seat: { id?: unknown; name?: unknown; chzzkChannelId?: unknown; riotName?: unknown; riotTag?: unknown },
  ready: boolean,
  meta: { name: string; chzzkChannelId?: string; tagKey?: string; playerId?: string }
): Promise<Response> {
  if (typeof seat.id !== 'string') {
    return json(
      { ok: false, error: '보드에 없습니다. !참가 닉#태그 후 출석해 주세요.', code: 'not_on_board' },
      { status: 404 }
    );
  }
  const cooldownKey = meta.chzzkChannelId || nameKeyOf(meta.name);
  const cooldown = await checkAndMarkCheckInCooldown(env, cooldownKey);
  if (cooldown) return cooldown;

  const existingSeatChannel = seatChannelId(seat as { chzzkChannelId?: unknown });
  if (
    meta.chzzkChannelId &&
    existingSeatChannel &&
    existingSeatChannel !== meta.chzzkChannelId
  ) {
    return json(
      {
        ok: false,
        code: 'channel_bound_other',
        error: '이 보드 자리는 다른 치지직 계정에 연결되어 있습니다.',
      },
      { status: 409 }
    );
  }

  const result = await applyBoardCheckIn(env, seat.id, ready, {
    name: meta.name,
    chzzkChannelId: meta.chzzkChannelId,
  });
  if (!result.ok) {
    return json({ ok: false, error: result.error }, { status: result.status });
  }
  const filled = await backfillRosterBinding(env, {
    channelId: meta.chzzkChannelId,
    name: meta.name,
    tagKey: meta.tagKey,
    playerId: meta.playerId,
  });
  if (!filled.ok) {
    return json(
      {
        ok: false,
        code: filled.code,
        error: '이 발로란트 닉은 다른 치지직 계정에 이미 연결되어 있습니다.',
      },
      { status: 409 }
    );
  }
  return json({
    ok: true,
    action: 'check_in',
    checkIn: result.checkIn,
    onBoard: true,
    name: meta.name || (typeof seat.name === 'string' ? seat.name : ''),
  });
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
  const chzzkChannelId = (body.senderChannelId ?? '').trim().slice(0, 100);
  const rateKey = (chzzkChannelId || nameKeyOf(name) || 'unknown').trim() || 'unknown';
  if (!name) return json({ ok: false, error: '치지직 닉네임이 필요합니다.' }, { status: 400 });
  if (!riotName || !riotTag) {
    return json({ ok: false, error: '발로란트 닉네임과 태그가 필요합니다.', code: 'need_riot' }, { status: 400 });
  }

  return bridgeEnqueue(env, {
    name,
    riotName,
    riotTag,
    canOrder,
    rateKey,
    ...(chzzkChannelId ? { chzzkChannelId } : {}),
  });
}

async function handleBridgeCheckIn(request: Request, env: BridgeEnv): Promise<Response> {
  let body: { name?: string; ready?: boolean; senderChannelId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  const chzzkChannelId = (body.senderChannelId ?? '').trim().slice(0, 100);
  if (!name) return json({ ok: false, error: '치지직 닉네임이 필요합니다.' }, { status: 400 });
  if (typeof body.ready !== 'boolean') {
    return json({ ok: false, error: 'ready 값이 필요합니다.' }, { status: 400 });
  }

  const board = await readSharedBoard(env);
  const seats = boardSeats(board);
  const seat =
    (chzzkChannelId ? findSeatByChannelId(seats, chzzkChannelId) : null) ||
    findSeatByNameKey(seats, nameKeyOf(name));
  if (!seat || typeof seat.id !== 'string') {
    return json(
      { ok: false, error: '보드에 없습니다. !참가 닉#태그 후 출석해 주세요.', code: 'not_on_board' },
      { status: 404 }
    );
  }

  return respondCheckIn(env, seat, body.ready, {
    name,
    ...(chzzkChannelId ? { chzzkChannelId } : {}),
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
  const chzzkChannelId = (body.senderChannelId ?? '').trim().slice(0, 100);
  const rateKey = (chzzkChannelId || nameKey || 'unknown').trim() || 'unknown';
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
  const hasRiot = Boolean(riotName && riotTag);
  const tagKey = hasRiot ? riotKey(riotName, riotTag) : '';

  const board = await readSharedBoard(env);
  const seats = boardSeats(board);

  // 1) channelId → 보드 출석 (명령 Riot과 좌석 Riot이 다르면 거부)
  if (chzzkChannelId) {
    const seatByChannel = findSeatByChannelId(seats, chzzkChannelId);
    if (seatByChannel) {
      const seatTag = seatRiotTagKey(seatByChannel as { riotName?: unknown; riotTag?: unknown });
      if (hasRiot && seatTag && seatTag !== tagKey) {
        return json(
          {
            ok: false,
            code: 'identity_mismatch',
            error: '연결된 발로란트 닉과 입력한 닉이 다릅니다.',
          },
          { status: 409 }
        );
      }
      return respondCheckIn(env, seatByChannel, ready, {
        name,
        chzzkChannelId,
        ...(tagKey || seatTag ? { tagKey: tagKey || seatTag } : {}),
      });
    }
  }

  // 2) Riot → 보드 출석 (+ channelId 최초 바인딩만)
  if (hasRiot) {
    const seatByRiot = findSeatByTagKey(seats, tagKey);
    if (seatByRiot) {
      const bound = seatChannelId(seatByRiot as { chzzkChannelId?: unknown });
      if (chzzkChannelId && bound && bound !== chzzkChannelId) {
        return json(
          {
            ok: false,
            code: 'riot_bound_other',
            error: '이 발로란트 닉은 다른 치지직 계정에 이미 연결되어 있습니다.',
          },
          { status: 409 }
        );
      }
      return respondCheckIn(env, seatByRiot, ready, {
        name,
        ...(chzzkChannelId ? { chzzkChannelId } : {}),
        tagKey,
      });
    }
  }

  // 3) 닉 → 보드 (레거시, channel 없을 때만)
  if (!chzzkChannelId) {
    const seatByName = findSeatByNameKey(seats, nameKey);
    if (seatByName) {
      return respondCheckIn(env, seatByName, ready, {
        name,
        ...(tagKey ? { tagKey } : {}),
      });
    }
  } else {
    // channel 있는데 보드/명단 미매칭이면 닉 폴백으로 타인 좌석 점유 금지
  }

  // 불참인데 보드에 없음
  if (!ready) {
    return json(
      {
        ok: false,
        code: 'not_on_board',
        error: '보드에 없습니다. !참가 닉#태그 후 출석해 주세요.',
      },
      { status: 404 }
    );
  }

  const joinCooldown = await checkJoinIdentityCooldown(env, nameKey, tagKey || nameKey);
  if (joinCooldown) return joinCooldown;

  const roster = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
  const rosterPlayers = asSavedPlayers(Array.isArray(roster?.players) ? roster!.players : []);

  // 4) Riot 있으면 신청/합류
  if (hasRiot) {
    const joinResponse = await bridgeEnqueue(env, {
      name,
      riotName,
      riotTag,
      canOrder,
      rateKey,
      ...(chzzkChannelId ? { chzzkChannelId } : {}),
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

  // 5) channelId → 명단 자동 합류
  if (chzzkChannelId) {
    const existingByChannel = rosterPlayers.find(
      (item) => typeof item.chzzkChannelId === 'string' && item.chzzkChannelId === chzzkChannelId
    );
    if (
      existingByChannel &&
      typeof existingByChannel.riotName === 'string' &&
      typeof existingByChannel.riotTag === 'string' &&
      existingByChannel.riotName &&
      existingByChannel.riotTag
    ) {
      const joinResponse = await bridgeEnqueue(env, {
        name,
        riotName: existingByChannel.riotName,
        riotTag: existingByChannel.riotTag,
        canOrder: canOrder || Boolean(existingByChannel.canOrder),
        rateKey,
        chzzkChannelId,
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
  }

  // 6) 닉 → 명단 (레거시)
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
      ...(chzzkChannelId ? { chzzkChannelId } : {}),
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
      error: '처음 참가면 !참가 닉#태그 형식으로 신청해 주세요.',
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
