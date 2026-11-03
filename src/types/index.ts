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
  /** 발로란트 게임 닉 (내전용 별명과 달라도 됨) */
  riotName?: string;
  /** 발로란트 태그 (# 없이) */
  riotTag?: string;
  wins: number;
  losses: number;
  /** 양수 연승, 음수 연패, 0 없음 */
  streak: number;
}

export interface Player {
  id: string;
  name: string;
  currentTier: RankRating;
  maxTier: RankRating;
  internalTier?: RankRating;
  canOrder: boolean;
  restrictions: WeaponRestriction[];
  lockedTeam?: 'TEAM_1' | 'TEAM_2' | null;
  rivalIds: string[];
  allyIds: string[];
  riotName?: string;
  riotTag?: string;
  wins: number;
  losses: number;
  streak: number;
}

export interface AppState {
  players: SavedPlayer[];
  team1: Player[];
  team2: Player[];
  waitlist: Player[];
  balanceNote: string | null;
  balanceDetails: string[];
  /** 오늘 보드를 마지막으로 저장한 시각. 2시간 안에 다시 열면 보드를 복구한다. */
  sessionSavedAt: number | null;
  /** 기존 플레이어 명단이 마지막으로 바뀐 시각. 서버 동기화 비교용. */
  rosterUpdatedAt: number;
}

export type ColumnId = 'waitlist' | 'team1' | 'team2';

export interface AppActions {
  addPlayer: (player: Player) => string | undefined;
  updatePlayer: (id: string, updates: Partial<Player>) => string | undefined;
  removePlayer: (id: string) => void;
  dismissPlayer: (id: string) => void;
  enlistPlayer: (id: string, to?: ColumnId, index?: number) => { ok: boolean; message?: string };
  movePlayer: (id: string, to: ColumnId, index?: number) => { ok: boolean; message?: string };
  autoBalance: () => {
    ok: boolean;
    message: string;
    diff: number;
    reason?: string;
    details?: string[];
  };
  resetTeams: () => void;
  clearRoster: () => void;
  importSavedPlayers: (incoming: SavedPlayer[]) => number;
  applyRemoteRoster: (incoming: SavedPlayer[], updatedAt: number) => void;
  /** 보드에 있는 1·2팀 전원에게 승패를 반영하고 명단에도 저장한다. */
  recordTeamResult: (winner: 'TEAM_1' | 'TEAM_2') => { ok: boolean; message: string };
  recordPlayerResult: (id: string, result: 'win' | 'loss') => void;
}

export type AppStore = AppState & AppActions;
