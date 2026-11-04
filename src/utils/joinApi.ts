import { JoinApplication, Player } from '../types';
import { streamerAuthHeaders } from './streamerAuth';

function joinUrl(path = '') {
  return `/api/join${path}`;
}

export async function submitJoinApplication(input: {
  name: string;
  riotName: string;
  riotTag: string;
}): Promise<{ ok: boolean; application?: JoinApplication; error?: string }> {
  try {
    const response = await fetch(joinUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    let data: { ok?: boolean; application?: JoinApplication; error?: string } = {};
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      return {
        ok: false,
        error:
          response.status === 404 || text.toLowerCase().includes('<!doctype')
            ? '참가 API가 아직 배포되지 않았습니다. 배포 후 다시 시도하세요.'
            : `서버 응답을 읽지 못했습니다. (${response.status})`,
      };
    }
    if (!response.ok || !data.ok || !data.application) {
      return {
        ok: false,
        error: data.error || `신청에 실패했습니다. (${response.status})`,
      };
    }
    return { ok: true, application: data.application };
  } catch {
    return { ok: false, error: '신청 서버에 연결하지 못했습니다.' };
  }
}

export async function fetchJoinQueue(): Promise<{ ok: boolean; items?: JoinApplication[]; error?: string }> {
  try {
    const response = await fetch(joinUrl(), {
      method: 'GET',
      cache: 'no-store',
      headers: streamerAuthHeaders(),
    });
    const data = (await response.json().catch(() => ({}))) as {
      items?: JoinApplication[];
      error?: string;
    };
    if (!response.ok) {
      return { ok: false, error: data.error || '신청 목록을 불러오지 못했습니다.' };
    }
    return { ok: true, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { ok: false, error: '신청 서버에 연결하지 못했습니다.' };
  }
}

export async function approveJoinApplication(
  id: string
): Promise<{
  ok: boolean;
  player?: Player;
  roster?: { updatedAt: number; players: unknown[] };
  error?: string;
}> {
  try {
    const response = await fetch(joinUrl(`/${encodeURIComponent(id)}/approve`), {
      method: 'POST',
      headers: streamerAuthHeaders({ 'content-type': 'application/json' }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      player?: Player;
      roster?: { updatedAt: number; players: unknown[] };
      error?: string;
    };
    if (!response.ok || !data.ok || !data.player) {
      return { ok: false, error: data.error || '승인에 실패했습니다.' };
    }
    return { ok: true, player: data.player, roster: data.roster };
  } catch {
    return { ok: false, error: '승인 서버에 연결하지 못했습니다.' };
  }
}

export async function rejectJoinApplication(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(joinUrl(`/${encodeURIComponent(id)}/reject`), {
      method: 'POST',
      headers: streamerAuthHeaders({ 'content-type': 'application/json' }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '거절에 실패했습니다.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: '거절 서버에 연결하지 못했습니다.' };
  }
}
