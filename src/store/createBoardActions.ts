import { pickRandomAttackSide, pickRandomMap } from '../constants/maps';
import { ColumnId, Player, TeamHistorySnapshot } from '../types';
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

function clonePlayers(list: Player[]): Player[] {
  return list.map((player) => normalizePlayer(player));
}

function captureTeamSnapshot(state: {
  waitlist: Player[];
  team1: Player[];
  team2: Player[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
  balanceNote: string | null;
  balanceDetails: string[];
}): TeamHistorySnapshot {
  return {
    waitlist: clonePlayers(state.waitlist),
    team1: clonePlayers(state.team1),
    team2: clonePlayers(state.team2),
    matchMapId: state.matchMapId,
    attackSide: state.attackSide,
    balanceNote: state.balanceNote,
    balanceDetails: [...state.balanceDetails],
  };
}

function restoreTeamSnapshot(snapshot: TeamHistorySnapshot) {
  return stampBoard({
    waitlist: clonePlayers(snapshot.waitlist),
    team1: clonePlayers(snapshot.team1),
    team2: clonePlayers(snapshot.team2),
    matchMapId: snapshot.matchMapId,
    attackSide: snapshot.attackSide,
    balanceNote: snapshot.balanceNote,
    balanceDetails: [...snapshot.balanceDetails],
  });
}

function isAbsentCheckIn(player: Player) {
  return player.checkIn === null || player.checkIn === 'away';
}

export const createBoardActions: ActionCreator<
  | 'enlistPlayer'
  | 'movePlayer'
  | 'autoBalance'
  | 'resetTeams'
  | 'dismissAbsentPlayers'
  | 'saveTeamSnapshot'
  | 'prevTeamSnapshot'
  | 'nextTeamSnapshot'
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

  autoBalance: (focus = 'fair') => {
    const { team1, team2, waitlist } = get();
    const result = autoBalanceTeams(team1, team2, waitlist, focus);
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
    set((state) => {
      const waitlist = [...state.waitlist, ...state.team1, ...state.team2].map((player) => ({
        ...player,
        checkIn: null,
      }));
      return stampBoard({
        waitlist,
        team1: [],
        team2: [],
        balanceNote: null,
        balanceDetails: [],
        matchMapId: null,
        attackSide: null,
        sessionSavedAt: Date.now(),
        teamHistory: [],
        teamHistoryIndex: -1,
      });
    }),

  dismissAbsentPlayers: () => {
    const state = get();
    const keep = (player: Player) => !isAbsentCheckIn(player);
    const before =
      state.waitlist.length + state.team1.length + state.team2.length;
    const waitlist = state.waitlist.filter(keep);
    const team1 = state.team1.filter(keep);
    const team2 = state.team2.filter(keep);
    const after = waitlist.length + team1.length + team2.length;
    const removed = before - after;
    if (removed === 0) {
      return { ok: false, removed: 0, message: '내보낼 미응답·불참이 없습니다.' };
    }
    set(
      stampBoard({
        waitlist,
        team1,
        team2,
      })
    );
    return {
      ok: true,
      removed,
      message: `미응답·불참 ${removed}명을 내보냈습니다.`,
    };
  },

  saveTeamSnapshot: () => {
    const state = get();
    if (state.team1.length === 0 && state.team2.length === 0) {
      return { ok: false, message: '저장된 팀이 없습니다. 먼저 팀을 짜 주세요.' };
    }
    const snapshot = captureTeamSnapshot(state);
    const kept = state.teamHistory.slice(0, Math.max(0, state.teamHistoryIndex + 1));
    const teamHistory = [...kept, snapshot];
    set({
      teamHistory,
      teamHistoryIndex: teamHistory.length - 1,
    });
    return { ok: true, message: `팀 구성 임시 저장 (${teamHistory.length})` };
  },

  prevTeamSnapshot: () => {
    const state = get();
    if (state.teamHistory.length === 0 || state.teamHistoryIndex <= 0) {
      return { ok: false, message: '이전 저장이 없습니다.' };
    }
    const teamHistoryIndex = state.teamHistoryIndex - 1;
    const snapshot = state.teamHistory[teamHistoryIndex];
    if (!snapshot) return { ok: false, message: '이전 저장이 없습니다.' };
    set({
      ...restoreTeamSnapshot(snapshot),
      teamHistoryIndex,
    });
    return { ok: true, message: `임시 저장 ${teamHistoryIndex + 1}/${state.teamHistory.length}` };
  },

  nextTeamSnapshot: () => {
    const state = get();
    if (state.teamHistory.length === 0 || state.teamHistoryIndex >= state.teamHistory.length - 1) {
      return { ok: false, message: '다음 저장이 없습니다.' };
    }
    const teamHistoryIndex = state.teamHistoryIndex + 1;
    const snapshot = state.teamHistory[teamHistoryIndex];
    if (!snapshot) return { ok: false, message: '다음 저장이 없습니다.' };
    set({
      ...restoreTeamSnapshot(snapshot),
      teamHistoryIndex,
    });
    return { ok: true, message: `임시 저장 ${teamHistoryIndex + 1}/${state.teamHistory.length}` };
  },

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
