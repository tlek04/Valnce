import { AppState, Player, SavedPlayer } from '../types';
import { toSavedPlayer, normalizePlayer, nextAddNo, readQueueNo } from '../utils/player';
import { repairLocks } from '../utils/placement';

/** 새로고침·창 종료 후 보드를 유지하는 시간. */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function hydrateLibrary(raw: Partial<AppState> | undefined): AppState {
  const seen = new Set<string>();
  const players: SavedPlayer[] = [];
  for (const item of raw?.players ?? []) {
    const saved = toSavedPlayer(item);
    if (seen.has(saved.id)) continue;
    seen.add(saved.id);
    players.push(saved);
  }
  return {
    players,
    waitlist: [],
    team1: [],
    team2: [],
    balanceNote: null,
    balanceDetails: [],
    sessionSavedAt: null,
    rosterUpdatedAt: 0,
    lastMatchSyncAt: typeof raw?.lastMatchSyncAt === 'number' ? raw.lastMatchSyncAt : null,
    showMatchRecord: raw?.showMatchRecord !== false,
  };
}

function takeBoardColumn(list: unknown[] | undefined, used: Set<string>): Player[] {
  const next: Player[] = [];
  for (const item of list ?? []) {
    const player = normalizePlayer(item);
    if (used.has(player.id)) continue;
    used.add(player.id);
    next.push(player);
  }
  return next;
}

/** 기존 명단은 항상 복구하고, 보드는 2시간 안에 저장된 경우만 살린다. */
export function restorePersistedState(raw: Partial<AppState> | undefined): AppState {
  const library = hydrateLibrary(raw);
  const savedAt = typeof raw?.sessionSavedAt === 'number' ? raw.sessionSavedAt : 0;
  if (!raw || !savedAt || Date.now() - savedAt > SESSION_TTL_MS) {
    return library;
  }

  const used = new Set<string>();
  const repaired = repairLocks({
    waitlist: takeBoardColumn(raw.waitlist as unknown[] | undefined, used),
    team1: takeBoardColumn(raw.team1 as unknown[] | undefined, used),
    team2: takeBoardColumn(raw.team2 as unknown[] | undefined, used),
  });
  const balanceDetails = Array.isArray(raw.balanceDetails)
    ? raw.balanceDetails.filter((item): item is string => typeof item === 'string')
    : [];

  let next = nextAddNo([repaired.waitlist, repaired.team1, repaired.team2]);
  const fillBoard = (list: Player[]): Player[] =>
    list.map((player) => {
      if (readQueueNo(player.queueNo)) return player;
      const queueNo = next;
      next += 1;
      return { ...player, queueNo };
    });

  return {
    players: library.players,
    waitlist: fillBoard(repaired.waitlist),
    team1: fillBoard(repaired.team1),
    team2: fillBoard(repaired.team2),
    balanceNote: typeof raw.balanceNote === 'string' ? raw.balanceNote : null,
    balanceDetails,
    sessionSavedAt: savedAt,
    rosterUpdatedAt: typeof raw.rosterUpdatedAt === 'number' ? raw.rosterUpdatedAt : 0,
    lastMatchSyncAt: typeof raw.lastMatchSyncAt === 'number' ? raw.lastMatchSyncAt : null,
    showMatchRecord: raw.showMatchRecord !== false,
  };
}
