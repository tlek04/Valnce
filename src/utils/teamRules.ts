import { ColumnId, Player } from '../types';
import { areRivals } from './relations';

export function isTeam(column: ColumnId): column is 'team1' | 'team2' {
  return column === 'team1' || column === 'team2';
}

export function opposite(column: 'team1' | 'team2'): 'team1' | 'team2' {
  return column === 'team1' ? 'team2' : 'team1';
}

export function teamLabel(column: 'team1' | 'team2'): string {
  return column === 'team1' ? '1팀' : '2팀';
}

/**
 * 구 WAITLIST 값을 MATCH(고정 시청자)로 취급.
 * BENCH는 고정과 반대 — 이번 판 제외.
 */
export function normalizeLockedTeam(
  value: Player['lockedTeam']
): 'TEAM_1' | 'TEAM_2' | 'MATCH' | 'BENCH' | null {
  if (value === 'TEAM_1' || value === 'TEAM_2') return value;
  if (value === 'MATCH' || value === 'WAITLIST') return 'MATCH';
  if (value === 'BENCH') return 'BENCH';
  return null;
}

export function lockColumn(player: Player): 'team1' | 'team2' | null {
  const lock = normalizeLockedTeam(player.lockedTeam);
  if (lock === 'TEAM_1') return 'team1';
  if (lock === 'TEAM_2') return 'team2';
  return null;
}

/** 고정 시청자 — 특정 팀 고정은 아니지만 경기에 반드시 포함 */
export function isMatchLocked(player: Player): boolean {
  return normalizeLockedTeam(player.lockedTeam) === 'MATCH';
}

/** 이번 판 제외 — 대기열에 두고 자동 밸런스 선발에서 뺌 */
export function isBenched(player: Player): boolean {
  return normalizeLockedTeam(player.lockedTeam) === 'BENCH';
}

export function groupLock(group: Player[]): 'team1' | 'team2' | 'conflict' | null {
  const locks = [...new Set(group.map(lockColumn).filter((item): item is 'team1' | 'team2' => item != null))];
  if (locks.length > 1) return 'conflict';
  return locks[0] ?? null;
}

export function canOccupy(player: Player, column: ColumnId): boolean {
  if (isBenched(player)) return column === 'waitlist';
  const lock = lockColumn(player);
  if (!lock) return true; // MATCH·무고정은 대기열·양쪽 팀 모두 가능
  if (column === 'waitlist') return true;
  return lock === column;
}

export function groupCanOccupy(group: Player[], column: ColumnId): boolean {
  return group.every((player) => canOccupy(player, column));
}

export function groupConflictsWith(group: Player[], team: Player[]): boolean {
  return group.some((member) => team.some((player) => areRivals(member, player)));
}
