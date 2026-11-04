import { Player, QualifyingMatch } from '../types';
import { adjustMatchStat, applyMatchResult, recomputeStatsFromMatches } from '../utils/matchStats';
import { toSavedPlayer } from '../utils/player';
import { hasRiotIdentity } from '../utils/valorantMatch';
import { resolvePlayer, replacePlayer, mapBoard } from './playerState';
import { ActionCreator } from './actionTypes';

function withResult(player: Player, result: 'win' | 'loss'): Player {
  return { ...player, ...applyMatchResult(player, result) };
}

export const createMatchActions: ActionCreator<
  'recordTeamResult' | 'recordPlayerResult' | 'adjustPlayerRecord' |
  'reconcileMatchStats' | 'markMatchSyncAttempt'
> = (set, get) => ({
  markMatchSyncAttempt: () => set({ lastMatchSyncAt: Date.now() }),
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

    const patchSaved = state.players.map((saved) => {
      const updated = nextById.get(saved.id);
      return updated ? toSavedPlayer(updated) : saved;
    });

    set({
      players: patchSaved,
      ...mapBoard(state, (player) => nextById.get(player.id) ?? player),
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
      const current = resolvePlayer(state, id);
      if (!current) return state;
      const updated = withResult(current, result);
      return {
        ...replacePlayer(state, updated),
        rosterUpdatedAt: Date.now(),
      };
    }),

  adjustPlayerRecord: (id, field, delta) =>
    set((state) => {
      const current = resolvePlayer(state, id);
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
        ...replacePlayer(state, updated),
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
        ...mapBoard(state, patchStats),
        lastMatchSyncAt: Date.now(),
        rosterUpdatedAt: Date.now(),
      };
    }),
});
