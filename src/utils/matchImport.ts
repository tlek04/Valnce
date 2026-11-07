import { readJsonText } from './apiResponse';
import { QualifyingMatch, SavedPlayer } from '../types';
import { isRosterSyncConfigured } from './rosterSync';
import { staffFetch } from './streamerAuth';
import { listMatchSeeds, listTaggedRoster } from './valorantMatch';

export interface MatchImportResponse {
  ok: boolean;
  matches: QualifyingMatch[];
  error?: string;
  skippedSeeds?: string[];
}

function apiUrl() {
  const fromEnv = import.meta.env.VITE_MATCH_API as string | undefined;
  return fromEnv?.trim() || '/api/matches/import';
}

export function isMatchSyncConfigured() {
  return isRosterSyncConfigured();
}

export async function importQualifyingMatches(players: SavedPlayer[]): Promise<MatchImportResponse> {
  const seeds = listMatchSeeds().map((seed) => ({
    riotName: seed.riotName.trim().replace(/^#+/, ''),
    riotTag: seed.riotTag.trim().replace(/^#+/, ''),
  }));
  const roster = listTaggedRoster(players);

  if (roster.length === 0) {
    return { ok: false, matches: [], error: '승패를 맞출 명단에 닉네임#태그를 등록하세요.' };
  }

  try {
    const response = await staffFetch(apiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seeds, roster }),
    });
    const parsed = await readJsonText<{
      ok?: boolean;
      matches?: QualifyingMatch[];
      error?: string;
      skippedSeeds?: string[];
    }>(response);
    if (!parsed.parsed) {
      return {
        ok: false,
        matches: [],
        error:
          response.status === 405 || parsed.text.includes('<!doctype html')
            ? '전적 API가 아직 배포되지 않았습니다. 잠시 후 다시 시도하세요.'
            : `전적 응답을 읽지 못했습니다. (${response.status})`,
      };
    }
    const data = parsed.data;
    const skippedSeeds = Array.isArray(data.skippedSeeds)
      ? data.skippedSeeds.filter((item): item is string => typeof item === 'string')
      : undefined;
    if (!response.ok) {
      return {
        ok: false,
        matches: [],
        error: data.error || `전적 조회 실패 (${response.status})`,
        ...(skippedSeeds?.length ? { skippedSeeds } : {}),
      };
    }
    return {
      ok: true,
      matches: Array.isArray(data.matches) ? data.matches : [],
      ...(skippedSeeds?.length ? { skippedSeeds } : {}),
    };
  } catch {
    return { ok: false, matches: [], error: '전적 API에 연결하지 못했습니다.' };
  }
}
