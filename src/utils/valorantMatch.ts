import { QualifyingMatch, SavedPlayer } from '../types';
import { riotIdentityKey } from './matchStats';

/** 시즌 시작: 가장 최근 8월 1일 0시(로컬)부터 최신까지 */
export function matchHistoryCutoff(now = Date.now()) {
  const date = new Date(now);
  const seasonYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(seasonYear, 7, 1, 0, 0, 0, 0).getTime();
}

export const MATCH_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12시간
export const MAX_MATCH_SEEDS = 2;

export function hasRiotIdentity(player: { riotName?: string; riotTag?: string }) {
  return Boolean(riotIdentityKey(player.riotName, player.riotTag));
}

export function listMatchSeeds(players: SavedPlayer[]) {
  return players.filter((player) => player.matchSeed && hasRiotIdentity(player)).slice(0, MAX_MATCH_SEEDS);
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
