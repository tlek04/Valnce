import { SavedPlayer } from '../types';
import { toSavedPlayer } from './player';

export const ROSTER_FILE_TYPE = 'valnce-roster';
export const ROSTER_FILE_VERSION = 1;

export interface RosterFile {
  type: typeof ROSTER_FILE_TYPE;
  version: number;
  exportedAt: string;
  players: SavedPlayer[];
}

export function buildRosterFile(players: SavedPlayer[]): RosterFile {
  return {
    type: ROSTER_FILE_TYPE,
    version: ROSTER_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    players: players.map((player) => toSavedPlayer(player)),
  };
}

export function downloadRosterFile(players: SavedPlayer[]): void {
  const payload = buildRosterFile(players);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `valnce-roster-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseRosterFile(raw: unknown): SavedPlayer[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => toSavedPlayer(item));
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('명단 파일 형식이 올바르지 않습니다.');
  }
  const data = raw as { type?: string; players?: unknown };
  if (data.type && data.type !== ROSTER_FILE_TYPE) {
    throw new Error('Valnce 명단 파일이 아닙니다.');
  }
  if (!Array.isArray(data.players)) {
    throw new Error('명단 목록이 없습니다.');
  }
  return data.players.map((item) => toSavedPlayer(item));
}

/** id가 같거나 닉네임이 같으면 덮어쓰고, 없으면 추가한다. */
export function mergeSavedPlayers(current: SavedPlayer[], incoming: SavedPlayer[]): SavedPlayer[] {
  const byId = new Map(current.map((player) => [player.id, player]));
  const nameToId = new Map(current.map((player) => [player.name.trim().toLowerCase(), player.id]));

  for (const item of incoming) {
    const saved = toSavedPlayer(item);
    const nameKey = saved.name.trim().toLowerCase();
    const existingId = byId.has(saved.id) ? saved.id : nameToId.get(nameKey);
    if (existingId) {
      const previous = byId.get(existingId);
      const next = toSavedPlayer({ ...previous, ...saved, id: existingId });
      byId.set(existingId, next);
      if (previous && previous.name.trim().toLowerCase() !== nameKey) {
        nameToId.delete(previous.name.trim().toLowerCase());
      }
      nameToId.set(nameKey, existingId);
    } else {
      byId.set(saved.id, saved);
      nameToId.set(nameKey, saved.id);
    }
  }

  return [...byId.values()];
}

export async function readRosterFromFile(file: File): Promise<SavedPlayer[]> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일을 읽을 수 없습니다.');
  }
  return parseRosterFile(parsed);
}
