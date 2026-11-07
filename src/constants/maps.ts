/** 커스텀 내전에서 고를 수 있는 스탠다드 맵 */
export interface ValorantMap {
  id: string;
  nameKo: string;
  nameEn: string;
}

export const VALORANT_MAPS: ValorantMap[] = [
  { id: 'abyss', nameKo: '어비스', nameEn: 'Abyss' },
  { id: 'ascent', nameKo: '어센트', nameEn: 'Ascent' },
  { id: 'bind', nameKo: '바인드', nameEn: 'Bind' },
  { id: 'breeze', nameKo: '브리즈', nameEn: 'Breeze' },
  { id: 'corrode', nameKo: '커로드', nameEn: 'Corrode' },
  { id: 'fracture', nameKo: '프랙처', nameEn: 'Fracture' },
  { id: 'haven', nameKo: '헤이븐', nameEn: 'Haven' },
  { id: 'icebox', nameKo: '아이스박스', nameEn: 'Icebox' },
  { id: 'lotus', nameKo: '로터스', nameEn: 'Lotus' },
  { id: 'pearl', nameKo: '펄', nameEn: 'Pearl' },
  { id: 'split', nameKo: '스플릿', nameEn: 'Split' },
  { id: 'summit', nameKo: '서밋', nameEn: 'Summit' },
  { id: 'sunset', nameKo: '선셋', nameEn: 'Sunset' },
];

export function mapLabel(mapId: string | null | undefined): string | null {
  if (!mapId) return null;
  const found = VALORANT_MAPS.find((map) => map.id === mapId);
  return found ? found.nameKo : mapId;
}

export function pickRandomMap(excludeId?: string | null): ValorantMap {
  const pool =
    excludeId && VALORANT_MAPS.length > 1
      ? VALORANT_MAPS.filter((map) => map.id !== excludeId)
      : VALORANT_MAPS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function pickRandomAttackSide(): 'TEAM_1' | 'TEAM_2' {
  return Math.random() < 0.5 ? 'TEAM_1' : 'TEAM_2';
}
