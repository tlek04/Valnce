import { pickRandomAttackSide, pickRandomMap } from '../constants/maps';
import { ColumnId, Player } from '../types';
import { autoBalanceTeams } from '../utils/balance';
import { withRemoteBoardApply } from '../utils/boardApplyGuard';
import { applyMove, repairLocks } from '../utils/placement';
import { normalizePlayer, toSessionPlayer, withAddNo } from '../utils/player';
import { sortPlayersByTier } from '../utils/rating';
import { findPlayer } from './playerState';
import { ActionCreator } from './actionTypes';

function stampBoard<T extends object>(patch: T): T & { boardUpdatedAt: number } {
  return { ...patch, boardUpdatedAt: Date.now() };
}

export const createBoardActions: ActionCreator<
  | 'enlistPlayer'
  | 'movePlayer'
  | 'autoBalance'
  | 'resetTeams'
  | 'drawRandomMap'
  | 'drawAttackSide'
  | 'applyRemoteBoard'
  | 'setBoardUpdatedAt'
> = (set, get) => ({
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
    set(stampBoard(result.state));
    return { ok: true, message: result.message };
  },

  movePlayer: (id, to, index) => {
    const result = applyMove(get(), id, to, index);
    if (!result) return { ok: false };
    if (!result.ok) return { ok: false, message: result.message };
    set(stampBoard(result.state));
    return { ok: true, message: result.message };
  },

  autoBalance: () => {
    const { team1, team2, waitlist } = get();
    const result = autoBalanceTeams(team1, team2, waitlist);
    if (result.ok) {
      const repaired = repairLocks(result);
      set(
        stampBoard({
          team1: sortPlayersByTier(repaired.team1),
          team2: sortPlayersByTier(repaired.team2),
          waitlist: repaired.waitlist,
          balanceNote: result.reason ?? null,
          balanceDetails: result.details ?? [],
        })
      );
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
    set((state) =>
      stampBoard({
        waitlist: [...state.waitlist, ...state.team1, ...state.team2],
        team1: [],
        team2: [],
        balanceNote: null,
        balanceDetails: [],
        matchMapId: null,
        attackSide: null,
        sessionSavedAt: Date.now(),
      })
    ),

  drawRandomMap: () => {
    const picked = pickRandomMap(get().matchMapId);
    set(stampBoard({ matchMapId: picked.id }));
    return { mapId: picked.id, label: picked.nameKo };
  },

  drawAttackSide: () => {
    const attackSide = pickRandomAttackSide();
    set(stampBoard({ attackSide }));
    const label = attackSide === 'TEAM_1' ? '1팀 공격 · 2팀 수비' : '2팀 공격 · 1팀 수비';
    return { attackSide, label };
  },

  applyRemoteBoard: (snapshot, updatedAt) =>
    withRemoteBoardApply(() => {
      const asPlayers = (list: Player[]) => list.map((item) => normalizePlayer(item));
      set({
        waitlist: asPlayers(snapshot.waitlist),
        team1: asPlayers(snapshot.team1),
        team2: asPlayers(snapshot.team2),
        matchMapId: snapshot.matchMapId,
        attackSide: snapshot.attackSide,
        balanceNote: snapshot.balanceNote,
        balanceDetails: Array.isArray(snapshot.balanceDetails) ? snapshot.balanceDetails : [],
        boardUpdatedAt: updatedAt,
        sessionSavedAt: Date.now(),
      });
    }),

  setBoardUpdatedAt: (updatedAt) => set({ boardUpdatedAt: updatedAt }),
});
