import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState, AppStore, ColumnId, Player, QualifyingMatch } from '../types';
import { autoBalanceTeams } from '../utils/balance';
import { adjustMatchStat, applyMatchResult, recomputeStatsFromMatches } from '../utils/matchStats';
import { applyMove, applyRelationPlacement, repairLocks } from '../utils/placement';
import { restorePersistedState, stripPlayerLinks, syncRelations, toSavedPlayer, toSessionPlayer } from '../utils/player';
import { mergeSavedPlayers } from '../utils/rosterShare';
import { hasRiotIdentity } from '../utils/valorantMatch';

function withResult(player: Player, result: 'win' | 'loss'): Player {
  return { ...player, ...applyMatchResult(player, result) };
}

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

function withRelations(
  state: Pick<AppState, 'players' | 'team1' | 'team2' | 'waitlist'>,
  player: Player
): Pick<AppState, 'players' | 'team1' | 'team2' | 'waitlist'> {
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
      balanceNote: null,
      balanceDetails: [],
      sessionSavedAt: null,
      rosterUpdatedAt: 0,
      lastMatchSyncAt: null,

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
            balanceNote: result.reason ?? null,
            balanceDetails: result.details ?? [],
          });
        }
        return {
          ok: result.ok,
          message: result.message,
          diff: result.diff,
          reason: result.reason,
          details: result.details,
        };
      },

      resetTeams: () =>
        set(() => ({
          team1: [],
          team2: [],
          waitlist: [],
          balanceNote: null,
          balanceDetails: [],
          sessionSavedAt: Date.now(),
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

      recordTeamResult: (winner) => {
        const state = get();
        if (state.team1.length === 0 || state.team2.length === 0) {
          return { ok: false, message: '양 팀에 선수가 있어야 결과를 기록할 수 있습니다.' };
        }

        const winners = winner === 'TEAM_1' ? state.team1 : state.team2;
        const losers = winner === 'TEAM_1' ? state.team2 : state.team1;
        const nextById = new Map<string, Player>();
        for (const player of winners) nextById.set(player.id, withResult(player, 'win'));
        for (const player of losers) nextById.set(player.id, withResult(player, 'loss'));

        const patchList = (list: Player[]) => list.map((player) => nextById.get(player.id) ?? player);
        const patchSaved = state.players.map((saved) => {
          const updated = nextById.get(saved.id);
          return updated ? toSavedPlayer(updated) : saved;
        });

        set({
          players: patchSaved,
          team1: patchList(state.team1),
          team2: patchList(state.team2),
          waitlist: patchList(state.waitlist),
          rosterUpdatedAt: Date.now(),
        });

        const label = winner === 'TEAM_1' ? '1팀' : '2팀';
        return {
          ok: true,
          message: `${label} 승리로 기록했습니다. (${winners.length}승 / ${losers.length}패)`,
        };
      },

      recordPlayerResult: (id, result) =>
        set((state) => {
          const onBoard = findPlayer(state, id);
          const saved = state.players.find((item) => item.id === id);
          const current = onBoard ?? (saved ? toSessionPlayer(saved) : null);
          if (!current) return state;
          const updated = withResult(current, result);
          return {
            players: upsertSaved(state.players, updated),
            team1: state.team1.map((item) => (item.id === id ? updated : item)),
            team2: state.team2.map((item) => (item.id === id ? updated : item)),
            waitlist: state.waitlist.map((item) => (item.id === id ? updated : item)),
            rosterUpdatedAt: Date.now(),
          };
        }),

      adjustPlayerRecord: (id, field, delta) =>
        set((state) => {
          const onBoard = findPlayer(state, id);
          const saved = state.players.find((item) => item.id === id);
          const current = onBoard ?? (saved ? toSessionPlayer(saved) : null);
          if (!current) return state;
          const nextStats = adjustMatchStat(current, field, delta);
          if (
            nextStats.wins === current.wins &&
            nextStats.losses === current.losses &&
            nextStats.streak === current.streak
          ) {
            return state;
          }
          const updated = { ...current, ...nextStats };
          return {
            players: upsertSaved(state.players, updated),
            team1: state.team1.map((item) => (item.id === id ? updated : item)),
            team2: state.team2.map((item) => (item.id === id ? updated : item)),
            waitlist: state.waitlist.map((item) => (item.id === id ? updated : item)),
            rosterUpdatedAt: Date.now(),
          };
        }),

      reconcileMatchStats: (matches: QualifyingMatch[]) =>
        set((state) => {
          const taggedIds = state.players.filter(hasRiotIdentity).map((player) => player.id);
          const recomputed = recomputeStatsFromMatches(taggedIds, matches);
          const patchStats = <T extends { id: string; wins: number; losses: number; streak: number }>(
            player: T
          ): T => {
            const next = recomputed.get(player.id);
            if (!next) return player;
            return { ...player, wins: next.wins, losses: next.losses, streak: next.streak };
          };

          return {
            players: state.players.map((player) => {
              const next = recomputed.get(player.id);
              return next ? { ...player, ...next } : player;
            }),
            team1: state.team1.map(patchStats),
            team2: state.team2.map(patchStats),
            waitlist: state.waitlist.map(patchStats),
            lastMatchSyncAt: Date.now(),
            rosterUpdatedAt: Date.now(),
          };
        }),
    }),
    {
      name: 'valorant-balancer-storage',
      version: 4,
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
      }),
      migrate: (persisted) => restorePersistedState(persisted as Partial<AppState>),
      merge: (persisted, current) => ({
        ...current,
        ...restorePersistedState(persisted as Partial<AppState>),
      }),
    }
  )
);
