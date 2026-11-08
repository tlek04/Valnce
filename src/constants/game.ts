import { RankRating } from '../types';

export const TEAM_SIZE = 5;
export const MATCH_SIZE = TEAM_SIZE * 2;
export const DEFAULT_RATING: RankRating = { tier: 'Gold', division: 2 };

/** 참여 횟수 창(24시간) · 서버 공유 보드 만료(마지막 저장 후 12시간) */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const PLAY_WINDOW_MS = DAY_MS;
export const BOARD_TTL_MS = 12 * 60 * 60 * 1000;
export const BOARD_TTL_SECONDS = 12 * 60 * 60;
/** 자동 전적 동기화 간격 (수동·팀 초기화 force와 별개) */
export const MATCH_SYNC_COOLDOWN_MS = 12 * 60 * 60 * 1000;
