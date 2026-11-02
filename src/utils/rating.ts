import { Player, RankRating, ValorantTier } from '../types';
import { TIER_ORDER, TIERS, formatRating, parseRatingKey, sameRating } from '../constants/valorant';

export const MMR_PER_DIVISION = 100;

export function rankScore(rating: RankRating): number {
  if (rating.tier === 'Radiant') return 24;
  return TIER_ORDER[rating.tier] * 3 + ((rating.division ?? 2) - 1);
}

export function rankMmr(rating: RankRating): number {
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

export function getPlayerScore(player: Player): number {
  return rankMmr(playerScrimTier(player) ?? player.currentTier);
}

export function teamScore(players: Player[]): number {
  return players.reduce((sum, player) => sum + getPlayerScore(player), 0);
}

export function formatMmr(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

export function teamAverageLabel(players: Player[]): string {
  if (!players.length) return '-';
  return formatRating(scoreToRating(teamScore(players) / players.length));
}

export function balanceLabel(diff: number): string {
  if (diff <= 100) return '균형 좋음';
  if (diff <= 250) return '양호';
  if (diff <= 400) return '조금 차이';
  return '불균형';
}

export function advantageSummary(team1: Player[], team2: Player[]): {
  text: string;
  side: 'team1' | 'team2' | null;
  amount: number;
} {
  const amount = teamScore(team1) - teamScore(team2);
  if (amount === 0) return { text: '균형', side: null, amount: 0 };
  if (amount > 0) {
    return { text: `1팀이 ${formatMmr(amount)} 유리`, side: 'team1', amount };
  }
  return { text: `2팀이 ${formatMmr(-amount)} 유리`, side: 'team2', amount: -amount };
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
