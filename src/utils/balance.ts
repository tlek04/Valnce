import { Player } from '../types';
import { advantageSummary, teamScore } from './rating';
import { allyGroups, areRivals, hasRivalConflict } from './relations';

const MATCH_SIZE = 10;
const TEAM_SIZE = 5;

export interface BalanceResult {
  ok: boolean;
  team1: Player[];
  team2: Player[];
  waitlist: Player[];
  diff: number;
  message: string;
}

interface Unit {
  players: Player[];
  size: number;
  forced?: 'TEAM_1' | 'TEAM_2';
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
  if (players.length !== TEAM_SIZE) return false;
  if (hasRivalConflict(players)) return false;
  return players.every((player) => !player.lockedTeam || player.lockedTeam === side);
}

function unitPriority(unit: Unit, teamIds: Set<string>): number {
  if (unit.forced) return 0;
  if (unit.players.some((player) => teamIds.has(player.id))) return 1;
  return 2;
}

function selectMatchPool(
  team1: Player[],
  team2: Player[],
  waitlist: Player[]
): { selected: Player[]; extras: Player[] } | { error: string } {
  const all = [...team1, ...team2, ...waitlist];
  if (all.length < MATCH_SIZE) {
    return { error: '자동 밸런스는 10명이 필요합니다.' };
  }

  const unitsOrError = buildUnits(all);
  if ('error' in unitsOrError) return unitsOrError;

  const lockedPlayers = all.filter((player) => player.lockedTeam === 'TEAM_1' || player.lockedTeam === 'TEAM_2');
  if (lockedPlayers.length > MATCH_SIZE) {
    return { error: '고정된 인원이 10명을 넘습니다.' };
  }

  const teamIds = new Set([...team1, ...team2].map((player) => player.id));
  const ordered = [...unitsOrError].sort(
    (left, right) => unitPriority(left, teamIds) - unitPriority(right, teamIds)
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
  const candidates: { team1: Player[]; team2: Player[]; diff: number }[] = [];

  for (let k = 0; k <= rest.length; k += 1) {
    for (const pick of combinations(rest, k)) {
      const pickSize = pick.reduce((sum, unit) => sum + unit.size, 0);
      const otherSize = restSize - pickSize;
      if (size1 + pickSize !== TEAM_SIZE || size2 + otherSize !== TEAM_SIZE) continue;
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
        diff: Math.abs(teamScore(players1) - teamScore(players2)),
      });
    }
  }

  const best = candidates.sort((a, b) => a.diff - b.diff)[0];
  if (!best) {
    return {
      ok: false,
      ...empty,
      diff: 0,
      message: '팀 고정 / 라이벌 / 같은 팀 묶기 조건 때문에 자동 밸런스를 만들 수 없습니다.',
    };
  }

  return {
    ok: true,
    team1: best.team1,
    team2: best.team2,
    waitlist: extras,
    diff: best.diff,
    message: `자동 밸런스 완료 · ${advantageSummary(best.team1, best.team2).text}`,
  };
}
