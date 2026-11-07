import { readJsonOrEmpty } from './apiResponse';
import { deviceIdHeaders, getOrCreateDeviceId } from './deviceId';

const STREAMER_TOKEN_KEY = 'valnce-streamer-token';
const ADMIN_TOKEN_KEY = 'valnce-admin-token';
/** @deprecated single-slot role; migrated away */
const LEGACY_ROLE_KEY = 'valnce-auth-role';

export type AuthRole = 'streamer' | 'admin';

export interface AccessLogEntry {
  ip: string;
  at: number;
  ok: boolean;
}

export interface TrustedDevice {
  id: string;
  label?: string;
  trustedAt: number;
}

function readToken(key: string): string | null {
  try {
    const local = localStorage.getItem(key)?.trim();
    if (local) return local;
    const session = sessionStorage.getItem(key)?.trim();
    if (session) {
      localStorage.setItem(key, session);
      sessionStorage.removeItem(key);
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

function writeToken(key: string, token: string): void {
  localStorage.setItem(key, token);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removeToken(key: string): void {
  localStorage.removeItem(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 예전 단일 토큰+role 저장을 슬롯별로 나눕니다. */
function migrateLegacyAuthSlots(): void {
  try {
    const legacyRole = localStorage.getItem(LEGACY_ROLE_KEY);
    const shared = localStorage.getItem(STREAMER_TOKEN_KEY)?.trim();
    if (!legacyRole || !shared) {
      if (legacyRole) localStorage.removeItem(LEGACY_ROLE_KEY);
      return;
    }
    if (legacyRole === 'admin') {
      if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
        localStorage.setItem(ADMIN_TOKEN_KEY, shared);
      }
      localStorage.removeItem(STREAMER_TOKEN_KEY);
    }
    localStorage.removeItem(LEGACY_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export function getStreamerToken(): string | null {
  migrateLegacyAuthSlots();
  return readToken(STREAMER_TOKEN_KEY);
}

export function getAdminToken(): string | null {
  migrateLegacyAuthSlots();
  return readToken(ADMIN_TOKEN_KEY);
}

export function setStreamerSession(token: string): void {
  writeToken(STREAMER_TOKEN_KEY, token);
}

export function setAdminSession(token: string): void {
  writeToken(ADMIN_TOKEN_KEY, token);
}

/** role에 맞는 슬롯만 저장. 다른 역할 토큰은 건드리지 않습니다. */
export function setAuthSession(token: string, role: AuthRole): void {
  if (role === 'admin') setAdminSession(token);
  else setStreamerSession(token);
  try {
    localStorage.removeItem(LEGACY_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStreamerToken(): void {
  removeToken(STREAMER_TOKEN_KEY);
}

export function clearAdminToken(): void {
  removeToken(ADMIN_TOKEN_KEY);
}

export function clearAllAuthTokens(): void {
  clearStreamerToken();
  clearAdminToken();
  try {
    localStorage.removeItem(LEGACY_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

function bearerHeaders(token: string | null, extra?: HeadersInit): HeadersInit {
  return deviceIdHeaders({
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
}

/** 매니지·명단·신청 API — 관리자 토큰 우선(OFF 시 streamer Bearer 403 회피), 없으면 스트리머 */
export function streamerAuthHeaders(extra?: HeadersInit): HeadersInit {
  return bearerHeaders(getAdminToken() || getStreamerToken(), extra);
}

/** access-log 등 관리자 전용 API */
export function adminAuthHeaders(extra?: HeadersInit): HeadersInit {
  return bearerHeaders(getAdminToken(), extra);
}

async function requestLogin(password: string): Promise<{
  ok: boolean;
  token?: string;
  role?: AuthRole;
  error?: string;
}> {
  const trimmed = password.trim();
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: deviceIdHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ password: trimmed }),
    });
    const data = await readJsonOrEmpty<{
      ok?: boolean;
      token?: string;
      role?: AuthRole;
      error?: string;
    }>(response);
    if (!response.ok || !data.ok || !data.token || (data.role !== 'admin' && data.role !== 'streamer')) {
      return { ok: false, error: data.error || '비밀번호가 올바르지 않습니다.' };
    }
    return { ok: true, token: data.token, role: data.role };
  } catch {
    return { ok: false, error: '인증 서버에 연결하지 못했습니다.' };
  }
}

/** 관리자 로그인 직후 이 PC를 신뢰 기기로 등록 */
export async function trustThisDevice(label?: string): Promise<{
  ok: boolean;
  devices?: TrustedDevice[];
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch('/api/auth/trust-device', {
      method: 'POST',
      headers: adminAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        deviceId: getOrCreateDeviceId(),
        label: label?.trim() || '이 PC',
      }),
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; devices?: TrustedDevice[]; error?: string }>(
      response
    );
    if (response.status === 401) {
      return { ok: false, unauthorized: true, error: data.error || '관리자 인증이 필요합니다.' };
    }
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '이 PC 등록에 실패했습니다.' };
    }
    return { ok: true, devices: Array.isArray(data.devices) ? data.devices : [] };
  } catch {
    return { ok: false, error: '신뢰 기기 서버에 연결하지 못했습니다.' };
  }
}

export async function untrustThisDevice(): Promise<{
  ok: boolean;
  devices?: TrustedDevice[];
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch('/api/auth/trust-device', {
      method: 'DELETE',
      headers: adminAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; devices?: TrustedDevice[]; error?: string }>(
      response
    );
    if (response.status === 401) {
      return { ok: false, unauthorized: true, error: data.error || '관리자 인증이 필요합니다.' };
    }
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '이 PC 해제에 실패했습니다.' };
    }
    return { ok: true, devices: Array.isArray(data.devices) ? data.devices : [] };
  } catch {
    return { ok: false, error: '신뢰 기기 서버에 연결하지 못했습니다.' };
  }
}

const TRUST_STATUS_CACHE_KEY = 'valnce-trust-status-cache';

export async function fetchTrustStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/trust-status', {
      headers: deviceIdHeaders(),
      cache: 'no-store',
    });
    if (!response.ok) {
      return readTrustStatusCache();
    }
    const data = (await response.json()) as { trusted?: unknown };
    const trusted = data.trusted === true;
    writeTrustStatusCache(trusted);
    return trusted;
  } catch {
    return readTrustStatusCache();
  }
}

function readTrustStatusCache(): boolean {
  try {
    const raw = sessionStorage.getItem(TRUST_STATUS_CACHE_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* ignore */
  }
  return false;
}

function writeTrustStatusCache(trusted: boolean): void {
  try {
    sessionStorage.setItem(TRUST_STATUS_CACHE_KEY, trusted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export async function verifyStreamerPassword(
  password: string
): Promise<{ ok: boolean; role?: AuthRole; error?: string }> {
  const result = await requestLogin(password);
  if (!result.ok || !result.token || !result.role) return { ok: false, error: result.error };
  setAuthSession(result.token, result.role);
  if (result.role === 'admin') {
    void trustThisDevice('이 PC');
  }
  return { ok: true, role: result.role };
}

/** 관리자 비번만 수락. 실패해도 스트리머 토큰을 바꾸지 않습니다. */
export async function unlockAdminPassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await requestLogin(password);
  if (!result.ok || !result.token) return { ok: false, error: result.error || '관리자 비밀번호가 아닙니다.' };
  if (result.role !== 'admin') {
    return { ok: false, error: '관리자 비밀번호가 아닙니다.' };
  }
  setAdminSession(result.token);
  void trustThisDevice('이 PC');
  return { ok: true };
}

export async function fetchAccessLog(): Promise<{
  ok: boolean;
  items?: AccessLogEntry[];
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch('/api/auth/access-log', {
      headers: adminAuthHeaders(),
    });
    const data = await readJsonOrEmpty<{ items?: AccessLogEntry[]; error?: string }>(response);
    if (response.status === 401) {
      return { ok: false, unauthorized: true, error: data.error || '인증이 필요합니다.' };
    }
    if (!response.ok) {
      return { ok: false, error: data.error || '접속 기록을 불러오지 못했습니다.' };
    }
    return { ok: true, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { ok: false, error: '접속 기록 서버에 연결하지 못했습니다.' };
  }
}

export async function clearAccessLog(): Promise<{
  ok: boolean;
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch('/api/auth/access-log', {
      method: 'DELETE',
      headers: adminAuthHeaders(),
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; error?: string }>(response);
    if (response.status === 401) {
      return { ok: false, unauthorized: true, error: data.error || '인증이 필요합니다.' };
    }
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '접속 기록을 비우지 못했습니다.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: '접속 기록 서버에 연결하지 못했습니다.' };
  }
}

export async function revokeAllStreamerSessions(password: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const response = await fetch('/api/auth/revoke-all', {
      method: 'POST',
      headers: deviceIdHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ password: password.trim() }),
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; error?: string }>(response);
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '세션 회수에 실패했습니다.' };
    }
    // 이 PC는 신뢰 기기로 epoch 예외 — 토큰을 지우지 않는다.
    return { ok: true };
  } catch {
    return { ok: false, error: '세션 회수 서버에 연결하지 못했습니다.' };
  }
}
