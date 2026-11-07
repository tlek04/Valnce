import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
      lastMatchSyncAt: null,
      showMatchRecord: true,

      ...createPlayerActions(set, get, api),
      ...createBoardActions(set, get, api),
      ...createMatchActions(set, get, api),
    }),
    {
      name: 'valorant-balancer-storage',
      version: 5,
      partialize: (state) => ({
        players: state.players.map(toSavedPlayer),
        waitlist: state.waitlist,
        team1: state.team1,
        team2: state.team2,
        balanceNote: state.balanceNote,
        balanceDetails: state.balanceDetails,
        matchMapId: state.matchMapId,
        attackSide: state.attackSide,
        sessionSavedAt: Date.now(),
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
