import { Player } from '../types';
import { advantageSummary, getPlayerScore, rankScore, teamMaxScore, teamScore } from './rating';
import { allyGroups, areRivals, hasRivalConflict } from './relations';

const MATCH_SIZE = 10;
const TEAM_SIZE = 5;
const MAX_WEIGHT = 0.55;
const SPREAD_WEIGHT = 0.2;

export interface BalanceResult {
  ok: boolean;
  team1: Player[];
  team2: Player[];
  waitlist: Player[];
  diff: number;
  message: string;
  reason?: string;
  details?: string[];
}

interface Unit {
  players: Player[];
  size: number;
  forced?: 'TEAM_1' | 'TEAM_2';
}

interface Candidate {
  team1: Player[];
  team2: Player[];
  sizeDiff: number;
  sumDiff: number;
  maxDiff: number;
  spreadDiff: number;
}

function unitsAreRivals(left: Unit, right: Unit): boolean {
  return left.players.some((a) => right.players.some((b) => areRivals(a, b)));
}

function buildUnits(players: Player[]): Unit[] | { error: string } {
  const units: Unit[] = [];
  for (const group of allyGroups(players)) {
    if (group.length > TEAM_SIZE) {
      return { error: '같은 팀으로 묶인 인원이 5명을 넘습니다.' };
    }
    if (hasRivalConflict(group)) {
      return { error: '같은 팀 묶기와 라이벌이 충돌합니다.' };
    }
    const locks = [...new Set(group.map((player) => player.lockedTeam).filter(Boolean))] as Array<
      'TEAM_1' | 'TEAM_2'
    >;
    if (locks.length > 1) {
      return { error: '같은 팀으로 묶인 플레이어의 팀 고정이 서로 다릅니다.' };
    }
    units.push({
      players: group,
      size: group.length,
      forced: locks[0],
    });
  }
  return units;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const result: T[][] = [];
  const walk = (start: number, path: T[]) => {
    if (path.length === k) {
      result.push([...path]);
      return;
    }
    for (let i = start; i <= items.length - (k - path.length); i += 1) {
      path.push(items[i]);
      walk(i + 1, path);
      path.pop();
    }
  };
  walk(0, []);
  return result;
}

function flatten(units: Unit[]): Player[] {
  return units.flatMap((unit) => unit.players);
}

function isValidTeam(players: Player[], side: 'TEAM_1' | 'TEAM_2'): boolean {
  if (players.length === 0 || players.length > TEAM_SIZE) return false;
  if (hasRivalConflict(players)) return false;
  return players.every((player) => !player.lockedTeam || player.lockedTeam === side);
}

function unitPriority(unit: Unit, waitlistIds: Set<string>): number {
  if (unit.forced) return 0;
  if (unit.players.some((player) => waitlistIds.has(player.id))) return 1;
  return 2;
}

function teamSpread(players: Player[]): number {
  if (players.length <= 1) return 0;
  const scores = players.map(getPlayerScore);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

function candidateCost(candidate: Candidate): number {
  return candidate.sumDiff + MAX_WEIGHT * candidate.maxDiff + SPREAD_WEIGHT * candidate.spreadDiff;
}

function namesOf(players: Player[]): string {
  return players.map((player) => player.name).join('·');
}

function sideLabel(side: 'TEAM_1' | 'TEAM_2' | 'waitlist'): string {
  if (side === 'TEAM_1') return '1팀';
  if (side === 'TEAM_2') return '2팀';
  return '대기열';
}

function locateSide(player: Player, best: Candidate): 'TEAM_1' | 'TEAM_2' | null {
  if (best.team1.some((item) => item.id === player.id)) return 'TEAM_1';
  if (best.team2.some((item) => item.id === player.id)) return 'TEAM_2';
  return null;
}

function explainBalance(best: Candidate, pool: Player[]): string {
  const parts: string[] = [];
  const locked = pool.filter((player) => player.lockedTeam === 'TEAM_1' || player.lockedTeam === 'TEAM_2');
  const allies = pool.some((player) => (player.allyIds ?? []).length > 0);
  const rivals = pool.some((player) => (player.rivalIds ?? []).length > 0);

  if (locked.length > 0) parts.push('팀 고정 유지');
  if (allies) parts.push('같은 팀 묶기 유지');
  if (rivals) parts.push('라이벌 분리');

  if (best.sizeDiff === 0) parts.push('인원 균등');
  else parts.push(`인원 차이 ${best.sizeDiff}명`);

  if (best.maxDiff <= 250) parts.push('고티어 분산');
  parts.push('점수 합 맞춤');
  return parts.join(' · ');
}

function buildBalanceDetails(best: Candidate, selected: Player[], extras: Player[]): string[] {
  const details: string[] = [];
  const onBoard = [...best.team1, ...best.team2];
  const byId = new Map(onBoard.map((player) => [player.id, player]));

  if (extras.length > 0) {
    details.push(`${namesOf(extras)} → 대기열 (한 판 10명 제한으로 제외)`);
  }

  for (const player of selected) {
    if (player.lockedTeam !== 'TEAM_1' && player.lockedTeam !== 'TEAM_2') continue;
    const side = locateSide(player, best);
    if (!side) continue;
    details.push(`${player.name} → ${sideLabel(side)} (팀 고정)`);
  }

  for (const group of allyGroups(selected)) {
    if (group.length < 2) continue;
    const side = locateSide(group[0], best);
    if (!side) continue;
    details.push(`${namesOf(group)} → ${sideLabel(side)} (같은 팀 묶기)`);
  }

  const seenRival = new Set<string>();
  for (const player of onBoard) {
    for (const rivalId of player.rivalIds ?? []) {
      const key = [player.id, rivalId].sort().join(':');
      if (seenRival.has(key)) continue;
      const rival = byId.get(rivalId);
      if (!rival) continue;
      const left = locateSide(player, best);
      const right = locateSide(rival, best);
      if (!left || !right || left === right) continue;
      seenRival.add(key);
      details.push(
        `${player.name}(${sideLabel(left)}) ↔ ${rival.name}(${sideLabel(right)}) (라이벌 · 다른 팀)`
      );
    }
  }

  const top1 = [...best.team1].sort((a, b) => getPlayerScore(b) - getPlayerScore(a))[0];
  const top2 = [...best.team2].sort((a, b) => getPlayerScore(b) - getPlayerScore(a))[0];
  if (top1 && top2) {
    details.push(`고티어 ${top1.name}은(는) 1팀, ${top2.name}은(는) 2팀으로 분산`);
  }

  details.push(`인원 ${best.team1.length}대${best.team2.length}로 구성`);

  const advantage = advantageSummary(best.team1, best.team2);
  details.push(
    advantage.amount === 0
      ? '팀 평균 티어가 비슷하도록 점수 합을 맞춤'
      : `결과 ${advantage.text} (평균 티어 기준)`
  );

  const usedPeak = selected.some(
    (player) => !player.internalTier && rankScore(player.maxTier) > rankScore(player.currentTier)
  );
  if (usedPeak) {
    details.push('최고 티어가 더 높은 인원은 약한 가산만 반영 (내전 티어가 있으면 무시)');
  }

  return details;
}

function selectMatchPool(
  team1: Player[],
  team2: Player[],
  waitlist: Player[]
): { selected: Player[]; extras: Player[] } | { error: string } {
  const all = [...team1, ...team2, ...waitlist];
  if (all.length < 2) {
    return { error: '자동 밸런스는 2명 이상이 필요합니다.' };
  }

  const unitsOrError = buildUnits(all);
  if ('error' in unitsOrError) return unitsOrError;

  const lockedPlayers = all.filter((player) => player.lockedTeam === 'TEAM_1' || player.lockedTeam === 'TEAM_2');
  if (lockedPlayers.length > MATCH_SIZE) {
    return { error: '고정된 인원이 10명을 넘습니다.' };
  }

  if (all.length <= MATCH_SIZE) {
    return { selected: all, extras: [] };
  }

  const waitlistIds = new Set(waitlist.map((player) => player.id));
  const ordered = [...unitsOrError].sort(
    (left, right) => unitPriority(left, waitlistIds) - unitPriority(right, waitlistIds)
  );

  const selectedUnits: Unit[] = [];
  let count = 0;
  for (const unit of ordered) {
    if (count + unit.size > MATCH_SIZE) continue;
    selectedUnits.push(unit);
    count += unit.size;
    if (count === MATCH_SIZE) break;
  }

  if (count !== MATCH_SIZE) {
    return {
      error: '같은 팀 묶기 때문에 10명을 고를 수 없습니다. 묶기를 조정한 뒤 다시 시도하세요.',
    };
  }

  const selected = flatten(selectedUnits);
  const used = new Set(selected.map((player) => player.id));
  return {
    selected,
    extras: all.filter((player) => !used.has(player.id)),
  };
}

export function autoBalanceTeams(
  team1: Player[],
  team2: Player[],
  waitlist: Player[]
): BalanceResult {
  const empty = { team1, team2, waitlist };
  const pool = selectMatchPool(team1, team2, waitlist);
  if ('error' in pool) {
    return { ok: false, ...empty, diff: 0, message: pool.error };
  }

  const { selected, extras } = pool;
  const unitsOrError = buildUnits(selected);
  if ('error' in unitsOrError) {
    return { ok: false, ...empty, diff: 0, message: unitsOrError.error };
  }

  const forced1 = unitsOrError.filter((unit) => unit.forced === 'TEAM_1');
  const forced2 = unitsOrError.filter((unit) => unit.forced === 'TEAM_2');
  const rest = unitsOrError.filter((unit) => !unit.forced);

  const size1 = forced1.reduce((sum, unit) => sum + unit.size, 0);
  const size2 = forced2.reduce((sum, unit) => sum + unit.size, 0);
  if (size1 > TEAM_SIZE || size2 > TEAM_SIZE) {
    return { ok: false, ...empty, diff: 0, message: '한 팀에 고정된 인원이 5명을 넘습니다.' };
  }

  const restSize = rest.reduce((sum, unit) => sum + unit.size, 0);
  const candidates: Candidate[] = [];

  for (let k = 0; k <= rest.length; k += 1) {
    for (const pick of combinations(rest, k)) {
      const pickSize = pick.reduce((sum, unit) => sum + unit.size, 0);
      const otherSize = restSize - pickSize;
      const nextSize1 = size1 + pickSize;
      const nextSize2 = size2 + otherSize;
      if (nextSize1 === 0 || nextSize2 === 0) continue;
      if (nextSize1 > TEAM_SIZE || nextSize2 > TEAM_SIZE) continue;
      const pickSet = new Set(pick);
      const next1 = [...forced1, ...pick];
      const next2 = [...forced2, ...rest.filter((unit) => !pickSet.has(unit))];
      if (next1.some((left) => next1.some((right) => left !== right && unitsAreRivals(left, right)))) continue;
      if (next2.some((left) => next2.some((right) => left !== right && unitsAreRivals(left, right)))) continue;
      const players1 = flatten(next1);
      const players2 = flatten(next2);
      if (!isValidTeam(players1, 'TEAM_1') || !isValidTeam(players2, 'TEAM_2')) continue;
      candidates.push({
        team1: players1,
        team2: players2,
        sizeDiff: Math.abs(nextSize1 - nextSize2),
        sumDiff: Math.abs(teamScore(players1) - teamScore(players2)),
        maxDiff: Math.abs(teamMaxScore(players1) - teamMaxScore(players2)),
        spreadDiff: Math.abs(teamSpread(players1) - teamSpread(players2)),
      });
    }
  }

  const best = candidates.sort(
    (a, b) => a.sizeDiff - b.sizeDiff || candidateCost(a) - candidateCost(b)
  )[0];
  if (!best) {
    return {
      ok: false,
      ...empty,
      diff: 0,
      message: '팀 고정 / 라이벌 / 같은 팀 묶기 조건 때문에 자동 밸런스를 만들 수 없습니다.',
    };
  }

  const reason = explainBalance(best, selected);
  const details = buildBalanceDetails(best, selected, extras);
  return {
    ok: true,
    team1: best.team1,
    team2: best.team2,
    waitlist: extras,
    diff: best.sumDiff,
    reason,
    details,
    message: `자동 밸런스 완료 · ${advantageSummary(best.team1, best.team2).text}`,
  };
}
