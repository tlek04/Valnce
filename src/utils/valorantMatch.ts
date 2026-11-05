import { SavedPlayer } from '../types';
import { riotIdentityKey } from './matchStats';

export const MAX_MATCH_SEEDS = 2;

/** 커스텀 전적 API 조회 고정 시드 (명단 닉 또는 발로란트 닉) */
export const FIXED_MATCH_SEED_NAMES = ['포뇨', '게임은이게맞어'] as const;

export function hasRiotIdentity(player: { riotName?: string; riotTag?: string }) {
  return Boolean(riotIdentityKey(player.riotName, player.riotTag));
}

function matchesFixedSeedName(player: SavedPlayer, seedName: string) {
  const target = seedName.trim().normalize('NFC').toLowerCase();
  if (!target) return false;
  return (
    player.name.trim().normalize('NFC').toLowerCase() === target ||
    (player.riotName?.trim().normalize('NFC').toLowerCase() ?? '') === target
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
    name: player.name.trim(),
    riotName: player.riotName!.trim().replace(/^#+/, ''),
    riotTag: player.riotTag!.trim().replace(/^#+/, ''),
  }));
}
