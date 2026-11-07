import { mapLabel } from '../constants/maps';
import { Player } from '../types';

export interface MatchResultSnapshot {
  team1: Player[];
  team2: Player[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
}

function attackLabel(attackSide: 'TEAM_1' | 'TEAM_2' | null): string | null {
  if (attackSide === 'TEAM_1') return '1팀 공격 / 2팀 수비';
  if (attackSide === 'TEAM_2') return '2팀 공격 / 1팀 수비';
  return null;
}

function teamTitle(side: 'TEAM_1' | 'TEAM_2', attackSide: 'TEAM_1' | 'TEAM_2' | null): string {
  const title = side === 'TEAM_1' ? '1팀' : '2팀';
  if (!attackSide) return title;
  return `${title} (${attackSide === side ? '공격' : '수비'})`;
}

function playerLine(player: Player): string {
  const riot =
    player.riotName && player.riotTag
      ? `${player.riotName}#${player.riotTag}`
      : player.riotName?.trim() || '';
  return riot && riot !== player.name ? `${player.name} (${riot})` : player.name;
}

function teamLine(title: string, players: Player[]): string {
  if (players.length === 0) return `${title}: 없음`;
  return `${title}: ${players.map(playerLine).join(', ')}`;
}

/** 채팅·공지용 매치 결과 텍스트 (팀당 한 줄) */
export function formatMatchResultText(snapshot: MatchResultSnapshot): string {
  const header: string[] = [];
  const map = mapLabel(snapshot.matchMapId);
  const sides = attackLabel(snapshot.attackSide);
  if (map) header.push(`맵: ${map}`);
  if (sides) header.push(`공수: ${sides}`);

  const body = [
    teamLine(teamTitle('TEAM_1', snapshot.attackSide), snapshot.team1),
    teamLine(teamTitle('TEAM_2', snapshot.attackSide), snapshot.team2),
  ].join('\n');

  return header.length > 0 ? `${header.join('\n')}\n${body}` : body;
}
