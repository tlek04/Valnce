import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, AppStore, ColumnId, Player } from '../types';
import { autoBalanceTeams } from '../utils/balance';
import { applyMove, applyRelationPlacement, repairLocks } from '../utils/placement';
import { hydrateLibrary, stripPlayerLinks, syncRelations, toSavedPlayer, toSessionPlayer } from '../utils/player';

function findPlayer(state: { waitlist: Player[]; team1: Player[]; team2: Player[] }, id: string) {
  return (
    state.waitlist.find((player) => player.id === id) ||
    state.team1.find((player) => player.id === id) ||
    state.team2.find((player) => player.id === id) ||
    null
  );
}

function upsertSaved(list: AppState['players'], player: Player) {
  const saved = toSavedPlayer(player);
  return list.some((item) => item.id === player.id)
    ? list.map((item) => (item.id === player.id ? saved : item))
    : [...list, saved];
}

function withRelations(state: AppState, player: Player): Pick<AppState, 'players' | 'team1' | 'team2' | 'waitlist'> {
  const apply = (list: Player[]) =>
    syncRelations(
      list.map((item) => (item.id === player.id ? player : item)),
      player.id,
      player.rivalIds,
      player.allyIds
    );
  return {
    players: upsertSaved(state.players, player),
    team1: apply(state.team1),
    team2: apply(state.team2),
    waitlist: apply(state.waitlist),
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      players: [],
      team1: [],
      team2: [],
      waitlist: [],

      addPlayer: (player: Player) => {
        let message: string | undefined;
        set((state) => {
          const related = withRelations(
            {
              players: upsertSaved(state.players, player),
              waitlist: [...state.waitlist, player],
              team1: [...state.team1],
              team2: [...state.team2],
            },
            player
          );
          const placed = applyRelationPlacement(related, player);
          message = placed.message;
          return { ...related, ...placed.state };
        });
        return message;
      },

      updatePlayer: (id: string, updates: Partial<Player>) => {
        let message: string | undefined;
        set((state) => {
          const saved = state.players.find((player) => player.id === id);
          const current = findPlayer(state, id) ?? (saved ? toSessionPlayer(saved) : null);
          if (!current) return state;
          const player = { ...current, ...updates, id };
          const mapped = (list: Player[]) => list.map((item) => (item.id === id ? player : item));
          const related = withRelations(
            {
              players: state.players,
              team1: mapped(state.team1),
              team2: mapped(state.team2),
              waitlist: mapped(state.waitlist),
            },
            player
          );
          const placed = applyRelationPlacement(related, player);
          message = placed.message;
          return { ...related, ...placed.state };
        });
        return message;
      },

      removePlayer: (id: string) =>
        set((state) => ({
          players: state.players.filter((player) => player.id !== id),
          team1: stripPlayerLinks(state.team1, id),
          team2: stripPlayerLinks(state.team2, id),
          waitlist: stripPlayerLinks(state.waitlist, id),
        })),

      dismissPlayer: (id: string) =>
        set((state) => ({
          waitlist: state.waitlist.filter((player) => player.id !== id),
          team1: state.team1.filter((player) => player.id !== id),
          team2: state.team2.filter((player) => player.id !== id),
        })),

      enlistPlayer: (id, to: ColumnId = 'waitlist', index) => {
        const state = get();
        const saved = state.players.find((item) => item.id === id);
        if (!saved) return { ok: false, message: '저장된 플레이어를 찾을 수 없습니다.' };
        if (findPlayer(state, id)) {
          return get().movePlayer(id, to, index);
        }

        const seeded = {
          waitlist: [...state.waitlist, toSessionPlayer(saved)],
          team1: state.team1,
          team2: state.team2,
        };
        const result = applyMove(seeded, id, to, index);
        if (!result) return { ok: false };
        if (!result.ok) return { ok: false, message: result.message };
        set({ waitlist: result.state.waitlist, team1: result.state.team1, team2: result.state.team2 });
        return { ok: true, message: result.message };
      },

      movePlayer: (id, to, index) => {
        const result = applyMove(get(), id, to, index);
        if (!result) return { ok: false };
        if (!result.ok) return { ok: false, message: result.message };
        set({ waitlist: result.state.waitlist, team1: result.state.team1, team2: result.state.team2 });
        return { ok: true, message: result.message };
      },

      autoBalance: () => {
        const { team1, team2, waitlist } = get();
        const result = autoBalanceTeams(team1, team2, waitlist);
        if (result.ok) {
          const repaired = repairLocks(result);
          set({
            team1: repaired.team1,
            team2: repaired.team2,
            waitlist: repaired.waitlist,
          });
        }
        return { ok: result.ok, message: result.message, diff: result.diff };
      },

      resetTeams: () =>
        set(() => ({
          team1: [],
          team2: [],
          waitlist: [],
        })),

      clearRoster: () =>
        set(() => ({
          players: [],
          team1: [],
          team2: [],
          waitlist: [],
        })),
    }),
    {
      name: 'valorant-balancer-storage',
      version: 3,
      partialize: (state) => ({ players: state.players.map(toSavedPlayer) }),
      migrate: (persisted) => hydrateLibrary(persisted as Partial<AppState>),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const hydrated = hydrateLibrary(state);
        state.players = hydrated.players;
        state.waitlist = [];
        state.team1 = [];
        state.team2 = [];
      },
    }
  )
);
