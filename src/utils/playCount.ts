import { PLAY_WINDOW_MS } from '../constants/game';

/** 최근 24시간 안의 참여 시각만 남긴다. */
export function prunePlayAts(playAts: unknown, now = Date.now()): number[] {
  const windowStart = now - PLAY_WINDOW_MS;
  if (!Array.isArray(playAts)) return [];
  return playAts
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > windowStart && item <= now)
    .sort((a, b) => a - b);
}

/**
 * 저장/표시용 참여 시각.
 * playAts가 없으면 구 playCount를 현재 시각으로 채워 24시간 뒤 자연 소멸하게 한다.
 */
export function readPlayAts(data: { playAts?: unknown; playCount?: unknown }, now = Date.now()): number[] {
  const pruned = prunePlayAts(data.playAts, now);
  if (Array.isArray(data.playAts)) return pruned;
  const legacy =
    typeof data.playCount === 'number' && data.playCount > 0 ? Math.min(Math.floor(data.playCount), 40) : 0;
  if (legacy <= 0) return [];
  return Array.from({ length: legacy }, () => now);
}

export function appendPlayAt(playAts: number[], now = Date.now()): number[] {
  return prunePlayAts([...playAts, now], now);
}

export function playCountFromAts(playAts: number[]): number {
  return playAts.length;
}
