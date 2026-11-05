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
        sessionSavedAt: Date.now(),
        rosterUpdatedAt: state.rosterUpdatedAt,
        lastMatchSyncAt: state.lastMatchSyncAt,
        showMatchRecord: state.showMatchRecord,
      }),
      migrate: (persisted) => restorePersistedState(persisted as Partial<AppState>),
      merge: (persisted, current) => ({
        ...current,
        ...restorePersistedState(persisted as Partial<AppState>),
      }),
    }
  )
);
