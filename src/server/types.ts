import { JoinApplication } from '../types';
export type { JoinApplication, QualifyingMatch } from '../types';

// Minimal binding contract used by this application (also implemented by API test doubles).
export interface RosterStorage {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface Env {
  STATE?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
  ROSTER: RosterStorage;
  ASSETS: { fetch(request: Request): Promise<Response> };
  HENRIK_API_KEY?: string;
  STREAMER_PASSWORD?: string;
  ADMIN_PASSWORD?: string;
  /** 치지직 채팅 브릿지 → Workers API 공유 시크릿 */
  CHAT_BRIDGE_SECRET?: string;
}

export interface RosterPayload {
  updatedAt: number;
  players: unknown[];
}

/** 공유 보드 스냅샷 (매니지 기기 간 폴링 sync) */
export interface BoardPayload {
  updatedAt: number;
  waitlist: unknown[];
  team1: unknown[];
  team2: unknown[];
  matchMapId: string | null;
  attackSide: 'TEAM_1' | 'TEAM_2' | null;
  balanceNote: string | null;
  balanceDetails: string[];
}

export interface RosterIdentity {
  id: string;
  name?: string;
  riotName: string;
  riotTag: string;
}

export interface SeedIdentity {
  riotName: string;
  riotTag: string;
}

export interface JoinQueuePayload {
  nextNo: number;
  items: JoinApplication[];
  /** 낙관적 동시성 — 쓸 때마다 +1 */
  revision?: number;
}

