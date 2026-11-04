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

export function lockColumn(player: Player): 'team1' | 'team2' | null {
  if (player.lockedTeam === 'TEAM_1') return 'team1';
  if (player.lockedTeam === 'TEAM_2') return 'team2';
  return null;
}

export function groupLock(group: Player[]): 'team1' | 'team2' | 'conflict' | null {
  const locks = [...new Set(group.map(lockColumn).filter((item): item is 'team1' | 'team2' => item != null))];
  if (locks.length > 1) return 'conflict';
  return locks[0] ?? null;
}

export function canOccupy(player: Player, column: ColumnId): boolean {
  const lock = lockColumn(player);
  if (!lock) return true;
  if (column === 'waitlist') return true;
  return lock === column;
}

export function groupCanOccupy(group: Player[], column: ColumnId): boolean {
  return group.every((player) => canOccupy(player, column));
}

export function groupConflictsWith(group: Player[], team: Player[]): boolean {
  return group.some((member) => team.some((player) => areRivals(member, player)));
}

