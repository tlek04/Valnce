import { JoinApplication } from '../types';
export type { JoinApplication, QualifyingMatch } from '../types';

// Minimal binding contract used by this application (also implemented by API test doubles).
export interface RosterStorage {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ROSTER: RosterStorage;
  ASSETS: { fetch(request: Request): Promise<Response> };
  HENRIK_API_KEY?: string;
  STREAMER_PASSWORD?: string;
}

export interface RosterPayload {
  updatedAt: number;
  players: unknown[];
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
}

