import { QualifyingMatch } from '../types';
import { isRosterSyncConfigured } from './rosterSync';
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
    riotName: player.riotName!.trim(),
    riotTag: player.riotTag!.trim(),
  }));
  const roster = listTaggedRoster(players);

  if (seeds.length === 0) {
    return { ok: false, matches: [], error: '시드(단골) 플레이어를 닉#태그와 함께 지정하세요. (최대 2명)' };
  }
  if (roster.length < 3) {
    return { ok: false, matches: [], error: '등록 닉#태그가 3명 이상이어야 내전 커스텀을 판별할 수 있습니다.' };
  }

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seeds, roster }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      matches?: QualifyingMatch[];
      error?: string;
    };
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
