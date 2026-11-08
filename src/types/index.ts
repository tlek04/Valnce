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
  | 'NO_JUDGE'
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
  maxTier?: RankRating;
  /** 내전용 강제 티어. 보드 재합류 시 복원 */
  internalTier?: RankRating;
  /** 발로란트 게임 닉네임 (내전용 별명과 달라도 됨) */
  riotName?: string;
  /** 발로란트 태그 (# 없이) */
  riotTag?: string;
  /** 보드 합류 시 복원 — 고정 시청자(MATCH) 등. BENCH는 세션 전용이라 저장하지 않음 */
  lockedTeam?: 'TEAM_1' | 'TEAM_2' | 'MATCH' | 'WAITLIST' | 'BENCH' | null;
  canOrder?: boolean;
  restrictions?: WeaponRestriction[];
  rivalIds?: string[];
  allyIds?: string[];
  /** @deprecated 시드는 FIXED_MATCH_SEED(포 뇨#S92) 고정. 구 데이터 호환용 */
  matchSeed?: boolean;
  wins: number;
  losses: number;
  /** 양수 연승, 음수 연패, 0 없음 */
  streak: number;
  /**
   * 최근 24시간 참여 시각(ms). 길이가 참여 횟수.
   * `playCount`는 하위 호환용 파생값.
   */
  playAts?: number[];
  /** @deprecated playAts 길이를 쓰세요. 구 데이터 호환 */
  playCount?: number;
}

/** 다음 판 출석. 보드 전용(명단 persist 안 함). null=미응답 */
export type CheckInStatus = 'ready' | 'away';

export interface Player {
  id: string;
  name: string;
  currentTier: RankRating;
  maxTier: RankRating;
  internalTier?: RankRating;
  canOrder: boolean;
  restrictions: WeaponRestriction[];
  /**
   * TEAM_* = 해당 팀 고정
   * MATCH = 고정 시청자(1·2팀 중 무조건 배정)
   * BENCH = 대기열 유지·이번 판 자동밸런스 제외
   * WAITLIST = 구 데이터→MATCH
   */
  lockedTeam?: 'TEAM_1' | 'TEAM_2' | 'MATCH' | 'WAITLIST' | 'BENCH' | null;
  rivalIds: string[];
  allyIds: string[];
  riotName?: string;
  riotTag?: string;
  /** @deprecated 시드는 고정 닉네임 기준 */
  matchSeed?: boolean;
  /** 오늘 매니지 보드(대기열·팀)에 올라온 순서. 신청 티켓과 별개 */
  queueNo?: number;
  /**
   * 다음 판 출석. ready=참가, away=불참, null=미응답(팀 초기화 후).
   * 명단에는 저장하지 않음.
   */
  checkIn?: CheckInStatus | null;
  wins: number;
  losses: number;
  streak: number;
  /** 최근 24시간 참여 시각(ms) */
  playAts: number[];
  /** 최근 24시간 참여 횟수(= playAts.length). 낮을수록 자동 밸런스 선발 확률↑ */
  playCount: number;
}

/** 시청자 참가 신청 (승인 대기 또는 기존 명단 자동 대기열) */
export interface JoinApplication {
  id: string;
  name: string;
  riotName: string;
  riotTag: string;
  queueNo: number;
  createdAt: number;
  /** 신청자가 오더 가능으로 표시 */
  canOrder?: boolean;
  /** 명단에 이미 있으면 true — 스트리머 승인 없이 대기열로 합류 */
  auto?: boolean;
  /** auto일 때 명단 플레이어 id */
  playerId?: string;
}

/** API로 확인된 내전 커스텀 한 판 */
export interface QualifyingMatch {
  matchId: string;
  playedAt: number;
  mapName: string;
  results: { playerId: string; result: 'win' | 'loss' }[];
}

/** 임시 저장용 보드 스냅샷 (팀 초기화 시 비움, persist 안 함) */
export interface TeamHistorySnapshot {
  waitlist: Player[];
  team1: Player[];
  team2: Player[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
  balanceNote: string | null;
  balanceDetails: string[];
}

export interface AppState {
  players: SavedPlayer[];
  team1: Player[];
  team2: Player[];
  waitlist: Player[];
  balanceNote: string | null;
  balanceDetails: string[];
  /** 맵 추천 결과 (맵 id). 결과 텍스트·보드에 표시 */
  matchMapId: string | null;
  /** 공격 시작 팀. null이면 미추첨 */
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
  /** @deprecated 보드 로컬 캐시 제거. 호환용으로만 남김 */
  sessionSavedAt: number | null;
  /** 기존 플레이어 명단이 마지막으로 바뀐 시각. 서버 동기화 비교용. */
  rosterUpdatedAt: number;
  /** 공유 보드(대기열·팀·맵·공수)가 마지막으로 바뀐 시각. 서버 동기화 비교용. */
  boardUpdatedAt: number;
  /** 커스텀 매치 전적·참여를 마지막으로 성공 동기화한 시각 (자동 동기화 30분 간격) */
  lastMatchSyncAt: number | null;
  /** 보드 카드에 승패·연승 표시 */
  showMatchRecord: boolean;
  /** 임시 저장된 팀 구성. 팀 초기화 시 비움 */
  teamHistory: TeamHistorySnapshot[];
  /** teamHistory 커서. 비어 있으면 -1 */
  teamHistoryIndex: number;
}

export type ColumnId = 'waitlist' | 'team1' | 'team2';

/** 자동 밸런스 선발·배정 편향 */
export type BalanceFocus = 'fair' | 'high' | 'mid' | 'low';

export interface AppActions {
  addPlayer: (player: Player) => string | undefined;
  updatePlayer: (id: string, updates: Partial<Player>) => string | undefined;
  removePlayer: (id: string) => void;
  dismissPlayer: (id: string) => void;
  enlistPlayer: (id: string, to?: ColumnId, index?: number) => { ok: boolean; message?: string };
  movePlayer: (id: string, to: ColumnId, index?: number) => { ok: boolean; message?: string };
  autoBalance: (focus?: BalanceFocus) => {
    ok: boolean;
    message: string;
    diff: number;
    reason?: string;
    details?: string[];
  };
  resetTeams: () => void;
  /** checkIn이 ready가 아닌 보드 인원을 내보낸다(미응답·불참). */
  dismissAbsentPlayers: () => { ok: boolean; removed: number; message: string };
  /** 현재 대기열·팀·맵·공수를 임시 저장한다. */
  saveTeamSnapshot: () => { ok: boolean; message: string };
  /** 임시 저장한 팀 구성 중 이전으로 이동 */
  prevTeamSnapshot: () => { ok: boolean; message?: string };
  /** 임시 저장한 팀 구성 중 다음으로 이동 */
  nextTeamSnapshot: () => { ok: boolean; message?: string };
  /** 커스텀 맵 풀에서 하나 추첨. 직전에 뽑힌 맵은 가능하면 제외 */
  drawRandomMap: () => { mapId: string; label: string };
  /** 1·2팀 중 공격 시작 팀 추첨 */
  drawAttackSide: () => { attackSide: 'TEAM_1' | 'TEAM_2'; label: string };
  clearRoster: () => void;
  importSavedPlayers: (incoming: SavedPlayer[]) => number;
  applyRemoteRoster: (incoming: SavedPlayer[], updatedAt: number) => void;
  /** 동기화 구독자가 로컬 명단 변경 시각을 기록한다. */
  setRosterUpdatedAt: (updatedAt: number) => void;
  /** 서버 공유 보드 스냅샷으로 대기열·팀·맵·공수를 통째로 맞춘다. */
  applyRemoteBoard: (
    snapshot: {
      waitlist: Player[];
      team1: Player[];
      team2: Player[];
      matchMapId: string | null;
      attackSide: 'TEAM_1' | 'TEAM_2' | null;
      balanceNote: string | null;
      balanceDetails: string[];
    },
    updatedAt: number
  ) => void;
  setBoardUpdatedAt: (updatedAt: number) => void;
  /** 전적 동기화 시각을 수동으로 찍는다. 보통은 reconcileMatchStats가 성공 시 갱신한다. */
  markMatchSyncAttempt: () => void;
  /** 보드에 있는 1·2팀 전원에게 승패를 반영하고 명단에도 저장한다. */
  recordTeamResult: (winner: 'TEAM_1' | 'TEAM_2') => { ok: boolean; message: string };
  recordPlayerResult: (id: string, result: 'win' | 'loss') => void;
  /** 개별 승·패를 ± 조정한다. */
  adjustPlayerRecord: (id: string, field: 'wins' | 'losses', delta: number) => void;
  /** qualifying 커스텀 매치로 태그 있는 플레이어 전적을 재계산한다. */
  reconcileMatchStats: (matches: QualifyingMatch[]) => void;
  setShowMatchRecord: (value: boolean) => void;
}

export type AppStore = AppState & AppActions;
