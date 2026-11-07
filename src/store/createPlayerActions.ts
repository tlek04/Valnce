import { Player } from '../types';
import { applyRelationPlacement } from '../utils/placement';
import { toSavedPlayer, withAddNo } from '../utils/player';
import { stripPlayerLinks } from '../utils/relations';
import { mergeSavedPlayers } from '../utils/rosterShare';
import { resolvePlayer, withRelations } from './playerState';
import { ActionCreator } from './actionTypes';
import { withRemoteBoardApply } from '../utils/boardApplyGuard';
import { withRemoteRosterApply } from '../utils/rosterApplyGuard';

export const createPlayerActions: ActionCreator<
  'addPlayer' | 'updatePlayer' | 'removePlayer' | 'dismissPlayer' |
  'clearRoster' | 'importSavedPlayers' | 'applyRemoteRoster' | 'setRosterUpdatedAt' |
  'setShowMatchRecord'
> = (set, get) => ({
  addPlayer: (player: Player) => {
    let message: string | undefined;
    const now = Date.now();
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
      return {
        ...related,
        ...placed.state,
        rosterUpdatedAt: now,
        boardUpdatedAt: now,
      };
    });
    return message;
  },

  updatePlayer: (id: string, updates: Partial<Player>) => {
    let message: string | undefined;
    const now = Date.now();
    set((state) => {
      const current = resolvePlayer(state, id);
      if (!current) return state;
      const player = { ...current, ...updates, id };
      const related = withRelations(state, player);
      const placed = applyRelationPlacement(related, player);
      message = placed.message;
      const onBoard = [...state.waitlist, ...state.team1, ...state.team2].some(
        (row) => row.id === id
      );
      return {
        ...related,
        ...placed.state,
        rosterUpdatedAt: now,
        ...(onBoard ? { boardUpdatedAt: now } : {}),
      };
    });
    return message;
  },

  removePlayer: (id: string) =>
    set((state) => {
      const now = Date.now();
      return {
        players: state.players.filter((player) => player.id !== id),
        team1: stripPlayerLinks(state.team1, id),
        team2: stripPlayerLinks(state.team2, id),
        waitlist: stripPlayerLinks(state.waitlist, id),
        rosterUpdatedAt: now,
        boardUpdatedAt: now,
      };
    }),

  dismissPlayer: (id: string) =>
    set((state) => ({
      waitlist: state.waitlist.filter((player) => player.id !== id),
      team1: state.team1.filter((player) => player.id !== id),
      team2: state.team2.filter((player) => player.id !== id),
      boardUpdatedAt: Date.now(),
    })),

  clearRoster: () =>
    set(() => {
      const now = Date.now();
      return {
        players: [],
        team1: [],
        team2: [],
        waitlist: [],
        balanceNote: null,
        balanceDetails: [],
        matchMapId: null,
        attackSide: null,
        sessionSavedAt: now,
        rosterUpdatedAt: now,
        boardUpdatedAt: now,
      };
    }),

  importSavedPlayers: (incoming) => {
    const state = get();
    const merged = mergeSavedPlayers(state.players, incoming);
    const added = merged.length - state.players.length;
    set({ players: merged, rosterUpdatedAt: Date.now() });
    return Math.max(0, added);
  },

  applyRemoteRoster: (incoming, updatedAt) =>
    withRemoteRosterApply(() =>
      // 보드 칸 프로필만 맞출 때 board sync push가 돌지 않게 막는다
      withRemoteBoardApply(() =>
        set((state) => {
          const players = incoming.map(toSavedPlayer);
          const byId = new Map(players.map((player) => [player.id, player]));
          const patchBoard = (list: typeof state.waitlist) =>
            list.map((player) => {
              const remote = byId.get(player.id);
              if (!remote) return player;
              return {
                ...player,
                name: remote.name,
                currentTier: remote.currentTier,
                maxTier: remote.maxTier ?? player.maxTier,
                ...(remote.internalTier
                  ? { internalTier: remote.internalTier }
                  : { internalTier: undefined }),
                ...(remote.riotName ? { riotName: remote.riotName } : {}),
                ...(remote.riotTag ? { riotTag: remote.riotTag } : {}),
                ...(remote.lockedTeam !== undefined ? { lockedTeam: remote.lockedTeam } : {}),
                canOrder: Boolean(remote.canOrder),
                restrictions: remote.restrictions ?? [],
                rivalIds: remote.rivalIds ?? [],
                allyIds: remote.allyIds ?? [],
                wins: remote.wins,
                losses: remote.losses,
                streak: remote.streak,
                playAts: remote.playAts ?? player.playAts ?? [],
                playCount: remote.playCount ?? player.playCount ?? 0,
              };
            });
          return {
            players,
            rosterUpdatedAt: updatedAt,
            waitlist: patchBoard(state.waitlist),
            team1: patchBoard(state.team1),
            team2: patchBoard(state.team2),
          };
        })
      )
    ),
  setRosterUpdatedAt: (updatedAt) => set({ rosterUpdatedAt: updatedAt }),
  setShowMatchRecord: (value) => set({ showMatchRecord: Boolean(value) }),
});
