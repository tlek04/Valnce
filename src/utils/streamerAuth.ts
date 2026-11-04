const STORAGE_KEY = 'valnce-streamer-token';

export function getStreamerToken(): string | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function setStreamerToken(password: string): void {
  sessionStorage.setItem(STORAGE_KEY, password);
}

export function clearStreamerToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function streamerAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStreamerToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function verifyStreamerPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '비밀번호가 올바르지 않습니다.' };
    }
    setStreamerToken(password);
    return { ok: true };
  } catch {
    return { ok: false, error: '인증 서버에 연결하지 못했습니다.' };
  }
}
