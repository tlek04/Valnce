import { SavedPlayer } from '../types';
import { riotIdentityKey } from './matchStats';

export const MAX_MATCH_SEEDS = 1;

/** 커스텀 전적 API 조회 고정 시드 (명단 등록과 무관하게 이 닉네임#태그만 사용) */
export const FIXED_MATCH_SEED = {
  riotName: '포 뇨',
  riotTag: 'S92',
} as const;

/** @deprecated FIXED_MATCH_SEED 사용. 구 코드·문서 호환 */
export const FIXED_MATCH_SEED_NAMES = [FIXED_MATCH_SEED.riotName] as const;

export function hasRiotIdentity(player: { riotName?: string; riotTag?: string }) {
  return Boolean(riotIdentityKey(player.riotName, player.riotTag));
}

export function listMatchSeeds(_players?: SavedPlayer[]) {
  return [
    {
      riotName: FIXED_MATCH_SEED.riotName,
      riotTag: FIXED_MATCH_SEED.riotTag,
    },
  ];
}

export function listTaggedRoster(players: SavedPlayer[]) {
  return players.filter(hasRiotIdentity).map((player) => ({
    id: player.id,
    name: player.name.trim(),
    riotName: player.riotName!.trim().replace(/^#+/, ''),
    riotTag: player.riotTag!.trim().replace(/^#+/, ''),
  }));
}
