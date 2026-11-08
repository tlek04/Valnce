import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AppState, AppStore } from '../types';
import { toSavedPlayer } from '../utils/player';
import { restorePersistedState } from './persistence';
import { createPlayerActions } from './createPlayerActions';
import { createBoardActions } from './createBoardActions';
import { createMatchActions } from './createMatchActions';

export const useAppStore = create<AppStore>()(
  persist(
    (set, get, api) => ({
      players: [],
      team1: [],
      team2: [],
      waitlist: [],
      balanceNote: null,
      balanceDetails: [],
      matchMapId: null,
      attackSide: null,
      sessionSavedAt: null,
      rosterUpdatedAt: 0,
      boardUpdatedAt: 0,
      lastMatchSyncAt: null,
      showMatchRecord: true,
      teamHistory: [],
      teamHistoryIndex: -1,

      ...createPlayerActions(set, get, api),
      ...createBoardActions(set, get, api),
      ...createMatchActions(set, get, api),
    }),
    {
      name: 'valorant-balancer-storage',
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            const raw = localStorage.getItem(name);
            if (raw) JSON.parse(raw);
            return raw;
          } catch { return null; }
        },
        setItem: (name, value) => { try { localStorage.setItem(name, value); } catch { /* storage unavailable */ } },
        removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* storage unavailable */ } },
      })),
      version: 6,
      partialize: (state) => ({
        players: state.players.map(toSavedPlayer),
        rosterUpdatedAt: state.rosterUpdatedAt,
        lastMatchSyncAt: state.lastMatchSyncAt,
      }),
      migrate: (persisted) => restorePersistedState(persisted as Partial<AppState>) as never,
      merge: (persisted, current) => {
        const restored = restorePersistedState(persisted as Partial<AppState>);
        return {
          ...current,
          ...restored,
          // 서버 site-settings가 이미 반영됐으면 persist 기본값(true)으로 덮지 않음
          showMatchRecord: current.showMatchRecord,
        };
      },
    }
  )
);
