import { Env } from './types';

export const TRUSTED_DEVICES_KEY = 'auth:trusted-devices';

export interface TrustedDevice {
  id: string;
  label?: string;
  trustedAt: number;
}

type TrustEnv = Pick<Env, 'ROSTER'>;

export function deviceIdFromRequest(request: Request): string {
  return (request.headers.get('X-Device-Id') || request.headers.get('x-device-id') || '').trim();
}

export async function readTrustedDevices(env: TrustEnv): Promise<TrustedDevice[]> {
  if (!env.ROSTER) return [];
  const stored = (await env.ROSTER.get(TRUSTED_DEVICES_KEY, 'json')) as TrustedDevice[] | null;
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item) => item && typeof item.id === 'string' && item.id.trim() && typeof item.trustedAt === 'number'
  );
}

export async function isTrustedDevice(env: TrustEnv, deviceId: string): Promise<boolean> {
  const id = deviceId.trim();
  if (!id) return false;
  const list = await readTrustedDevices(env);
  return list.some((item) => item.id === id);
}

export async function trustDevice(
  env: TrustEnv,
  deviceId: string,
  label?: string
): Promise<TrustedDevice[]> {
  const id = deviceId.trim();
  if (!id) return readTrustedDevices(env);
  const list = await readTrustedDevices(env);
  const nextLabel = label?.trim() || undefined;
  const existing = list.find((item) => item.id === id);
  const next: TrustedDevice[] = existing
    ? list.map((item) =>
        item.id === id
          ? {
              ...item,
              label: nextLabel ?? item.label,
              trustedAt: Date.now(),
            }
          : item
      )
    : [...list, { id, label: nextLabel, trustedAt: Date.now() }];
  if (env.ROSTER) {
    await env.ROSTER.put(TRUSTED_DEVICES_KEY, JSON.stringify(next));
  }
  return next;
}

export async function untrustDevice(env: TrustEnv, deviceId: string): Promise<TrustedDevice[]> {
  const id = deviceId.trim();
  const list = await readTrustedDevices(env);
  const next = id ? list.filter((item) => item.id !== id) : list;
  if (env.ROSTER) {
    await env.ROSTER.put(TRUSTED_DEVICES_KEY, JSON.stringify(next));
  }
  return next;
}
