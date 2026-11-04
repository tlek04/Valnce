import {
  RankDivision,
  RankRating,
  ValorantTier,
  WeaponId,
  WeaponRestriction,
  WeaponRestrictionType,
} from '../types';

export const TIERS: ValorantTier[] = [
  'Iron',
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Ascendant',
  'Immortal',
  'Radiant',
];

export const TIER_LABELS: Record<ValorantTier, string> = {
  Iron: '아이언',
  Bronze: '브론즈',
  Silver: '실버',
  Gold: '골드',
  Platinum: '플래티넘',
  Diamond: '다이아몬드',
  Ascendant: '초월자',
  Immortal: '불멸',
  Radiant: '레디언트',
};

export const TIER_ORDER: Record<ValorantTier, number> = {
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

export const TIER_STYLES: Record<ValorantTier, string> = {
  Iron: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40',
  Bronze: 'bg-amber-800/20 text-amber-400 border-amber-700/50',
  Silver: 'bg-slate-400/15 text-slate-200 border-slate-400/40',
  Gold: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  Platinum: 'bg-teal-400/15 text-teal-300 border-teal-400/40',
  Diamond: 'bg-sky-400/15 text-sky-300 border-sky-400/40',
  Ascendant: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/40',
  Immortal: 'bg-rose-400/15 text-rose-300 border-rose-400/40',
  Radiant: 'bg-yellow-200/15 text-yellow-100 border-yellow-200/50',
};

/** 무기 카테고리별 리스트/칩 색 */
export const WEAPON_CATEGORY_STYLES: Record<string, string> = {
  권총: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  SMG: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  샷건: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  라이플: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  저격: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  기관총: 'bg-red-500/15 text-red-300 border-red-500/40',
  근접: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40',
  세트: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
};

export const WEAPONS: {
  id: WeaponId;
  nameKo: string;
  nameEn: string;
  category: string;
  aliases: string;
}[] = [
  { id: 'classic', nameKo: '클래식', nameEn: 'Classic', category: '권총', aliases: '사이드암 기본권총' },
  { id: 'shorty', nameKo: '쇼티', nameEn: 'Shorty', category: '권총', aliases: '숏티 샷건권총' },
  { id: 'frenzy', nameKo: '프렌지', nameEn: 'Frenzy', category: '권총', aliases: '연사권총' },
  { id: 'ghost', nameKo: '고스트', nameEn: 'Ghost', category: '권총', aliases: '소음권총' },
  { id: 'bandit', nameKo: '밴딧', nameEn: 'Bandit', category: '권총', aliases: '신권총' },
  { id: 'sheriff', nameKo: '셰리프', nameEn: 'Sheriff', category: '권총', aliases: '쉐리프 리볼버' },
  { id: 'stinger', nameKo: '스팅어', nameEn: 'Stinger', category: 'SMG', aliases: '기관단총' },
  { id: 'spectre', nameKo: '스펙터', nameEn: 'Spectre', category: 'SMG', aliases: '스펙트레 기관단총' },
  { id: 'bucky', nameKo: '버키', nameEn: 'Bucky', category: '샷건', aliases: '펌프샷건' },
  { id: 'judge', nameKo: '저지', nameEn: 'Judge', category: '샷건', aliases: '자동샷건' },
  { id: 'bulldog', nameKo: '불독', nameEn: 'Bulldog', category: '라이플', aliases: '불독소총' },
  { id: 'guardian', nameKo: '가디언', nameEn: 'Guardian', category: '라이플', aliases: '가디언소총 단발' },
  { id: 'warden', nameKo: '워든', nameEn: 'Warden', category: '라이플', aliases: '신라이플' },
  { id: 'phantom', nameKo: '팬텀', nameEn: 'Phantom', category: '라이플', aliases: '팬텀소총' },
  { id: 'vandal', nameKo: '밴달', nameEn: 'Vandal', category: '라이플', aliases: '반달 밴달소총' },
  { id: 'marshal', nameKo: '마샬', nameEn: 'Marshal', category: '저격', aliases: '마셜 볼트저격' },
  { id: 'outlaw', nameKo: '아웃로', nameEn: 'Outlaw', category: '저격', aliases: '더블배럴 저격' },
  { id: 'operator', nameKo: '오퍼레이터', nameEn: 'Operator', category: '저격', aliases: '오퍼 op 오퍼레이터' },
  { id: 'ares', nameKo: '아레스', nameEn: 'Ares', category: '기관총', aliases: '머신건 lmg' },
  { id: 'odin', nameKo: '오딘', nameEn: 'Odin', category: '기관총', aliases: '머신건 lmg' },
  { id: 'melee', nameKo: '근접', nameEn: 'Melee', category: '근접', aliases: '칼 나이프 단검 근접무기' },
];

export interface RestrictionOption {
  value: string;
  type: WeaponRestrictionType;
  weaponId?: WeaponId;
  label: string;
  short: string;
  group: string;
  searchText: string;
}

const PRESET_RESTRICTIONS: RestrictionOption[] = [
  {
    value: 'PISTOL_ONLY',
    type: 'PISTOL_ONLY',
    label: '권총 전용',
    short: '권총 전용',
    group: '세트',
    searchText: '권총 전용 pistol only 사이드암만',
  },
  {
    value: 'NO_RIFLE_OP',
    type: 'NO_RIFLE_OP',
    label: '밴달 / 팬텀 / 오퍼 금지',
    short: '밴달 / 팬텀 / 오퍼 금지',
    group: '세트',
    searchText: '밴달 팬텀 오퍼 라이플 vandal phantom operator',
  },
  {
    value: 'NO_SNIPER',
    type: 'NO_SNIPER',
    label: '오퍼 / 아웃로 금지',
    short: '오퍼 / 아웃로 금지',
    group: '세트',
    searchText: '오퍼 아웃로 마샬 저격 operator outlaw marshal sniper',
  },
  {
    value: 'NO_MACHINE',
    type: 'NO_MACHINE',
    label: '오딘 / 아레스 금지',
    short: '기관총 금지',
    group: '세트',
    searchText: '오딘 아레스 기관총 odin ares lmg',
  },
  {
    value: 'CUSTOM',
    type: 'CUSTOM',
    label: '직접 입력',
    short: '커스텀',
    group: '세트',
    searchText: '직접 입력 커스텀 custom',
  },
];

export const WEAPON_RESTRICTION_OPTIONS: RestrictionOption[] = WEAPONS.map((weapon) => ({
  value: `weapon:${weapon.id}`,
  type: 'WEAPON' as const,
  weaponId: weapon.id,
  label: `${weapon.nameKo} 금지`,
  short: weapon.nameKo,
  group: weapon.category,
  searchText: `${weapon.nameKo} ${weapon.nameEn} ${weapon.category} ${weapon.aliases} 금지`,
}));

/** 폼 버튼판용: 세트 + 개별 무기 (커스텀 제외) */
export const RESTRICTION_OPTIONS: RestrictionOption[] = [
  ...PRESET_RESTRICTIONS.filter((option) => option.type !== 'CUSTOM'),
  ...WEAPON_RESTRICTION_OPTIONS,
];

export function restrictionKey(restriction: WeaponRestriction): string {
  if (restriction.type === 'WEAPON') return `weapon:${restriction.weaponId ?? ''}`;
  if (restriction.type === 'CUSTOM') return `custom:${restriction.customText ?? restriction.id}`;
  return restriction.type;
}

export function formatRating(rating: RankRating): string {
  if (rating.tier === 'Radiant') return TIER_LABELS.Radiant;
  return `${TIER_LABELS[rating.tier]} ${rating.division ?? 2}`;
}

export function ratingKey(rating: RankRating): string {
  if (rating.tier === 'Radiant') return 'Radiant';
  return `${rating.tier}-${rating.division ?? 2}`;
}

export function parseRatingKey(key: string): RankRating {
  if (key === 'Radiant') return { tier: 'Radiant' };
  const [tier, divisionRaw] = key.split('-');
  if (!TIERS.includes(tier as ValorantTier) || tier === 'Radiant') {
    throw new Error(`Invalid rating key: ${key}`);
  }
  const division = Number(divisionRaw);
  if (division !== 1 && division !== 2 && division !== 3) {
    throw new Error(`Invalid rating key: ${key}`);
  }
  return {
    tier: tier as ValorantTier,
    division: division as RankDivision,
  };
}

export const RANK_OPTIONS: {
  value: string;
  label: string;
  searchText: string;
  badgeClass: string;
}[] = TIERS.flatMap((tier) => {
  if (tier === 'Radiant') {
    return [
      {
        value: 'Radiant',
        label: TIER_LABELS.Radiant,
        searchText: `${TIER_LABELS.Radiant} radiant 레디언트`,
        badgeClass: TIER_STYLES.Radiant,
      },
    ];
  }
  return ([1, 2, 3] as RankDivision[]).map((division) => ({
    value: `${tier}-${division}`,
    label: `${TIER_LABELS[tier]} ${division}`,
    searchText: `${TIER_LABELS[tier]} ${division} ${tier} ${TIER_LABELS[tier]}${division}`,
    badgeClass: TIER_STYLES[tier],
  }));
});

export function getRestrictionLabel(restriction: WeaponRestriction): string {
  if (restriction.type === 'CUSTOM') {
    return restriction.customText?.trim() || '커스텀 제한';
  }
  if (restriction.type === 'WEAPON') {
    const weapon = WEAPONS.find((item) => item.id === restriction.weaponId);
    return weapon ? `${weapon.nameKo} 금지` : '무기 제한';
  }
  return PRESET_RESTRICTIONS.find((option) => option.value === restriction.type)?.label ?? restriction.type;
}

export function sameRating(a: RankRating, b: RankRating): boolean {
  return ratingKey(a) === ratingKey(b);
}
