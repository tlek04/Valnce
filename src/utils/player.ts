import { AppState, Player, RankRating, SavedPlayer, WeaponRestriction } from '../types';
import { sameRating } from '../constants/valorant';
import { repairLocks } from './placement';
import { cloneRating, ratingFromUnknown } from './rating';

const FALLBACK: RankRating = { tier: 'Gold', division: 2 };

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

  return {
    id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
    name: typeof data.name === 'string' ? data.name : '플레이어',
    currentTier,
    maxTier,
    ...(internalTier ? { internalTier } : {}),
    restrictions: asRestrictions(data),
    lockedTeam: data.lockedTeam === 'TEAM_1' || data.lockedTeam === 'TEAM_2' ? data.lockedTeam : null,
    rivalIds: asStringArray(Array.isArray(data.rivalIds) && data.rivalIds.length > 0 ? data.rivalIds : data.rivalId),
    allyIds: asStringArray(data.allyIds),
  };
}

export function syncRelations(list: Player[], id: string, rivalIds: string[], allyIds: string[]): Player[] {
  return list.map((player) => {
    if (player.id === id) return player;
    const rivalSet = new Set(player.rivalIds ?? []);
    const allySet = new Set(player.allyIds ?? []);
    const shouldRival = rivalIds.includes(player.id);
    const shouldAlly = allyIds.includes(player.id);

    if (shouldRival) {
      rivalSet.add(id);
      allySet.delete(id);
    } else {
      rivalSet.delete(id);
    }
    if (shouldAlly) {
      allySet.add(id);
      rivalSet.delete(id);
    } else {
      allySet.delete(id);
    }

    return { ...player, rivalIds: [...rivalSet], allyIds: [...allySet] };
  });
}

export function stripPlayerLinks(list: Player[], id: string): Player[] {
  return list
    .filter((player) => player.id !== id)
    .map((player) => ({
      ...player,
      rivalIds: (player.rivalIds ?? []).filter((item) => item !== id),
      allyIds: (player.allyIds ?? []).filter((item) => item !== id),
    }));
}

export function hydrateState(raw: Partial<AppState> | undefined): AppState {
  const data = raw ?? {};
  const byId = new Map<string, Player>();

  const ingest = (list: unknown[] | undefined) => {
    for (const item of list ?? []) {
      const player = normalizePlayer(item);
      if (!byId.has(player.id)) byId.set(player.id, player);
    }
  };

  ingest(data.players);
  ingest(data.waitlist);
  ingest(data.team1);
  ingest(data.team2);

  const seen = new Set<string>();
  const take = (list: Player[] | undefined) => {
    const next: Player[] = [];
    for (const item of list ?? []) {
      const player = byId.get(item.id);
      if (!player || seen.has(player.id)) continue;
      seen.add(player.id);
      next.push(player);
    }
    return next;
  };

  const team1 = take(data.team1);
  const team2 = take(data.team2);
  const waitlist = take(data.waitlist);

  for (const player of byId.values()) {
    if (!seen.has(player.id)) {
      waitlist.push(player);
      seen.add(player.id);
    }
  }

  const repaired = repairLocks({ waitlist, team1, team2 });
  return {
    players: [...byId.values()].map(toSavedPlayer),
    ...repaired,
  };
}

export function toSavedPlayer(raw: unknown): SavedPlayer {
  const data = (raw ?? {}) as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  return {
    id: typeof data.id === 'string' ? data.id : crypto.randomUUID(),
    name: name || '플레이어',
    currentTier: ratingFromUnknown(data.currentTier, FALLBACK),
  };
}

export function toSessionPlayer(saved: SavedPlayer): Player {
  const currentTier = cloneRating(saved.currentTier);
  return {
    id: saved.id,
    name: saved.name,
    currentTier,
    maxTier: cloneRating(currentTier),
    restrictions: [],
    lockedTeam: null,
    rivalIds: [],
    allyIds: [],
  };
}

export function hydrateLibrary(raw: Partial<AppState> | undefined): AppState {
  const seen = new Set<string>();
  const players: SavedPlayer[] = [];
  for (const item of raw?.players ?? []) {
    const saved = toSavedPlayer(item);
    if (seen.has(saved.id)) continue;
    seen.add(saved.id);
    players.push(saved);
  }
  return {
    players,
    waitlist: [],
    team1: [],
    team2: [],
  };
}
