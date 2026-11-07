import { BalanceFocus, Player } from '../types';
import { advantageSummary, getPlayerScore, rankScore, teamMaxScore, teamScore } from './rating';
import { allyGroups, hasRivalConflict } from './relations';
import { isBenched, isMatchLocked, normalizeLockedTeam } from './teamRules';

import { MATCH_SIZE, TEAM_SIZE } from '../constants/game';
/** 최적 대비 이 배수까지는 비슷한 밸런스로 보고 무작위로 고른다 */
const COST_SLACK = 1.18;
const SUM_DIFF_SLACK = 120;

type TierBand = 'high' | 'mid' | 'low';

function costWeights(focus: BalanceFocus): { max: number; spread: number } {
  if (focus === 'high') return { max: 0.95, spread: 0.15 };
  if (focus === 'mid') return { max: 0.35, spread: 0.45 };
  if (focus === 'low') return { max: 0.4, spread: 0.55 };
  return { max: 0.55, spread: 0.2 };
}

function focusLabel(focus: BalanceFocus): string | null {
  if (focus === 'high') return '고티어 위주';
  if (focus === 'mid') return '중티어 위주';
  if (focus === 'low') return '저티어 위주';
  return null;
}

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

/** 테스트에서 시드 고정용. 기본은 Math.random */
let balanceRandom: () => number = Math.random;

export function setBalanceRandom(fn: () => number) {
  balanceRandom = fn;
}

export function resetBalanceRandom() {
  balanceRandom = Math.random;
}

function rand() {
  return balanceRandom();
}

function buildUnits(players: Player[]): Unit[] | { error: string } {
  const units: Unit[] = [];
  for (const group of allyGroups(players)) {
    if (group.length > TEAM_SIZE) {
      return { error: '고정 듀오 인원이 5명을 넘습니다.' };
    }
    if (hasRivalConflict(group)) {
      return { error: '고정 듀오와 라이벌이 충돌합니다.' };
    }
    const teamLocks = [
      ...new Set(
        group
          .map((player) => normalizeLockedTeam(player.lockedTeam))
          .filter((lock): lock is 'TEAM_1' | 'TEAM_2' => lock === 'TEAM_1' || lock === 'TEAM_2')
      ),
    ];
    if (teamLocks.length > 1) {
      return { error: '고정 듀오 플레이어의 팀 고정이 서로 다릅니다.' };
    }
    units.push({
      players: group,
      size: group.length,
      forced: teamLocks[0],
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
  return players.every((player) => {
    const lock = normalizeLockedTeam(player.lockedTeam);
    if (!lock || lock === 'MATCH') return true;
    if (lock === 'BENCH') return false;
    return lock === side;
  });
}

function unitIsBenched(unit: Unit): boolean {
  return unit.players.some(isBenched);
}

function unitMustPlay(unit: Unit): boolean {
  if (unitIsBenched(unit)) return false;
  return Boolean(unit.forced) || unit.players.some(isMatchLocked);
}

function unitPlayCount(unit: Unit): number {
  if (unit.players.length === 0) return 0;
  const total = unit.players.reduce((sum, player) => sum + (player.playCount ?? 0), 0);
  return total / unit.players.length;
}

/** 참여 횟수가 낮을수록 가중치↑ */
function playWeight(playCount: number): number {
  return 1 / (1 + Math.max(0, playCount)) ** 2;
}

function pickWeighted<T>(items: T[], weightOf: (item: T) => number): T {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[Math.floor(rand() * items.length)]!;
  let ticket = rand() * total;
  for (let i = 0; i < items.length; i += 1) {
    ticket -= weights[i];
    if (ticket <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function teamSpread(players: Player[]): number {
  if (players.length <= 1) return 0;
  const scores = players.map(getPlayerScore);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

function candidateCost(candidate: Candidate, focus: BalanceFocus = 'fair'): number {
  const weights = costWeights(focus);
  return candidate.sumDiff + weights.max * candidate.maxDiff + weights.spread * candidate.spreadDiff;
}

function buildTierBands(players: Player[]): Map<string, TierBand> {
  const ranked = [...players].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
  const bands = new Map<string, TierBand>();
  if (ranked.length === 0) return bands;
  const highCut = Math.max(1, Math.ceil(ranked.length / 3));
  const lowStart = ranked.length - Math.max(1, Math.ceil(ranked.length / 3));
  ranked.forEach((player, index) => {
    if (index < highCut) bands.set(player.id, 'high');
    else if (index >= lowStart) bands.set(player.id, 'low');
    else bands.set(player.id, 'mid');
  });
  return bands;
}

function unitTierBand(unit: Unit, bands: Map<string, TierBand>): TierBand {
  const counts = { high: 0, mid: 0, low: 0 };
  for (const player of unit.players) {
    counts[bands.get(player.id) ?? 'mid'] += 1;
  }
  if (counts.high >= counts.mid && counts.high >= counts.low) return 'high';
  if (counts.low >= counts.mid && counts.low >= counts.high) return 'low';
  return 'mid';
}

function focusSelectBoost(band: TierBand, focus: BalanceFocus): number {
  if (focus === 'fair') return 1;
  if (focus === 'high') return band === 'high' ? 3.2 : band === 'mid' ? 1 : 0.35;
  if (focus === 'mid') return band === 'mid' ? 3.2 : 0.85;
  return band === 'low' ? 3.2 : band === 'mid' ? 1 : 0.35;
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

function hasTeamLock(players: Player[]): boolean {
  return players.some((player) => {
    const lock = normalizeLockedTeam(player.lockedTeam);
    return lock === 'TEAM_1' || lock === 'TEAM_2';
  });
}

function explainBalance(best: Candidate, pool: Player[], focus: BalanceFocus): string {
  const parts: string[] = [];
  const locked = pool.filter((player) => {
    const lock = normalizeLockedTeam(player.lockedTeam);
    return lock === 'TEAM_1' || lock === 'TEAM_2';
  });
  const matchLocked = pool.some(isMatchLocked);
  const allies = pool.some((player) => (player.allyIds ?? []).length > 0);
  const rivals = pool.some((player) => (player.rivalIds ?? []).length > 0);
  const focusText = focusLabel(focus);

  if (focusText) parts.push(focusText);
  if (locked.length > 0) parts.push('팀 고정 유지');
  if (matchLocked) parts.push('고정 포함');
  if (pool.some(isBenched)) parts.push('벤치 제외');
  if (allies) parts.push('고정 듀오 유지');
  if (rivals) parts.push('라이벌 분리');

  if (best.sizeDiff === 0) parts.push('인원 균등');
  else parts.push(`인원 차이 ${best.sizeDiff}명`);

  if (best.maxDiff <= 250) parts.push('고티어 분산');
  parts.push('점수 합 맞춤');
  if (pool.some((player) => (player.playCount ?? 0) > 0)) parts.push('참여 횟수 반영');
  return parts.join(' · ');
}

function buildBalanceDetails(
  best: Candidate,
  selected: Player[],
  extras: Player[],
  focus: BalanceFocus
): string[] {
  const details: string[] = [];
  const onBoard = [...best.team1, ...best.team2];
  const byId = new Map(onBoard.map((player) => [player.id, player]));

  if (extras.length > 0) {
    details.push(`${namesOf(extras)} → 대기열 (한 판 10명 제한으로 제외)`);
  }

  for (const player of selected) {
    const lock = normalizeLockedTeam(player.lockedTeam);
    const side = locateSide(player, best);
    if (!side) continue;
    if (lock === 'TEAM_1' || lock === 'TEAM_2') {
      details.push(`${player.name} → ${sideLabel(side)} (팀 고정)`);
    } else if (lock === 'MATCH') {
      details.push(`${player.name} → ${sideLabel(side)} (고정)`);
    }
  }

  for (const group of allyGroups(selected)) {
    if (group.length < 2) continue;
    const side = locateSide(group[0], best);
    if (!side) continue;
    details.push(`${namesOf(group)} → ${sideLabel(side)} (고정 듀오)`);
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

  const lowPlay = selected.filter((player) => (player.playCount ?? 0) === 0);
  if (lowPlay.length > 0 && selected.some((player) => (player.playCount ?? 0) > 0)) {
    details.push(`참여 적은 인원 우선 반영 (${namesOf(lowPlay.slice(0, 4))}${lowPlay.length > 4 ? '…' : ''})`);
  }

  const focusText = focusLabel(focus);
  if (focusText) {
    details.push(`${focusText}로 선발·배정 가중치를 조정`);
  }

  return details;
}

function selectMatchPool(
  team1: Player[],
  team2: Player[],
  waitlist: Player[],
  focus: BalanceFocus
): { selected: Player[]; extras: Player[] } | { error: string } {
  const all = [...team1, ...team2, ...waitlist];
  if (all.length < 2) {
    return { error: '자동 밸런스는 2명 이상이 필요합니다.' };
  }

  const unitsOrError = buildUnits(all);
  if ('error' in unitsOrError) return unitsOrError;

  const benchedUnits = unitsOrError.filter(unitIsBenched);
  const playableUnits = unitsOrError.filter((unit) => !unitIsBenched(unit));
  const benchedPlayers = flatten(benchedUnits);

  const requiredUnits = playableUnits.filter(unitMustPlay);
  const requiredSize = requiredUnits.reduce((sum, unit) => sum + unit.size, 0);
  if (requiredSize > MATCH_SIZE) {
    return { error: '팀 고정·고정 인원이 10명을 넘습니다.' };
  }

  const playablePlayers = flatten(playableUnits);
  if (playablePlayers.length <= MATCH_SIZE) {
    return { selected: playablePlayers, extras: benchedPlayers };
  }

  const bands = buildTierBands(playablePlayers);
  const optional = playableUnits.filter((unit) => !unitMustPlay(unit));
  const selectedUnits: Unit[] = [...requiredUnits];
  let count = requiredSize;
  const remaining = [...optional];

  while (count < MATCH_SIZE && remaining.length > 0) {
    const slots = MATCH_SIZE - count;
    const fitting = remaining.filter((unit) => unit.size <= slots);
    if (fitting.length === 0) break;
    const picked = pickWeighted(
      fitting,
      (unit) =>
        playWeight(unitPlayCount(unit)) * focusSelectBoost(unitTierBand(unit, bands), focus)
    );
    selectedUnits.push(picked);
    count += picked.size;
    const at = remaining.findIndex((unit) => unit === picked);
    if (at >= 0) remaining.splice(at, 1);
  }

  if (count !== MATCH_SIZE) {
    return {
      error: '고정 듀오·고정 때문에 10명을 고를 수 없습니다. 묶기를 조정한 뒤 다시 시도하세요.',
    };
  }

  const selected = flatten(selectedUnits);
  const used = new Set(selected.map((player) => player.id));
  return {
    selected,
    extras: all.filter((player) => !used.has(player.id)),
  };
}

function pickNearBest(candidates: Candidate[], focus: BalanceFocus): Candidate {
  const ranked = [...candidates].sort(
    (a, b) => a.sizeDiff - b.sizeDiff || candidateCost(a, focus) - candidateCost(b, focus)
  );
  const best = ranked[0]!;
  const bestCost = candidateCost(best, focus);
  const near = ranked.filter(
    (item) =>
      item.sizeDiff === best.sizeDiff &&
      candidateCost(item, focus) <= bestCost * COST_SLACK + 1e-6 &&
      item.sumDiff <= best.sumDiff + SUM_DIFF_SLACK
  );
  return pickWeighted(near, () => 1);
}

function maybeSwapSides(candidate: Candidate): Candidate {
  if (hasTeamLock(candidate.team1) || hasTeamLock(candidate.team2)) return candidate;
  if (rand() >= 0.5) return candidate;
  return {
    ...candidate,
    team1: candidate.team2,
    team2: candidate.team1,
  };
}

export function autoBalanceTeams(
  team1: Player[],
  team2: Player[],
  waitlist: Player[],
  focus: BalanceFocus = 'fair'
): BalanceResult {
  const empty = { team1, team2, waitlist };
  const pool = selectMatchPool(team1, team2, waitlist, focus);
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

  if (candidates.length === 0) {
    return {
      ok: false,
      ...empty,
      diff: 0,
      message: '팀 고정 / 라이벌 / 고정 듀오 조건 때문에 자동 밸런스를 만들 수 없습니다.',
    };
  }

  const best = maybeSwapSides(pickNearBest(candidates, focus));
  const reason = explainBalance(best, selected, focus);
  const details = buildBalanceDetails(best, selected, extras, focus);
  const mode = focusLabel(focus);
  return {
    ok: true,
    team1: best.team1,
    team2: best.team2,
    waitlist: extras,
    diff: best.sumDiff,
    reason,
    details,
    message: mode
      ? `${mode} 밸런스 완료 · ${advantageSummary(best.team1, best.team2).text}`
      : `자동 밸런스 완료 · ${advantageSummary(best.team1, best.team2).text}`,
  };
}
