import { Env } from './types';
import { json } from './http';
import { isStreamerAccessOpen } from './siteSettingsStore';
import {
  deviceIdFromRequest,
  isTrustedDevice,
  readTrustedDevices,
  trustDevice,
  untrustDevice,
} from './trustedDevices';

type AuthEnv = Pick<Env, 'STREAMER_PASSWORD' | 'ADMIN_PASSWORD' | 'ROSTER'>;
export type AuthRole = 'streamer' | 'admin';

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

export async function issueAuthToken(
  secret: string,
  epoch: number,
  role: AuthRole,
  now = Date.now()
): Promise<string> {
  const payload = JSON.stringify({ v: 1, exp: now + SESSION_TTL_MS, epoch, role });
  const payloadPart = bytesToBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
  return `v1.${payloadPart}.${bytesToBase64Url(signature)}`;
}

export async function verifyAuthToken(
  token: string,
  secret: string,
  epoch: number,
  expectedRole: AuthRole,
  now = Date.now(),
  options?: { skipEpoch?: boolean }
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
      role?: string;
    };
    if (payload.v !== 1 || typeof payload.exp !== 'number') return false;
    if (payload.exp <= now) return false;
    if (!options?.skipEpoch) {
      if (typeof payload.epoch !== 'number' || payload.epoch !== epoch) return false;
    } else if (typeof payload.epoch !== 'number') {
      return false;
    }
    if (payload.role !== expectedRole) return false;
    return true;
  } catch {
    return false;
  }
}

async function resolveAuth(
  request: Request,
  env: AuthEnv
): Promise<{ role: AuthRole } | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const epoch = await readSessionEpoch(env);
  const skipEpoch = await isTrustedDevice(env, deviceIdFromRequest(request), trustProof(request));
  const verifyOpts = skipEpoch ? { skipEpoch: true } : undefined;
  if (
    env.STREAMER_PASSWORD &&
    (await verifyAuthToken(token, env.STREAMER_PASSWORD, epoch, 'streamer', Date.now(), verifyOpts))
  ) {
    return { role: 'streamer' };
  }
  if (
    env.ADMIN_PASSWORD &&
    (await verifyAuthToken(token, env.ADMIN_PASSWORD, epoch, 'admin', Date.now(), verifyOpts))
  ) {
    return { role: 'admin' };
  }
  return null;
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
  await env.ROSTER.put(`auth:login:${ip}`, JSON.stringify({ count, resetAt }), { expirationTtl: 900 });
}

/** 스트리머 또는 관리자 토큰. 스트리머 입장 OFF면 스트리머 역할만 403(토큰 유지). */
export async function requireStreamer(request: Request, env: AuthEnv): Promise<Response | null> {
  if (!env.STREAMER_PASSWORD && !env.ADMIN_PASSWORD) {
    return json({ error: 'STREAMER_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }
  const auth = await resolveAuth(request, env);
  if (!auth) {
    return json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (auth.role === 'streamer' && !(await isStreamerAccessOpen(env))) {
    const trusted = await isTrustedDevice(env, deviceIdFromRequest(request));
    if (!trusted) {
      return json({ error: '지금은 스트리머 입장이 닫혀 있습니다.' }, { status: 403 });
    }
  }
  await appendAccessLog(
    env,
    { ip: clientIp(request), at: Date.now(), ok: true },
    { throttleSuccess: true }
  );
  return null;
}

/** 관리자 전용 */
export async function requireAdmin(request: Request, env: AuthEnv): Promise<Response | null> {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'ADMIN_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }
  const auth = await resolveAuth(request, env);
  if (!auth || auth.role !== 'admin') {
    return json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
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
  if (!env.STREAMER_PASSWORD && !env.ADMIN_PASSWORD) {
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

  const password = (body.password ?? '').trim();
  const epoch = await readSessionEpoch(env);

  if (env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) {
    await writeLoginAttempts(env, ip, 0, attempts.resetAt);
    const token = await issueAuthToken(env.ADMIN_PASSWORD, epoch, 'admin');
    await appendAccessLog(env, { ip, at: Date.now(), ok: true });
    return json({ ok: true, token, role: 'admin' as AuthRole, expiresInMs: SESSION_TTL_MS });
  }

  if (env.STREAMER_PASSWORD && password === env.STREAMER_PASSWORD) {
    const accessOpen = await isStreamerAccessOpen(env);
    const trusted = await isTrustedDevice(env, deviceIdFromRequest(request));
    if (!accessOpen && !trusted) {
      return json({ ok: false, error: '지금은 스트리머 입장이 닫혀 있습니다.' }, { status: 403 });
    }
    await writeLoginAttempts(env, ip, 0, attempts.resetAt);
    const token = await issueAuthToken(env.STREAMER_PASSWORD, epoch, 'streamer');
    await appendAccessLog(env, { ip, at: Date.now(), ok: true });
    return json({ ok: true, token, role: 'streamer' as AuthRole, expiresInMs: SESSION_TTL_MS });
  }

  await writeLoginAttempts(env, ip, attempts.count + 1, attempts.resetAt);
  await appendAccessLog(env, { ip, at: Date.now(), ok: false });
  return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
}

export async function handleAuthRevokeAll(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!env.ADMIN_PASSWORD) {
    return json({ ok: false, error: 'ADMIN_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }

  const ip = clientIp(request);
  const attempts = await readLoginAttempts(env, ip);
  if (attempts.count >= LOGIN_MAX_ATTEMPTS) return json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 });
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return json({ ok: false, error: '잘못된 JSON입니다.' }, { status: 400 });
  }

  const password = (body.password ?? '').trim();
  if (password !== env.ADMIN_PASSWORD) {
    await writeLoginAttempts(env, ip, attempts.count + 1, attempts.resetAt);
    await appendAccessLog(env, { ip: clientIp(request), at: Date.now(), ok: false });
    return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  await writeLoginAttempts(env, ip, 0, attempts.resetAt);
  const nextEpoch = (await readSessionEpoch(env)) + 1;
  await writeSessionEpoch(env, nextEpoch);
  await appendAccessLog(env, { ip: clientIp(request), at: Date.now(), ok: true });
  return json({ ok: true, epoch: nextEpoch });
}

export async function handleAuthAccessLog(request: Request, env: AuthEnv): Promise<Response> {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  if (request.method === 'DELETE') {
    if (env.ROSTER) {
      await env.ROSTER.put(ACCESS_LOG_KEY, JSON.stringify([]));
    }
    return json({ ok: true });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  const items = await readAccessLog(env);
  return json({ items });
}

export async function handleAuthTrustStatus(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  const trusted = await isTrustedDevice(env, deviceIdFromRequest(request));
  return json({ trusted });
}

export async function handleAuthTrustDevice(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method === 'GET') {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;
    const devices = await readTrustedDevices(env);
    return json({ devices: devices.map(({ proof: _proof, ...device }) => device) });
  }

  if (request.method === 'POST') {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;
    let body: { deviceId?: string; label?: string };
    try {
      body = (await request.json()) as { deviceId?: string; label?: string };
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }
    const deviceId = (body.deviceId ?? deviceIdFromRequest(request)).trim();
    if (!deviceId) {
      return json({ error: 'deviceId가 필요합니다.' }, { status: 400 });
    }
    const proof = crypto.randomUUID();
    const devices = await trustDevice(env, deviceId, body.label, proof);
    return json({ ok: true, devices: devices.map(({ proof: _proof, ...device }) => device) }, { headers: { 'Set-Cookie': 'valnce-trust=' + proof + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000' } });
  }

  if (request.method === 'DELETE') {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;
    let body: { deviceId?: string };
    try {
      body = (await request.json()) as { deviceId?: string };
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }
    const deviceId = (body.deviceId ?? deviceIdFromRequest(request)).trim();
    if (!deviceId) {
      return json({ error: 'deviceId가 필요합니다.' }, { status: 400 });
    }
    const devices = await untrustDevice(env, deviceId);
    return json({ ok: true, devices: devices.map(({ proof: _proof, ...device }) => device) });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

function trustProof(request: Request): string | undefined {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)valnce-trust=([a-zA-Z0-9-]{20,100})(?:;|$)/)?.[1];
}
