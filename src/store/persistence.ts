import { AppState, SavedPlayer } from '../types';
import { toSavedPlayer } from '../utils/player';

/** 명단만 로컬 복구. 보드는 서버 공유 보드 sync로만 채운다. */
export function hydrateLibrary(raw: Partial<AppState> | undefined): AppState {
  const seen = new Set<string>();
  const players: SavedPlayer[] = [];
  for (const item of Array.isArray(raw?.players) ? raw.players : []) {
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
    matchMapId: null,
    attackSide: null,
    sessionSavedAt: null,
    rosterUpdatedAt: typeof raw?.rosterUpdatedAt === 'number' ? raw.rosterUpdatedAt : 0,
    boardUpdatedAt: 0,
    lastMatchSyncAt: typeof raw?.lastMatchSyncAt === 'number' ? raw.lastMatchSyncAt : null,
    // 서버 site-settings만 사용. persist 잔여 값은 무시하고 기본 켜짐(마운트 시 fetch로 덮음).
    showMatchRecord: true,
  };
}

/** @deprecated 보드 로컬 캐시 제거. hydrateLibrary와 동일. */
export function restorePersistedState(raw: Partial<AppState> | undefined): AppState {
  return hydrateLibrary(raw);
}
