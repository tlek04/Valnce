import { Player, SavedPlayer, WeaponRestriction } from '../types';
import { sameRating } from '../constants/valorant';
import { normalizeMatchStats } from './matchStats';
import { cloneRating, ratingFromUnknown } from './rating';

import { DEFAULT_RATING as FALLBACK } from '../constants/game';

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

function asRestrictions(raw: Record<string, unknown>): WeaponRestriction[] {
  if (Array.isArray(raw.restrictions)) {
    return raw.restrictions
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const restriction = item as WeaponRestriction;
        return {
          id: restriction.id || crypto.randomUUID(),
          type: restriction.type,
          weaponId: restriction.weaponId,
          customText: restriction.customText,
        };
      })
      .filter((item) => item.type);
  }
  const single = raw.restriction as WeaponRestriction | undefined;
  if (single && single.type && (single as { type: string }).type !== 'NONE') {
    return [{ id: crypto.randomUUID(), type: single.type, customText: single.customText }];
  }
  return [];
}

export function normalizePlayer(raw: unknown): Player {
  const data = (raw ?? {}) as Record<string, unknown>;
  const currentTier = ratingFromUnknown(data.currentTier, FALLBACK);
  const maxTier = ratingFromUnknown(data.maxTier, currentTier);
  const parsedInternal =
    data.internalTier == null ? undefined : ratingFromUnknown(data.internalTier, currentTier);
  const internalTier =
    parsedInternal && !sameRating(parsedInternal, currentTier) ? parsedInternal : undefined;

  const stats = normalizeMatchStats(data);
  const riotName = typeof data.riotName === 'string' ? data.riotName.trim() : '';
  const riotTag = typeof data.riotTag === 'string' ? data.riotTag.trim() : '';
  const queueNo = readQueueNo(data.queueNo);

  return {
    id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
    name: typeof data.name === 'string' ? data.name : '플레이어',
    currentTier,
    maxTier,
    ...(internalTier ? { internalTier } : {}),
    canOrder: Boolean(data.canOrder),
    restrictions: asRestrictions(data),
    lockedTeam: data.lockedTeam === 'TEAM_1' || data.lockedTeam === 'TEAM_2' ? data.lockedTeam : null,
    rivalIds: asStringArray(Array.isArray(data.rivalIds) && data.rivalIds.length > 0 ? data.rivalIds : data.rivalId),
    allyIds: asStringArray(data.allyIds),
    ...(riotName ? { riotName } : {}),
    ...(riotTag ? { riotTag } : {}),
    matchSeed: Boolean(data.matchSeed),
    ...(queueNo ? { queueNo } : {}),
    wins: stats.wins,
    losses: stats.losses,
    streak: stats.streak,
  };
}

export function readQueueNo(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : undefined;
}

/** 현재 보드(대기열·팀) 기준 다음 추가 순번 */
export function nextAddNo(lists: Array<Array<{ queueNo?: number }> | undefined>): number {
  let max = 0;
  for (const list of lists) {
    for (const item of list ?? []) {
      const no = readQueueNo(item.queueNo);
      if (no && no > max) max = no;
    }
  }
  return max + 1;
}

/** 보드에 올릴 때 순번 부여. 이미 있으면 유지. */
export function withAddNo<T extends { queueNo?: number }>(
  player: T,
  boardLists: Array<Array<{ queueNo?: number }> | undefined>
): T {
  if (readQueueNo(player.queueNo)) return player;
  return { ...player, queueNo: nextAddNo(boardLists) };
}

export function toSavedPlayer(raw: unknown): SavedPlayer {
  const data = (raw ?? {}) as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const stats = normalizeMatchStats(data);
  const riotName = typeof data.riotName === 'string' ? data.riotName.trim() : '';
  const riotTag = typeof data.riotTag === 'string' ? data.riotTag.trim() : '';
  return {
    id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
    name: name || '플레이어',
    currentTier: ratingFromUnknown(data.currentTier, FALLBACK),
    ...(riotName ? { riotName } : {}),
    ...(riotTag ? { riotTag } : {}),
    ...(data.matchSeed ? { matchSeed: true } : {}),
    wins: stats.wins,
    losses: stats.losses,
    streak: stats.streak,
  };
}

export function toSessionPlayer(saved: SavedPlayer): Player {
  const currentTier = cloneRating(saved.currentTier);
  return {
    id: saved.id,
    name: saved.name,
    currentTier,
    maxTier: cloneRating(currentTier),
    canOrder: false,
    restrictions: [],
    lockedTeam: null,
    rivalIds: [],
    allyIds: [],
    ...(saved.riotName ? { riotName: saved.riotName } : {}),
    ...(saved.riotTag ? { riotTag: saved.riotTag } : {}),
    ...(saved.matchSeed ? { matchSeed: true } : {}),
    wins: saved.wins ?? 0,
    losses: saved.losses ?? 0,
    streak: saved.streak ?? 0,
  };
}
