import { adminAuthHeaders } from './streamerAuth';

export interface SiteSettings {
  showViewerCard: boolean;
  showStreamerCard: boolean;
  showMatchRecord: boolean;
  streamerAccessOpen: boolean;
  viewerAccessOpen: boolean;
  chatBridgeOpen: boolean;
}

/** 캐시·응답 실패 시 접근 게이트는 닫힘(fail-closed). 표시 설정은 캐시가 있으면 유지. */
const CLOSED_SETTINGS: SiteSettings = {
  showViewerCard: false,
  showStreamerCard: false,
  showMatchRecord: false,
  streamerAccessOpen: false,
  viewerAccessOpen: false,
  chatBridgeOpen: false,
};

const SITE_SETTINGS_CACHE_KEY = 'valnce-site-settings-cache';

let memoryCache: SiteSettings | null = null;

function apiUrl() {
  return '/api/site-settings';
}

function normalize(data: {
  showViewerCard?: unknown;
  showStreamerCard?: unknown;
  showMatchRecord?: unknown;
  streamerAccessOpen?: unknown;
  viewerAccessOpen?: unknown;
  chatBridgeOpen?: unknown;
}): SiteSettings {
  const showViewerCard = data.showViewerCard !== false;
  return {
    showViewerCard,
    showStreamerCard: data.showStreamerCard !== false,
    showMatchRecord: data.showMatchRecord !== false,
    streamerAccessOpen: data.streamerAccessOpen !== false,
    viewerAccessOpen:
      data.viewerAccessOpen !== undefined ? data.viewerAccessOpen !== false : showViewerCard,
    chatBridgeOpen: data.chatBridgeOpen !== false,
  };
}

function readCache(): SiteSettings | null {
  if (memoryCache) return memoryCache;
  try {
    const raw = sessionStorage.getItem(SITE_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Parameters<typeof normalize>[0];
    memoryCache = normalize(parsed);
    return memoryCache;
  } catch {
    return null;
  }
}

function writeCache(settings: SiteSettings): void {
  memoryCache = settings;
  try {
    sessionStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** 실패 시 표시는 캐시 유지, 세션 게이트는 닫음 */
function fallbackSettings(): SiteSettings {
  const cached = readCache();
  if (!cached) return { ...CLOSED_SETTINGS };
  return {
    ...cached,
    streamerAccessOpen: false,
    viewerAccessOpen: false,
  };
}

export async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const response = await fetch(apiUrl(), { method: 'GET', cache: 'no-store' });
    if (!response.ok) return fallbackSettings();
    const data = (await response.json()) as Parameters<typeof normalize>[0];
    const settings = normalize(data);
    writeCache(settings);
    return settings;
  } catch {
    return fallbackSettings();
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
    const data = (await response.json()) as Parameters<typeof normalize>[0];
    const settings = normalize(data);
    writeCache(settings);
    return { ok: true, settings };
  } catch {
    return { ok: false, error: '설정을 저장하지 못했습니다.' };
  }
}
