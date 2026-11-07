import { RankDivision, RankRating, ValorantTier } from '../types';

const TIER_BY_KEY: Record<string, ValorantTier> = {
  iron: 'Iron',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  ascendant: 'Ascendant',
  immortal: 'Immortal',
  radiant: 'Radiant',
};

const TIER_RANK: Record<ValorantTier, number> = {
  Iron: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5,
  Ascendant: 6,
  Immortal: 7,
  Radiant: 8,
};

function ratingScore(rating: RankRating): number {
  const base = TIER_RANK[rating.tier] * 3;
  if (rating.tier === 'Radiant') return base;
  return base + Math.max(0, (rating.division ?? 2) - 1);
}

/** Henrik tier.name 예: "Gold 2", "Ascendant 1", "Radiant" */
export function parseHenrikTierName(name: unknown): RankRating | null {
  if (typeof name !== 'string') return null;
  const text = name.trim();
  if (!text || /^unrated$/i.test(text)) return null;
  if (/^radiant$/i.test(text)) return { tier: 'Radiant' };

  const match = text.match(
    /^(iron|bronze|silver|gold|platinum|diamond|ascendant|immortal)\s*([123]|i{1,3})?$/i
  );
  if (!match) return null;
  const tier = TIER_BY_KEY[match[1].toLowerCase()];
  if (!tier || tier === 'Radiant') return tier === 'Radiant' ? { tier: 'Radiant' } : null;

  let division: RankDivision = 2;
  const raw = (match[2] ?? '2').toLowerCase();
  if (raw === '1' || raw === 'i') division = 1;
  else if (raw === '2' || raw === 'ii') division = 2;
  else if (raw === '3' || raw === 'iii') division = 3;
  else return null;

  return { tier, division };
}

export async function fetchRiotRatings(
  riotName: string,
  riotTag: string,
  apiKey: string
): Promise<{ currentTier: RankRating; maxTier: RankRating } | null> {
  const url =
    `https://api.henrikdev.xyz/valorant/v3/mmr/kr/pc/` +
    `${encodeURIComponent(riotName)}/${encodeURIComponent(riotTag)}`;

  const response = await fetch(url, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    data?: {
      current?: { tier?: { name?: string } };
      peak?: { tier?: { name?: string } };
    };
  };

  const currentTier = parseHenrikTierName(payload.data?.current?.tier?.name);
  if (!currentTier) return null;

  const peak = parseHenrikTierName(payload.data?.peak?.tier?.name);
  const maxTier =
    peak && ratingScore(peak) >= ratingScore(currentTier) ? peak : { ...currentTier };

  return { currentTier, maxTier };
}
