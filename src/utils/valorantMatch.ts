import { QualifyingMatch, SavedPlayer } from '../types';
import { riotIdentityKey } from './matchStats';

/** 시즌 시작: 가장 최근 8월 1일 0시(로컬)부터 최신까지 */
export function matchHistoryCutoff(now = Date.now()) {
  const date = new Date(now);
  const seasonYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(seasonYear, 7, 1, 0, 0, 0, 0).getTime();
}

export const MAX_MATCH_SEEDS = 2;

/** 커스텀 전적 API 조회 고정 시드 (명단 닉 또는 발로란트 닉) */
export const FIXED_MATCH_SEED_NAMES = ['포뇨', '게임은이게맞어'] as const;

export function hasRiotIdentity(player: { riotName?: string; riotTag?: string }) {
  return Boolean(riotIdentityKey(player.riotName, player.riotTag));
}

function matchesFixedSeedName(player: SavedPlayer, seedName: string) {
  const target = seedName.trim().toLowerCase();
  if (!target) return false;
  return (
    player.name.trim().toLowerCase() === target ||
    (player.riotName?.trim().toLowerCase() ?? '') === target
  );
}

export function listMatchSeeds(players: SavedPlayer[]) {
  const seeds: SavedPlayer[] = [];
  for (const seedName of FIXED_MATCH_SEED_NAMES) {
    const player = players.find(
      (item) => matchesFixedSeedName(item, seedName) && hasRiotIdentity(item)
    );
    if (player && !seeds.some((item) => item.id === player.id)) seeds.push(player);
    if (seeds.length >= MAX_MATCH_SEEDS) break;
  }
  return seeds;
}

export function listTaggedRoster(players: SavedPlayer[]) {
  return players.filter(hasRiotIdentity).map((player) => ({
    id: player.id,
    riotName: player.riotName!.trim(),
    riotTag: player.riotTag!.trim(),
  }));
}

export function buildRiotIdIndex(players: SavedPlayer[]) {
  const map = new Map<string, string>();
  for (const player of players) {
    const key = riotIdentityKey(player.riotName, player.riotTag);
    if (key) map.set(key, player.id);
  }
  return map;
}

export function summarizeQualifyingMatches(matches: QualifyingMatch[]) {
  return {
    matchCount: matches.length,
    playerIds: [...new Set(matches.flatMap((match) => match.results.map((item) => item.playerId)))],
  };
}
