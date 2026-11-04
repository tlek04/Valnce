import { readJsonOrEmpty } from './apiResponse';

const STORAGE_KEY = 'valnce-streamer-token';

export interface AccessLogEntry {
  ip: string;
  at: number;
  ok: boolean;
}

export function getStreamerToken(): string | null {
  try {
    const local = localStorage.getItem(STORAGE_KEY)?.trim();
    if (local) return local;
    const session = sessionStorage.getItem(STORAGE_KEY)?.trim();
    if (session) {
      localStorage.setItem(STORAGE_KEY, session);
      sessionStorage.removeItem(STORAGE_KEY);
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStreamerToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStreamerToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function streamerAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStreamerToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function verifyStreamerPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = password.trim();
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: trimmed }),
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; token?: string; error?: string }>(response);
    if (!response.ok || !data.ok || !data.token) {
      return { ok: false, error: data.error || '비밀번호가 올바르지 않습니다.' };
    }
    setStreamerToken(data.token);
    return { ok: true };
  } catch {
    return { ok: false, error: '인증 서버에 연결하지 못했습니다.' };
  }
}

export async function fetchAccessLog(): Promise<{
  ok: boolean;
  items?: AccessLogEntry[];
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch('/api/auth/access-log', {
      headers: streamerAuthHeaders(),
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

export async function revokeAllStreamerSessions(password: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const response = await fetch('/api/auth/revoke-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: password.trim() }),
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; error?: string }>(response);
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '세션 회수에 실패했습니다.' };
    }
    clearStreamerToken();
    return { ok: true };
  } catch {
    return { ok: false, error: '세션 회수 서버에 연결하지 못했습니다.' };
  }
}
