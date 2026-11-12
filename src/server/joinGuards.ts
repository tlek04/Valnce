import { Env } from './types';
import { json } from './http';

/** IP당 15분에 최대 신청 시도 (기존 테스트·운영 한도와 동일) */
export const JOIN_RATE_WINDOW_MS = 15 * 60 * 1000;
export const JOIN_RATE_MAX = 12;

/** 같은 닉/발로 ID로 너무 빠른 재신청 방지 */
export const JOIN_IDENTITY_COOLDOWN_MS = 8_000;

/** 전체 신청 폭주 방지 (분당) — 큐 상한보다 넉넉히 두되 순간 폭주는 막음 */
export const JOIN_GLOBAL_WINDOW_MS = 60_000;
export const JOIN_GLOBAL_MAX = 120;

/** pending 큐 상한 — 과신청으로 보드가 쌓이지 않게 */
export const JOIN_QUEUE_MAX = 100;

type GuardEnv = Pick<Env, 'ROSTER'>;

function sanitizeKeyPart(raw: string): string {
  return raw.normalize('NFC').toLowerCase().replace(/[^a-z0-9#._:@-]+/gi, '_').slice(0, 80);
}

async function bumpWindowCounter(
  env: GuardEnv,
  key: string,
  windowMs: number,
  max: number,
  ttlSec: number
): Promise<{ limited: true; count: number } | { limited: false; count: number }> {
  const now = Date.now();
  const stored = (await env.ROSTER.get(key, 'json')) as { count?: number; resetAt?: number } | null;
  let count = 0;
  let resetAt = now + windowMs;
  if (stored && typeof stored.resetAt === 'number' && stored.resetAt > now) {
    count = typeof stored.count === 'number' ? stored.count : 0;
    resetAt = stored.resetAt;
  }
  if (count >= max) {
    return { limited: true, count };
  }
  await env.ROSTER.put(key, JSON.stringify({ count: count + 1, resetAt }), { expirationTtl: ttlSec });
  return { limited: false, count: count + 1 };
}

/** IP(또는 bridge:sender) 기준 신청 한도 */
export async function checkJoinIpRateLimit(env: GuardEnv, ip: string): Promise<Response | null> {
  const result = await bumpWindowCounter(
    env,
    `auth:join:${sanitizeKeyPart(ip || 'unknown')}`,
    JOIN_RATE_WINDOW_MS,
    JOIN_RATE_MAX,
    900
  );
  if (result.limited) {
    return json(
      { ok: false, error: '신청이 너무 많습니다. 잠시 후 다시 시도하세요.', code: 'join_rate_ip' },
      { status: 429 }
    );
  }
  return null;
}

/** 전체 분당 신청 한도 */
export async function checkJoinGlobalRateLimit(env: GuardEnv): Promise<Response | null> {
  const result = await bumpWindowCounter(env, 'auth:join:global', JOIN_GLOBAL_WINDOW_MS, JOIN_GLOBAL_MAX, 120);
  if (result.limited) {
    return json(
      { ok: false, error: '지금은 신청이 몰려 있습니다. 잠시 후 다시 시도하세요.', code: 'join_rate_global' },
      { status: 429 }
    );
  }
  return null;
}

function identityCooldownKeys(nameKey: string, tagKey: string): string[] {
  return [
    nameKey ? `auth:join-id:name:${sanitizeKeyPart(nameKey)}` : '',
    tagKey ? `auth:join-id:riot:${sanitizeKeyPart(tagKey)}` : '',
  ].filter(Boolean);
}

/** 같은 닉/발로 ID 연타 신청이 쿨다운 중인지 확인 */
export async function checkJoinIdentityCooldown(
  env: GuardEnv,
  nameKey: string,
  tagKey: string
): Promise<Response | null> {
  const now = Date.now();
  for (const key of identityCooldownKeys(nameKey, tagKey)) {
    const stored = (await env.ROSTER.get(key, 'json')) as { at?: number } | null;
    if (stored && typeof stored.at === 'number' && now - stored.at < JOIN_IDENTITY_COOLDOWN_MS) {
      return json(
        {
          ok: false,
          error: '같은 닉네임으로 너무 빠르게 신청했습니다. 잠시 후 다시 시도하세요.',
          code: 'join_rate_identity',
        },
        { status: 429 }
      );
    }
  }
  return null;
}

/** 신규 티켓 생성·중복 거절 후에만 쿨다운을 찍어 재연타를 막는다 */
export async function markJoinIdentityCooldown(
  env: GuardEnv,
  nameKey: string,
  tagKey: string
): Promise<void> {
  const payload = JSON.stringify({ at: Date.now() });
  const ttlSec = Math.ceil(JOIN_IDENTITY_COOLDOWN_MS / 1000) + 2;
  for (const key of identityCooldownKeys(nameKey, tagKey)) {
    await env.ROSTER.put(key, payload, { expirationTtl: ttlSec });
  }
}

/** 브릿지 출석(!참가/!불참) 연타 방지 */
export async function checkAndMarkCheckInCooldown(
  env: GuardEnv,
  nameKey: string
): Promise<Response | null> {
  if (!nameKey) return null;
  const now = Date.now();
  const key = `auth:checkin:${sanitizeKeyPart(nameKey)}`;
  const stored = (await env.ROSTER.get(key, 'json')) as { at?: number } | null;
  if (stored && typeof stored.at === 'number' && now - stored.at < JOIN_IDENTITY_COOLDOWN_MS) {
    return json(
      {
        ok: false,
        error: '출석 요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.',
        code: 'checkin_rate',
      },
      { status: 429 }
    );
  }
  await env.ROSTER.put(key, JSON.stringify({ at: now }), {
    expirationTtl: Math.ceil(JOIN_IDENTITY_COOLDOWN_MS / 1000) + 2,
  });
  return null;
}
