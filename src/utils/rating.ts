import { Player, RankRating, ValorantTier } from '../types';
import { TIER_ORDER, TIERS, formatRating, parseRatingKey, sameRating } from '../constants/valorant';

export const MMR_PER_DIVISION = 100;
/** 티어가 올라갈수록 점수 간격이 넓어짐. */
export const CURVE_BASE = 1.12;
/** 최고 티어가 현재보다 높을 때 부당 가산 비율. 내전 티어가 있으면 적용하지 않음. */
export const PEAK_BONUS_PER_STEP = 0.03;
export const PEAK_BONUS_CAP = 0.15;

export function rankScore(rating: RankRating): number {
  if (rating.tier === 'Radiant') return 24;
  return TIER_ORDER[rating.tier] * 3 + ((rating.division ?? 2) - 1);
}

export function curveMmr(rating: RankRating): number {
  return Math.round(MMR_PER_DIVISION * CURVE_BASE ** rankScore(rating));
}

/** 표시용 평균 티어 환산에만 쓰는 선형 점수. */
export function linearMmr(rating: RankRating): number {
  return rankScore(rating) * MMR_PER_DIVISION;
}

export function scoreToRating(mmr: number): RankRating {
  const steps = Math.max(0, Math.min(24, Math.round(mmr / MMR_PER_DIVISION)));
  if (steps >= 24) return { tier: 'Radiant' };
  const tier = TIERS[Math.floor(steps / 3)] as ValorantTier;
  const division = ((steps % 3) + 1) as 1 | 2 | 3;
  return { tier, division };
}

export function playerScrimTier(player: Player): RankRating | undefined {
  if (!player.internalTier) return undefined;
  if (sameRating(player.internalTier, player.currentTier)) return undefined;
  return player.internalTier;
}

export function playerBaseTier(player: Player): RankRating {
  return playerScrimTier(player) ?? player.currentTier;
}

function peakBonusFactor(player: Player): number {
  if (playerScrimTier(player)) return 0;
  const gap = rankScore(player.maxTier) - rankScore(player.currentTier);
  if (gap <= 0) return 0;
  return Math.min(PEAK_BONUS_CAP, gap * PEAK_BONUS_PER_STEP);
}

export function getPlayerScore(player: Player): number {
  const base = curveMmr(playerBaseTier(player));
  return Math.round(base * (1 + peakBonusFactor(player)));
}

export function teamScore(players: Player[]): number {
  return players.reduce((sum, player) => sum + getPlayerScore(player), 0);
}

export function teamMaxScore(players: Player[]): number {
  if (!players.length) return 0;
  return Math.max(...players.map(getPlayerScore));
}

export function formatMmr(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

export function teamAverageLabel(players: Player[]): string {
  if (!players.length) return '-';
  const average =
    players.reduce((sum, player) => sum + linearMmr(playerBaseTier(player)), 0) / players.length;
  return formatRating(scoreToRating(average));
}

/** 팀 평균 티어 인덱스(부 단위). 표시용. */
export function teamAverageRank(players: Player[]): number {
  if (!players.length) return 0;
  return players.reduce((sum, player) => sum + rankScore(playerBaseTier(player)), 0) / players.length;
}

/** 평균 티어 차이를 메이저 티어(골드→플래 등) 칸으로 환산. */
export function majorTierGap(team1: Player[], team2: Player[]): number {
  return (teamAverageRank(team1) - teamAverageRank(team2)) / 3;
}

function formatTierAdvantage(gap: number): string {
  const abs = Math.abs(gap);
  if (abs < 0.25) return '균형';
  const rounded = Math.round(abs * 2) / 2;
  if (rounded <= 0.5) return '약 반 티어';
  if (rounded === 1) return '약 1티어';
  if (Number.isInteger(rounded)) return `약 ${rounded}티어`;
  return `약 ${rounded}티어`;
}

export function balanceLabel(tierGap: number): string {
  const abs = Math.abs(tierGap);
  if (abs < 0.25) return '균형 좋음';
  if (abs <= 0.75) return '양호';
  if (abs <= 1.5) return '조금 차이';
  return '불균형';
}

export function advantageSummary(team1: Player[], team2: Player[]): {
  text: string;
  side: 'team1' | 'team2' | null;
  amount: number;
} {
  const gap = majorTierGap(team1, team2);
  if (Math.abs(gap) < 0.25) return { text: '균형', side: null, amount: 0 };
  const label = formatTierAdvantage(gap);
  if (gap > 0) {
    return { text: `1팀이 ${label} 유리`, side: 'team1', amount: gap };
  }
  return { text: `2팀이 ${label} 유리`, side: 'team2', amount: -gap };
}

export function isRatingAtLeast(a: RankRating, b: RankRating): boolean {
  return rankScore(a) >= rankScore(b);
}

export function cloneRating(rating: RankRating): RankRating {
  return rating.tier === 'Radiant' ? { tier: 'Radiant' } : { tier: rating.tier, division: rating.division ?? 2 };
}

export function ratingFromUnknown(value: unknown, fallback: RankRating): RankRating {
  if (typeof value === 'string') {
    try {
      return parseRatingKey(value);
    } catch {
      if (TIER_ORDER[value as ValorantTier] != null) {
        const tier = value as ValorantTier;
        return tier === 'Radiant' ? { tier } : { tier, division: 2 };
      }
      return fallback;
    }
  }
  if (value && typeof value === 'object' && 'tier' in value) {
    const rating = value as RankRating;
    if (TIER_ORDER[rating.tier] == null) return fallback;
    if (rating.tier === 'Radiant') return { tier: 'Radiant' };
    const division = rating.division;
    if (division !== 1 && division !== 2 && division !== 3 && division != null) return fallback;
    return { tier: rating.tier, division: division ?? 2 };
  }
  return fallback;
}
