export type ValorantTier =
  | 'Iron'
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Ascendant'
  | 'Immortal'
  | 'Radiant';

export type RankDivision = 1 | 2 | 3;

export interface RankRating {
  tier: ValorantTier;
  division?: RankDivision;
}

export type WeaponId =
  | 'classic'
  | 'shorty'
  | 'frenzy'
  | 'ghost'
  | 'bandit'
  | 'sheriff'
  | 'stinger'
  | 'spectre'
  | 'bucky'
  | 'judge'
  | 'bulldog'
  | 'guardian'
  | 'warden'
  | 'phantom'
  | 'vandal'
  | 'marshal'
  | 'outlaw'
  | 'operator'
  | 'ares'
  | 'odin'
  | 'melee';

export type WeaponRestrictionType =
  | 'NO_RIFLE_OP'
  | 'NO_SNIPER'
  | 'NO_MACHINE'
  | 'PISTOL_ONLY'
  | 'WEAPON'
  | 'CUSTOM';

export interface WeaponRestriction {
  id: string;
  type: WeaponRestrictionType;
  weaponId?: WeaponId;
  customText?: string;
}

export interface SavedPlayer {
  id: string;
  name: string;
  currentTier: RankRating;
}

export interface Player {
  id: string;
  name: string;
  currentTier: RankRating;
  maxTier: RankRating;
  internalTier?: RankRating;
  restrictions: WeaponRestriction[];
  lockedTeam?: 'TEAM_1' | 'TEAM_2' | null;
  rivalIds: string[];
  allyIds: string[];
}

export interface AppState {
  players: SavedPlayer[];
  team1: Player[];
  team2: Player[];
  waitlist: Player[];
}

export type ColumnId = 'waitlist' | 'team1' | 'team2';

export interface AppActions {
  addPlayer: (player: Player) => string | undefined;
  updatePlayer: (id: string, updates: Partial<Player>) => string | undefined;
  removePlayer: (id: string) => void;
  dismissPlayer: (id: string) => void;
  enlistPlayer: (id: string, to?: ColumnId, index?: number) => { ok: boolean; message?: string };
  movePlayer: (id: string, to: ColumnId, index?: number) => { ok: boolean; message?: string };
  autoBalance: () => { ok: boolean; message: string; diff: number };
  resetTeams: () => void;
  clearRoster: () => void;
}

export type AppStore = AppState & AppActions;
