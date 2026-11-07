import { ColumnId, Player } from '../types';
import { allyGroupOf, areRivals, hasRivalConflict, orderGroup } from './relations';

import { TEAM_SIZE as TEAM_LIMIT } from '../constants/game';
import {
  isTeam,
  opposite,
  teamLabel,
  lockColumn,
  groupLock,
  groupCanOccupy,
  groupConflictsWith,
  canOccupy,
  isBenched,
} from './teamRules';

export interface PlacementState {
  waitlist: Player[];
  team1: Player[];
  team2: Player[];
}

export interface MoveResult {
  ok: boolean;
  state: PlacementState;
  message?: string;
}

function cloneState(state: PlacementState): PlacementState {
  return {
    waitlist: [...state.waitlist],
    team1: [...state.team1],
    team2: [...state.team2],
  };
}

function rosterOf(state: PlacementState): Player[] {
  return [...state.waitlist, ...state.team1, ...state.team2];
}

function locate(state: PlacementState, id: string): ColumnId | null {
  if (state.waitlist.some((player) => player.id === id)) return 'waitlist';
  if (state.team1.some((player) => player.id === id)) return 'team1';
  if (state.team2.some((player) => player.id === id)) return 'team2';
  return null;
}

function namesOf(players: Player[]): string {
  return players.map((player) => player.name).join(', ');
}

function removeIds(state: PlacementState, ids: Set<string>): Player[] {
  const removed: Player[] = [];
  const take = (list: Player[]) => {
    const keep: Player[] = [];
    for (const player of list) {
      if (ids.has(player.id)) removed.push(player);
      else keep.push(player);
    }
    return keep;
  };
  state.waitlist = take(state.waitlist);
  state.team1 = take(state.team1);
  state.team2 = take(state.team2);
  return removed;
}

function insertAt(list: Player[], items: Player[], index?: number) {
  const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, ...items);
}

function takeAndInsert(state: PlacementState, ids: Set<string>, dest: ColumnId, index?: number): Player[] {
  const removed = removeIds(state, ids);
  insertAt(state[dest], removed, index);
  return removed;
}

function lastEvictableIndex(list: Player[], column: 'team1' | 'team2', protectedIds: Set<string>): number {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (protectedIds.has(list[i].id)) continue;
    if (lockColumn(list[i]) === column) continue;
    return i;
  }
  return -1;
}

function trimTeam(
  state: PlacementState,
  column: 'team1' | 'team2',
  protectedIds: Set<string>,
  overflowTo: ColumnId
) {
  while (state[column].length > TEAM_LIMIT) {
    const index = lastEvictableIndex(state[column], column, protectedIds);
    if (index < 0) break;
    const target = state[column][index];
    const group = orderGroup(allyGroupOf(rosterOf(state), target.id), target.id);
    const ids = new Set(group.map((player) => player.id));
    const dest = groupCanOccupy(group, overflowTo) ? overflowTo : 'waitlist';
    takeAndInsert(state, ids, dest);
    if (dest !== 'waitlist' && isTeam(dest) && dest !== column) {
      trimTeam(state, dest, ids, 'waitlist');
    }
  }
}

function evictRivalsFromTeam(
  state: PlacementState,
  column: 'team1' | 'team2',
  keepIds: Set<string>
): string | undefined {
  const keep = state[column].filter((player) => keepIds.has(player.id));
  if (keep.length === 0) return undefined;

  const roster = rosterOf(state);
  const evictIds = new Set<string>();
  for (const player of state[column]) {
    if (keepIds.has(player.id)) continue;
    if (!keep.some((member) => areRivals(member, player))) continue;
    for (const ally of allyGroupOf(roster, player.id)) evictIds.add(ally.id);
  }
  if (evictIds.size === 0) return undefined;

  const evicting = state[column].filter((player) => evictIds.has(player.id));
  const rivalsLockedHere = evicting.some((player) => lockColumn(player) === column);
  const keepLockedHere = keep.some((player) => lockColumn(player) === column);
  const other = opposite(column);

  if (rivalsLockedHere && keepLockedHere) {
    takeAndInsert(state, keepIds, 'waitlist');
    return `고정된 라이벌과 겹쳐 ${namesOf(keep)}을(를) 대기열로 돌렸습니다.`;
  }

  if (rivalsLockedHere) {
    if (groupCanOccupy(keep, other)) {
      takeAndInsert(state, keepIds, other);
      trimTeam(state, other, keepIds, 'waitlist');
      return `라이벌이 ${teamLabel(column)} 고정이라 ${teamLabel(other)}으로 보냈습니다.`;
    }
    takeAndInsert(state, keepIds, 'waitlist');
    return `라이벌이 ${teamLabel(column)} 고정이라 대기열로 돌렸습니다.`;
  }

  const movable = evicting.filter((player) => lockColumn(player) !== column);
  const movableIds = new Set<string>();
  for (const player of movable) {
    for (const ally of allyGroupOf(roster, player.id)) {
      if (lockColumn(ally) !== column) movableIds.add(ally.id);
    }
  }
  if (movableIds.size === 0) return undefined;

  const moved = orderGroup(removeIds(state, movableIds), movable[0]?.id ?? '');
  const dest = groupCanOccupy(moved, other) && !groupConflictsWith(moved, state[other]) ? other : 'waitlist';
  insertAt(state[dest], moved);
  if (isTeam(dest)) trimTeam(state, dest, movableIds, 'waitlist');
  return dest === 'waitlist'
    ? `${namesOf(moved)}은(는) 라이벌이라 대기열로 보냈습니다.`
    : `${namesOf(moved)}은(는) 라이벌이라 ${teamLabel(dest)}으로 보냈습니다.`;
}

export function repairLocks(state: PlacementState): PlacementState {
  const next = cloneState(state);
  // 벤치 인원은 팀 칸에 두지 않음
  for (const column of ['team1', 'team2'] as const) {
    const benched = next[column].filter((player) => !canOccupy(player, column));
    for (const player of benched) {
      const group = orderGroup(allyGroupOf(rosterOf(next), player.id), player.id);
      const ids = new Set(group.map((item) => item.id));
      takeAndInsert(next, ids, 'waitlist');
    }
  }
  for (const column of ['team1', 'team2'] as const) {
    const misplaced = next[column].filter((player) => {
      const lock = lockColumn(player);
      return lock != null && lock !== column;
    });
    for (const player of misplaced) {
      const group = orderGroup(allyGroupOf(rosterOf(next), player.id), player.id);
      const dest = lockColumn(player);
      if (!dest) continue;
      const ids = new Set(group.map((item) => item.id));
      const removed = removeIds(next, ids);
      if (next[dest].length + removed.length <= TEAM_LIMIT && groupCanOccupy(removed, dest)) {
        insertAt(next[dest], removed);
        evictRivalsFromTeam(next, dest, ids);
        trimTeam(next, dest, ids, 'waitlist');
      } else {
        insertAt(next.waitlist, removed);
      }
    }
  }
  return next;
}

function pickDestination(
  state: PlacementState,
  group: Player[],
  to: ColumnId,
  from: ColumnId,
  ids: Set<string>
): { dest: ColumnId; note?: string } | { error: string } {
  const forced = groupLock(group);
  if (forced === 'conflict') {
    return { error: '고정 듀오 플레이어의 팀 고정이 서로 다릅니다.' };
  }

  if (to === 'waitlist') return { dest: 'waitlist' };

  let dest: ColumnId = to;
  let note: string | undefined;

  if (forced && forced !== to) {
    dest = forced;
    note = `${teamLabel(forced)} 고정이라 ${teamLabel(forced)}으로 이동합니다.`;
  }

  if (!isTeam(dest)) return { dest, note };
  if (!groupCanOccupy(group, dest)) {
    return { dest: from === dest ? from : 'waitlist', note };
  }

  const destWithout = state[dest].filter((player) => !ids.has(player.id));
  if (!groupConflictsWith(group, destWithout)) return { dest, note };

  if (forced === dest) return { dest, note };

  const other = opposite(dest);
  if (groupCanOccupy(group, other) && !forced) {
    const otherWithout = state[other].filter((player) => !ids.has(player.id));
    if (!groupConflictsWith(group, otherWithout)) {
      return { dest: other, note: `라이벌이 있어 ${teamLabel(other)}으로 보냈습니다.` };
    }
  }

  if (forced) return { dest: forced, note };
  return { dest: 'waitlist', note: '라이벌 때문에 대기열로 돌렸습니다.' };
}

function preferredColumn(state: PlacementState, group: Player[], player: Player): ColumnId {
  if (group.some(isBenched)) return 'waitlist';

  const forced = groupLock(group);
  if (forced === 'conflict') return 'waitlist';
  if (forced) return forced;

  const current = locate(state, player.id);
  if (current && isTeam(current)) return current;

  const team1Count = group.filter((item) => locate(state, item.id) === 'team1').length;
  const team2Count = group.filter((item) => locate(state, item.id) === 'team2').length;
  if (team1Count > 0 && team1Count >= team2Count) return 'team1';
  if (team2Count > 0) return 'team2';
  return current ?? 'waitlist';
}

export function applyMove(
  state: PlacementState,
  id: string,
  to: ColumnId,
  index?: number
): MoveResult | null {
  const from = locate(state, id);
  if (!from) return null;

  const next = cloneState(state);
  const group = orderGroup(allyGroupOf(rosterOf(next), id), id);
  if (group.length === 0) return null;
  if (hasRivalConflict(group)) {
    return { ok: false, state, message: '고정 듀오와 라이벌이 충돌합니다.' };
  }
  if (isTeam(to) && group.length > TEAM_LIMIT) {
    return { ok: false, state, message: '고정 듀오 인원이 5명을 넘습니다.' };
  }

  const ids = new Set(group.map((player) => player.id));
  const picked = pickDestination(next, group, to, from, ids);
  if ('error' in picked) return { ok: false, state, message: picked.error };

  let dest = picked.dest;
  const notes: string[] = [];
  if (picked.note) notes.push(picked.note);

  if (isTeam(dest)) {
    const occupants = next[dest].filter((player) => !ids.has(player.id));
    const lockedCount = occupants.filter((player) => lockColumn(player) === dest).length;
    if (lockedCount + group.length > TEAM_LIMIT) {
      dest = 'waitlist';
      notes.unshift(`${teamLabel(picked.dest as 'team1' | 'team2')} 고정 인원이 가득 차 대기열에 둡니다.`);
    }
  }

  const pulledAllies = group.filter((player) => player.id !== id && locate(next, player.id) !== dest);
  if (pulledAllies.length > 0) {
    notes.push(`${namesOf(pulledAllies)}도 고정 듀오로 함께 이동합니다.`);
  }

  const originalDest = next[to];
  const dropTargetId =
    dest === to &&
    index !== undefined &&
    index >= 0 &&
    index < originalDest.length &&
    originalDest[index].id !== id
      ? originalDest[index].id
      : undefined;

  removeIds(next, ids);

  let insertIndex = next[dest].length;
  if (dest === to && index !== undefined) {
    if (from === to) {
      insertIndex = Math.max(0, Math.min(index, next[dest].length));
    } else if (dropTargetId) {
      const at = next[dest].findIndex((player) => player.id === dropTargetId);
      insertIndex = at >= 0 ? at : next[dest].length;
    } else {
      insertIndex = Math.max(0, Math.min(index, next[dest].length));
    }
  }

  insertAt(next[dest], group, insertIndex);

  if (isTeam(dest)) {
    const rivalNote = evictRivalsFromTeam(next, dest, ids);
    if (rivalNote) notes.push(rivalNote);
    const overflowTo: ColumnId =
      from !== dest && isTeam(from) && groupCanOccupy(group, from) ? from : 'waitlist';
    trimTeam(next, dest, ids, overflowTo);
    trimTeam(next, opposite(dest), ids, 'waitlist');
  }

  return {
    ok: true,
    state: repairLocks(next),
    message: notes[0],
  };
}

export function applyRelationPlacement(state: PlacementState, player: Player): MoveResult {
  const next = cloneState(state);
  const group = allyGroupOf(rosterOf(next), player.id);
  if (group.length === 0) return { ok: true, state: repairLocks(next) };

  if (hasRivalConflict(group) || groupLock(group) === 'conflict') {
    const ids = new Set(group.map((item) => item.id));
    takeAndInsert(next, ids, 'waitlist');
    return {
      ok: true,
      state: repairLocks(next),
      message: hasRivalConflict(group)
        ? '고정 듀오와 라이벌이 충돌해 대기열로 돌렸습니다.'
        : '고정 듀오 플레이어의 팀 고정이 달라 대기열로 돌렸습니다.',
    };
  }

  const dest = preferredColumn(next, group, player);
  const moved = applyMove(next, player.id, dest);
  if (!moved) return { ok: true, state: repairLocks(next) };
  if (moved.ok && lockColumn(player) && dest !== 'waitlist' && !moved.message) {
    return {
      ...moved,
      message: `${player.name}을(를) ${teamLabel(dest as 'team1' | 'team2')} 고정으로 배치했습니다.`,
    };
  }
  return moved;
}
