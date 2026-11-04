import { Env } from './types';
import { json } from './http';

type AuthEnv = Pick<Env, 'STREAMER_PASSWORD' | 'ROSTER'>;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const ACCESS_LOG_KEY = 'auth:access-log';
const ACCESS_LOG_LIMIT = 50;
const ACCESS_THROTTLE_MS = 10 * 60 * 1000;
const SESSION_EPOCH_KEY = 'auth:session-epoch';

export interface AccessLogEntry {
  ip: string;
  at: number;
  ok: boolean;
}

function bearerToken(request: Request) {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

function clientIp(request: Request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local'
  );
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function readSessionEpoch(env: AuthEnv): Promise<number> {
  if (!env.ROSTER) return 0;
  const stored = (await env.ROSTER.get(SESSION_EPOCH_KEY, 'json')) as { epoch?: number } | number | null;
  if (typeof stored === 'number' && Number.isFinite(stored)) return Math.max(0, Math.floor(stored));
  if (
    stored &&
    typeof stored === 'object' &&
    typeof stored.epoch === 'number' &&
    Number.isFinite(stored.epoch)
  ) {
    return Math.max(0, Math.floor(stored.epoch));
  }
  return 0;
}

async function writeSessionEpoch(env: AuthEnv, epoch: number) {
  if (!env.ROSTER) return;
  await env.ROSTER.put(SESSION_EPOCH_KEY, JSON.stringify({ epoch }));
}

async function readAccessLog(env: AuthEnv): Promise<AccessLogEntry[]> {
  if (!env.ROSTER) return [];
  const stored = (await env.ROSTER.get(ACCESS_LOG_KEY, 'json')) as AccessLogEntry[] | null;
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item) =>
      item &&
      typeof item.ip === 'string' &&
      typeof item.at === 'number' &&
      typeof item.ok === 'boolean'
  );
}

async function appendAccessLog(
  env: AuthEnv,
  entry: AccessLogEntry,
  options?: { throttleSuccess?: boolean }
) {
  if (!env.ROSTER) return;
  const list = await readAccessLog(env);
  if (options?.throttleSuccess && entry.ok) {
    const recent = list.find((item) => item.ip === entry.ip && item.ok);
    if (recent && entry.at - recent.at < ACCESS_THROTTLE_MS) return;
  }
  const next = [entry, ...list].slice(0, ACCESS_LOG_LIMIT);
  await env.ROSTER.put(ACCESS_LOG_KEY, JSON.stringify(next));
}

export async function issueStreamerToken(
  secret: string,
  epoch: number,
  now = Date.now()
): Promise<string> {
  const payload = JSON.stringify({ v: 1, exp: now + SESSION_TTL_MS, epoch });
  const payloadPart = bytesToBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
  return `v1.${payloadPart}.${bytesToBase64Url(signature)}`;
}

export async function verifyStreamerToken(
  token: string,
  secret: string,
  epoch: number,
  now = Date.now()
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const [, payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) return false;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(payloadPart)
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as {
      exp?: number;
      v?: number;
      epoch?: number;
    };
    if (payload.v !== 1 || typeof payload.exp !== 'number') return false;
    if (payload.exp <= now) return false;
    if (typeof payload.epoch !== 'number' || payload.epoch !== epoch) return false;
    return true;
  } catch {
    return false;
  }
}

async function readLoginAttempts(env: AuthEnv, ip: string) {
  if (!env.ROSTER) return { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
  const key = `auth:login:${ip}`;
  const stored = (await env.ROSTER.get(key, 'json')) as { count?: number; resetAt?: number } | null;
  const now = Date.now();
  if (!stored || typeof stored.resetAt !== 'number' || stored.resetAt <= now) {
    return { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  return {
    count: typeof stored.count === 'number' ? stored.count : 0,
    resetAt: stored.resetAt,
  };
}

async function writeLoginAttempts(env: AuthEnv, ip: string, count: number, resetAt: number) {
  if (!env.ROSTER) return;
  await env.ROSTER.put(`auth:login:${ip}`, JSON.stringify({ count, resetAt }));
}

export async function requireStreamer(request: Request, env: AuthEnv): Promise<Response | null> {
  if (!env.STREAMER_PASSWORD) {
    return json({ error: 'STREAMER_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }
  const epoch = await readSessionEpoch(env);
  const token = bearerToken(request);
  if (!token || !(await verifyStreamerToken(token, env.STREAMER_PASSWORD, epoch))) {
    return json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  await appendAccessLog(
    env,
    { ip: clientIp(request), at: Date.now(), ok: true },
    { throttleSuccess: true }
  );
  return null;
}

export async function handleAuthLogin(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!env.STREAMER_PASSWORD) {
    return json({ ok: false, error: 'STREAMER_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }

  const ip = clientIp(request);
  const attempts = await readLoginAttempts(env, ip);
  if (attempts.count >= LOGIN_MAX_ATTEMPTS) {
    return json(
      { ok: false, error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.' },
      { status: 429 }
    );
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  if ((body.password ?? '').trim() !== env.STREAMER_PASSWORD) {
    await writeLoginAttempts(env, ip, attempts.count + 1, attempts.resetAt);
    await appendAccessLog(env, { ip, at: Date.now(), ok: false });
    return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  await writeLoginAttempts(env, ip, 0, attempts.resetAt);
  const epoch = await readSessionEpoch(env);
  const token = await issueStreamerToken(env.STREAMER_PASSWORD, epoch);
  await appendAccessLog(env, { ip, at: Date.now(), ok: true });
  return json({ ok: true, token, expiresInMs: SESSION_TTL_MS });
}

export async function handleAuthRevokeAll(request: Request, env: AuthEnv): Promise<Response> {
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
    await appendAccessLog(env, { ip: clientIp(request), at: Date.now(), ok: false });
    return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const nextEpoch = (await readSessionEpoch(env)) + 1;
  await writeSessionEpoch(env, nextEpoch);
  await appendAccessLog(env, { ip: clientIp(request), at: Date.now(), ok: true });
  return json({ ok: true, epoch: nextEpoch });
}

export async function handleAuthAccessLog(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  const denied = await requireStreamer(request, env);
  if (denied) return denied;
  const items = await readAccessLog(env);
  return json({ items });
}
