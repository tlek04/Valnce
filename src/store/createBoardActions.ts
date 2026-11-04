import { ColumnId } from '../types';
import { autoBalanceTeams } from '../utils/balance';
import { applyMove, repairLocks } from '../utils/placement';
import { toSessionPlayer, withAddNo } from '../utils/player';
import { sortPlayersByTier } from '../utils/rating';
import { findPlayer } from './playerState';
import { ActionCreator } from './actionTypes';

export const createBoardActions: ActionCreator<'enlistPlayer' | 'movePlayer' | 'autoBalance' | 'resetTeams'> = (set, get) => ({
  enlistPlayer: (id, to: ColumnId = 'waitlist', index) => {
    const state = get();
    const saved = state.players.find((item) => item.id === id);
    if (!saved) return { ok: false, message: '저장된 플레이어를 찾을 수 없습니다.' };
    if (findPlayer(state, id)) {
      return get().movePlayer(id, to, index);
    }

    const session = withAddNo(toSessionPlayer(saved), [
      state.waitlist,
      state.team1,
      state.team2,
    ]);
    const seeded = {
      waitlist: [...state.waitlist, session],
      team1: state.team1,
      team2: state.team2,
    };
    const result = applyMove(seeded, id, to, index);
    if (!result) return { ok: false };
    if (!result.ok) return { ok: false, message: result.message };
    set(result.state);
    return { ok: true, message: result.message };
  },

  movePlayer: (id, to, index) => {
    const result = applyMove(get(), id, to, index);
    if (!result) return { ok: false };
    if (!result.ok) return { ok: false, message: result.message };
    set(result.state);
    return { ok: true, message: result.message };
  },

  autoBalance: () => {
    const { team1, team2, waitlist } = get();
    const result = autoBalanceTeams(team1, team2, waitlist);
    if (result.ok) {
      const repaired = repairLocks(result);
      set({
        team1: sortPlayersByTier(repaired.team1),
        team2: sortPlayersByTier(repaired.team2),
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
    set((state) => ({
      waitlist: [...state.waitlist, ...state.team1, ...state.team2],
      team1: [],
      team2: [],
      balanceNote: null,
      balanceDetails: [],
      sessionSavedAt: Date.now(),
    })),

});
