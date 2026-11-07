import { RankRating } from '../types';

export const TEAM_SIZE = 5;
export const MATCH_SIZE = TEAM_SIZE * 2;
export const DEFAULT_RATING: RankRating = { tier: 'Gold', division: 2 };

/** 참여 횟수·서버 공유 보드 만료 창 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const PLAY_WINDOW_MS = DAY_MS;
export const BOARD_TTL_MS = DAY_MS;
export const BOARD_TTL_SECONDS = 24 * 60 * 60;
