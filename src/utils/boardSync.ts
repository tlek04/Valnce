import { Player } from '../types';
import { normalizePlayer } from './player';
import { staffFetch } from './streamerAuth';

export interface RemoteBoard {
  updatedAt: number;
  waitlist: Player[];
  team1: Player[];
  team2: Player[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
  balanceNote: string | null;
  balanceDetails: string[];
}

export type PushBoardResult =
  | { ok: true; updatedAt?: number }
  | { ok: false; conflict?: false; unauthorized?: boolean }
  | { ok: false; conflict: true; board: RemoteBoard };

function apiUrl() {
  const fromEnv = import.meta.env.VITE_ROSTER_API as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/api\/roster\/?$/, '/api/board');
  }
  return '/api/board';
}

export function isBoardSyncConfigured() {
  return Boolean(import.meta.env.VITE_ROSTER_API) || import.meta.env.PROD;
}

export async function fetchRemoteBoard(): Promise<RemoteBoard | null> {
  try {
    const response = await fetch(apiUrl(), { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RemoteBoard>;
    return normalizeRemoteBoard(data);
  } catch {
    return null;
  }
}

export async function pushRemoteBoard(
  snapshot: Omit<RemoteBoard, 'updatedAt'>,
  updatedAt: number,
  baseUpdatedAt = 0
): Promise<PushBoardResult> {
  try {
    const response = await staffFetch(apiUrl(), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        updatedAt,
        baseUpdatedAt,
        waitlist: snapshot.waitlist,
        team1: snapshot.team1,
        team2: snapshot.team2,
        matchMapId: snapshot.matchMapId,
        attackSide: snapshot.attackSide,
        balanceNote: snapshot.balanceNote,
        balanceDetails: snapshot.balanceDetails,
      }),
    });
    if (response.status === 409) {
      const data = (await response.json()) as Partial<RemoteBoard>;
      return { ok: false, conflict: true, board: normalizeRemoteBoard(data) };
    }
    if (response.status === 401) {
      return { ok: false, unauthorized: true };
    }
    if (!response.ok) return { ok: false };
    const data = await response.json().catch(() => ({})) as { updatedAt?: number };
    return { ok: true, ...(typeof data.updatedAt === 'number' ? { updatedAt: data.updatedAt } : {}) };
  } catch {
    return { ok: false };
  }
}

function asPlayers(value: unknown): Player[] {
  return Array.isArray(value) ? value.map((item) => normalizePlayer(item)) : [];
}

export function normalizeRemoteBoard(data: Partial<RemoteBoard> | Record<string, unknown>): RemoteBoard {
  const attackSide = data.attackSide;
  return {
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    waitlist: asPlayers(data.waitlist),
    team1: asPlayers(data.team1),
    team2: asPlayers(data.team2),
    matchMapId: typeof data.matchMapId === 'string' ? data.matchMapId : null,
    attackSide: attackSide === 'TEAM_1' || attackSide === 'TEAM_2' ? attackSide : null,
    balanceNote: typeof data.balanceNote === 'string' ? data.balanceNote : null,
    balanceDetails: Array.isArray(data.balanceDetails)
      ? data.balanceDetails.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function boardSnapshotFromState(state: {
  waitlist: Player[];
  team1: Player[];
  team2: Player[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
  balanceNote: string | null;
  balanceDetails: string[];
}): Omit<RemoteBoard, 'updatedAt'> {
  return {
    waitlist: state.waitlist,
    team1: state.team1,
    team2: state.team2,
    matchMapId: state.matchMapId,
    attackSide: state.attackSide,
    balanceNote: state.balanceNote,
    balanceDetails: state.balanceDetails,
  };
}
