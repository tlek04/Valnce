import { QualifyingMatch } from '../types';
import { isRosterSyncConfigured } from './rosterSync';
import { streamerAuthHeaders } from './streamerAuth';
import { listMatchSeeds, listTaggedRoster } from './valorantMatch';
import { useAppStore } from '../store/useAppStore';

export interface MatchImportResponse {
  ok: boolean;
  matches: QualifyingMatch[];
  error?: string;
}

function apiUrl() {
  const fromEnv = import.meta.env.VITE_MATCH_API as string | undefined;
  return fromEnv?.trim() || '/api/matches/import';
}

export function isMatchSyncConfigured() {
  return isRosterSyncConfigured();
}

export async function importQualifyingMatches(): Promise<MatchImportResponse> {
  const players = useAppStore.getState().players;
  const seeds = listMatchSeeds(players).map((player) => ({
    riotName: player.riotName!.trim().replace(/^#+/, ''),
    riotTag: player.riotTag!.trim().replace(/^#+/, ''),
  }));
  const roster = listTaggedRoster(players);

  if (seeds.length === 0) {
    return {
      ok: false,
      matches: [],
      error: '고정 시드(포뇨, 게임은이게맞어)에 닉#태그를 등록하세요.',
    };
  }
  if (roster.length === 0) {
    return { ok: false, matches: [], error: '승패를 맞출 명단에 닉#태그를 등록하세요.' };
  }

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: streamerAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ seeds, roster }),
    });
    const text = await response.text();
    let data: { ok?: boolean; matches?: QualifyingMatch[]; error?: string } = {};
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      return {
        ok: false,
        matches: [],
        error:
          response.status === 405 || text.includes('<!doctype html')
            ? '전적 API가 아직 배포되지 않았습니다. 잠시 후 다시 시도하세요.'
            : `전적 응답을 읽지 못했습니다. (${response.status})`,
      };
    }
    if (!response.ok) {
      return { ok: false, matches: [], error: data.error || `전적 조회 실패 (${response.status})` };
    }
    return {
      ok: true,
      matches: Array.isArray(data.matches) ? data.matches : [],
    };
  } catch {
    return { ok: false, matches: [], error: '전적 API에 연결하지 못했습니다.' };
  }
}
