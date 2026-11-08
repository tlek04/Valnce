import { readJsonOrEmpty, readJsonText } from './apiResponse';
import { JoinApplication, Player } from '../types';
import { staffFetch } from './streamerAuth';

function joinUrl(path = '') {
  return `/api/join${path}`;
}

export type JoinStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'joined'
  | 'cancelled';

export async function submitJoinApplication(input: {
  name: string;
  riotName: string;
  riotTag: string;
  canOrder?: boolean;
}): Promise<{ ok: boolean; application?: JoinApplication; autoJoined?: boolean; error?: string }> {
  try {
    const response = await fetch(joinUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const parsed = await readJsonText<{
      ok?: boolean;
      application?: JoinApplication;
      autoJoined?: boolean;
      error?: string;
    }>(response);
    if (!parsed.parsed) {
      return {
        ok: false,
        error:
          response.status === 404 || parsed.text.toLowerCase().includes('<!doctype')
            ? '참가 API가 아직 배포되지 않았습니다. 배포 후 다시 시도하세요.'
            : `서버 응답을 읽지 못했습니다. (${response.status})`,
      };
    }
    const data = parsed.data;
    if (!response.ok || !data.ok || !data.application) {
      return {
        ok: false,
        error: data.error || `신청에 실패했습니다. (${response.status})`,
      };
    }
    return { ok: true, application: data.application, autoJoined: Boolean(data.autoJoined) };
  } catch {
    return { ok: false, error: '신청 서버에 연결하지 못했습니다.' };
  }
}

export type JoinCheckIn = 'ready' | 'away' | null;

export async function fetchJoinPresence(): Promise<{
  ok: boolean;
  onBoard?: boolean;
  checkIn?: JoinCheckIn;
  checkInOpen?: boolean;
  name?: string;
  error?: string;
}> {
  try {
    const response = await fetch(joinUrl('/presence'), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    const data = await readJsonOrEmpty<{
      ok?: boolean;
      onBoard?: boolean;
      checkIn?: JoinCheckIn;
      checkInOpen?: boolean;
      name?: string;
      error?: string;
    }>(response);
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '출석 상태를 불러오지 못했습니다.' };
    }
    return {
      ok: true,
      onBoard: Boolean(data.onBoard),
      checkIn: data.checkIn === 'ready' || data.checkIn === 'away' ? data.checkIn : null,
      checkInOpen: Boolean(data.checkInOpen),
      name: data.name,
    };
  } catch {
    return { ok: false, error: '출석 서버에 연결하지 못했습니다.' };
  }
}

export async function submitJoinCheckIn(
  ready: boolean
): Promise<{ ok: boolean; checkIn?: JoinCheckIn; onBoard?: boolean; error?: string }> {
  try {
    const response = await fetch(joinUrl('/check-in'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ready }),
    });
    const data = await readJsonOrEmpty<{
      ok?: boolean;
      checkIn?: JoinCheckIn;
      onBoard?: boolean;
      error?: string;
    }>(response);
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '출석 반영에 실패했습니다.' };
    }
    return {
      ok: true,
      checkIn: data.checkIn === 'ready' || data.checkIn === 'away' ? data.checkIn : null,
      onBoard: Boolean(data.onBoard),
    };
  } catch {
    return { ok: false, error: '출석 서버에 연결하지 못했습니다.' };
  }
}

export async function fetchJoinStatus(id: string): Promise<{
  ok: boolean;
  status?: JoinStatus;
  queueNo?: number;
  name?: string;
  auto?: boolean;
  notFound?: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(joinUrl(`/status/${encodeURIComponent(id)}`), {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await readJsonOrEmpty<{
      ok?: boolean;
      status?: JoinStatus;
      queueNo?: number;
      name?: string;
      auto?: boolean;
      error?: string;
    }>(response);
    if (!response.ok || !data.ok || !data.status) {
      return { ok: false, notFound: response.status === 404, error: data.error || '상태를 불러오지 못했습니다.' };
    }
    return {
      ok: true,
      status: data.status,
      queueNo: data.queueNo,
      name: data.name,
      auto: data.auto,
    };
  } catch {
    return { ok: false, error: '상태 서버에 연결하지 못했습니다.' };
  }
}

export async function fetchJoinQueue(): Promise<{ ok: boolean; items?: JoinApplication[]; error?: string }> {
  try {
    const response = await staffFetch(joinUrl(), {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await readJsonOrEmpty<{
      items?: JoinApplication[];
      error?: string;
    }>(response);
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
  mmr?: 'ok' | 'fallback';
  items?: JoinApplication[];
  error?: string;
}> {
  try {
    const response = await staffFetch(joinUrl(`/${encodeURIComponent(id)}/approve`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const data = await readJsonOrEmpty<{
      ok?: boolean;
      player?: Player;
      roster?: { updatedAt: number; players: unknown[] };
      mmr?: 'ok' | 'fallback';
      items?: JoinApplication[];
      error?: string;
    }>(response);
    if (!response.ok || !data.ok || !data.player) {
      return { ok: false, error: data.error || '승인에 실패했습니다.' };
    }
    return {
      ok: true,
      player: data.player,
      roster: data.roster,
      mmr: data.mmr,
      items: data.items,
    };
  } catch {
    return { ok: false, error: '승인 서버에 연결하지 못했습니다.' };
  }
}

export async function rejectJoinApplication(
  id: string
): Promise<{ ok: boolean; items?: JoinApplication[]; error?: string }> {
  try {
    const response = await staffFetch(joinUrl(`/${encodeURIComponent(id)}/reject`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const data = await readJsonOrEmpty<{ ok?: boolean; items?: JoinApplication[]; error?: string }>(
      response
    );
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || '거절에 실패했습니다.' };
    }
    return { ok: true, items: data.items };
  } catch {
    return { ok: false, error: '거절 서버에 연결하지 못했습니다.' };
  }
}

export async function claimAutoJoinApplication(
  id: string
): Promise<{ ok: boolean; player?: Player; items?: JoinApplication[]; error?: string }> {
  try {
    const response = await staffFetch(joinUrl(`/${encodeURIComponent(id)}/claim`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const data = await readJsonOrEmpty<{
      ok?: boolean;
      player?: Player;
      items?: JoinApplication[];
      error?: string;
    }>(response);
    if (response.status === 404) {
      return { ok: false, items: data.items, error: data.error || '자동 합류에 실패했습니다.' };
    }
    if (!response.ok || !data.ok || !data.player) {
      return { ok: false, error: data.error || '자동 합류에 실패했습니다.' };
    }
    return { ok: true, player: data.player, items: data.items };
  } catch {
    return { ok: false, error: '자동 합류 서버에 연결하지 못했습니다.' };
  }
}
