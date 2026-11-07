import { mapLabel } from '../constants/maps';
import { Player } from '../types';

export interface MatchResultSnapshot {
  team1: Player[];
  team2: Player[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
}

function attackLabel(attackSide: 'TEAM_1' | 'TEAM_2' | null): string | null {
  if (attackSide === 'TEAM_1') return '1팀 공격 · 2팀 수비';
  if (attackSide === 'TEAM_2') return '2팀 공격 · 1팀 수비';
  return null;
}

function teamHeading(side: 'TEAM_1' | 'TEAM_2', attackSide: 'TEAM_1' | 'TEAM_2' | null): string {
  const title = side === 'TEAM_1' ? '1팀' : '2팀';
  if (!attackSide) return title;
  return `${title} (${attackSide === side ? '공격' : '수비'})`;
}

/** 채팅·공지용 매치 결과 텍스트 */
export function formatMatchResultText(snapshot: MatchResultSnapshot): string {
  const lines: string[] = [];
  const map = mapLabel(snapshot.matchMapId);
  const sides = attackLabel(snapshot.attackSide);
  if (map) lines.push(`맵 · ${map}`);
  if (sides) lines.push(`공수 · ${sides}`);
  if (lines.length > 0) lines.push('');

  lines.push(teamHeading('TEAM_1', snapshot.attackSide));
  for (const player of snapshot.team1) {
    lines.push(`· ${player.name}`);
  }
  if (snapshot.team1.length === 0) lines.push('· (없음)');

  lines.push('');
  lines.push(teamHeading('TEAM_2', snapshot.attackSide));
  for (const player of snapshot.team2) {
    lines.push(`· ${player.name}`);
  }
  if (snapshot.team2.length === 0) lines.push('· (없음)');

  return lines.join('\n');
}

export function formatDrawSummary(snapshot: Pick<MatchResultSnapshot, 'matchMapId' | 'attackSide'>): string {
  const parts: string[] = [];
  const map = mapLabel(snapshot.matchMapId);
  const sides = attackLabel(snapshot.attackSide);
  if (map) parts.push(`맵 · ${map}`);
  if (sides) parts.push(`공수 · ${sides}`);
  return parts.join('\n');
}
