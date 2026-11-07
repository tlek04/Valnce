import { SavedPlayer } from '../types';
import { toSavedPlayer } from './player';
import { staffFetch } from './streamerAuth';

export interface RemoteRoster {
  updatedAt: number;
  players: SavedPlayer[];
}

export type PushRosterResult =
  | { ok: true }
  | { ok: false; conflict?: false; unauthorized?: boolean }
  | { ok: false; conflict: true; roster: RemoteRoster };

function apiUrl() {
  const fromEnv = import.meta.env.VITE_ROSTER_API as string | undefined;
  return fromEnv?.trim() || '/api/roster';
}

export function isRosterSyncConfigured() {
  // 같은 오리진 Functions 또는 명시적 API URL
  return Boolean(import.meta.env.VITE_ROSTER_API) || import.meta.env.PROD;
}

export async function fetchRemoteRoster(): Promise<RemoteRoster | null> {
  try {
    const response = await fetch(apiUrl(), { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { updatedAt?: number; players?: unknown[] };
    return normalizeRemoteRoster(data);
  } catch {
    return null;
  }
}

export async function pushRemoteRoster(players: SavedPlayer[], updatedAt: number): Promise<PushRosterResult> {
  try {
    const response = await staffFetch(apiUrl(), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        updatedAt,
        players: players.map((player) => toSavedPlayer(player)),
      }),
    });
    if (response.status === 409) {
      const data = (await response.json()) as { updatedAt?: number; players?: unknown[] };
      return {
        ok: false,
        conflict: true,
        roster: normalizeRemoteRoster(data),
      };
    }
    if (response.status === 401) {
      return { ok: false, unauthorized: true };
    }
    return response.ok ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function normalizeRemoteRoster(data: { updatedAt?: number; players?: unknown[] }): RemoteRoster {
  return {
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    players: Array.isArray(data.players) ? data.players.map(toSavedPlayer) : [],
  };
}
