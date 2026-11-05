import { adminAuthHeaders } from './streamerAuth';

export interface SiteSettings {
  showViewerCard: boolean;
  showMatchRecord: boolean;
}

const DEFAULT_SETTINGS: SiteSettings = {
  showViewerCard: true,
  showMatchRecord: true,
};

function apiUrl() {
  return '/api/site-settings';
}

export async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const response = await fetch(apiUrl(), { method: 'GET', cache: 'no-store' });
    if (!response.ok) return { ...DEFAULT_SETTINGS };
    const data = (await response.json()) as {
      showViewerCard?: unknown;
      showMatchRecord?: unknown;
    };
    return {
      showViewerCard: data.showViewerCard !== false,
      showMatchRecord: data.showMatchRecord !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function pushSiteSettings(
  patch: Partial<SiteSettings>
): Promise<{ ok: boolean; settings?: SiteSettings; unauthorized?: boolean; error?: string }> {
  try {
    const response = await fetch(apiUrl(), {
      method: 'PUT',
      headers: adminAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (response.status === 401) {
      return { ok: false, unauthorized: true, error: '관리자 인증이 필요합니다.' };
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: data?.error || '설정을 저장하지 못했습니다.' };
    }
    const data = (await response.json()) as SiteSettings & { ok?: boolean };
    return {
      ok: true,
      settings: {
        showViewerCard: data.showViewerCard !== false,
        showMatchRecord: data.showMatchRecord !== false,
      },
    };
  } catch {
    return { ok: false, error: '설정을 저장하지 못했습니다.' };
  }
}
