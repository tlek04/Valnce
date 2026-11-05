import { Player } from '../types';
import { applyRelationPlacement } from '../utils/placement';
import { toSavedPlayer, withAddNo } from '../utils/player';
import { stripPlayerLinks } from '../utils/relations';
import { mergeSavedPlayers } from '../utils/rosterShare';
import { resolvePlayer, withRelations } from './playerState';
import { ActionCreator } from './actionTypes';

export const createPlayerActions: ActionCreator<
  'addPlayer' | 'updatePlayer' | 'removePlayer' | 'dismissPlayer' |
  'clearRoster' | 'importSavedPlayers' | 'applyRemoteRoster' | 'setRosterUpdatedAt' |
  'setShowMatchRecord'
> = (set, get) => ({
  addPlayer: (player: Player) => {
    let message: string | undefined;
    set((state) => {
      const numbered = withAddNo(player, [state.waitlist, state.team1, state.team2]);
      const related = withRelations(
        {
          players: state.players,
          waitlist: [...state.waitlist, numbered],
          team1: [...state.team1],
          team2: [...state.team2],
        },
        numbered
      );
      const placed = applyRelationPlacement(related, numbered);
      message = placed.message;
      return { ...related, ...placed.state };
    });
    return message;
  },

  updatePlayer: (id: string, updates: Partial<Player>) => {
    let message: string | undefined;
    set((state) => {
      const current = resolvePlayer(state, id);
      if (!current) return state;
      const player = { ...current, ...updates, id };
      const related = withRelations(state, player);
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

  clearRoster: () =>
    set(() => ({
      players: [],
      team1: [],
      team2: [],
      waitlist: [],
      balanceNote: null,
      balanceDetails: [],
      sessionSavedAt: Date.now(),
    })),

  importSavedPlayers: (incoming) => {
    const state = get();
    const merged = mergeSavedPlayers(state.players, incoming);
    const added = merged.length - state.players.length;
    set({ players: merged, rosterUpdatedAt: Date.now() });
    return Math.max(0, added);
  },

  applyRemoteRoster: (incoming, updatedAt) =>
    set({
      players: incoming.map(toSavedPlayer),
      rosterUpdatedAt: updatedAt,
    }),
  setRosterUpdatedAt: (updatedAt) => set({ rosterUpdatedAt: updatedAt }),
  setShowMatchRecord: (value) => set({ showMatchRecord: Boolean(value) }),
});
