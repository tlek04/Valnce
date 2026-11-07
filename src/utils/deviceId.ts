const DEVICE_ID_KEY = 'valnce-device-id';

export const DEVICE_ID_HEADER = 'X-Device-Id';

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)?.trim();
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'unknown-device';
  }
}

export function deviceIdHeaders(extra?: HeadersInit): HeadersInit {
  return {
    ...(extra ?? {}),
    [DEVICE_ID_HEADER]: getOrCreateDeviceId(),
  };
}
