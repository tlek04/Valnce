import { Env } from './types';

export const SITE_SETTINGS_KEY = 'site-settings';

export interface SiteSettings {
  /** 랜딩 대문의 시청자 카드 */
  showViewerCard: boolean;
  /** 랜딩 대문의 스트리머 카드 */
  showStreamerCard: boolean;
  /** 매니지 보드 카드의 승패·연승 표시 */
  showMatchRecord: boolean;
  /**
   * 스트리머 입장·매니지 API.
   * OFF여도 토큰/epoch는 유지하고, ON이면 기존 토큰으로 바로 재개.
   */
  streamerAccessOpen: boolean;
  /** 시청자 `/join` 참가 신청 */
  viewerAccessOpen: boolean;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  showViewerCard: true,
  showStreamerCard: true,
  showMatchRecord: true,
  streamerAccessOpen: true,
  viewerAccessOpen: true,
};

export function normalizeSiteSettings(raw: unknown): SiteSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SITE_SETTINGS };
  const data = raw as {
    showViewerCard?: unknown;
    showStreamerCard?: unknown;
    showMatchRecord?: unknown;
    streamerAccessOpen?: unknown;
    viewerAccessOpen?: unknown;
  };
  const showViewerCard = data.showViewerCard !== false;
  return {
    showViewerCard,
    showStreamerCard: data.showStreamerCard !== false,
    showMatchRecord: data.showMatchRecord !== false,
    streamerAccessOpen: data.streamerAccessOpen !== false,
    // 구버전은 showViewerCard가 참가 API도 같이 막았음
    viewerAccessOpen:
      data.viewerAccessOpen !== undefined ? data.viewerAccessOpen !== false : showViewerCard,
  };
}

export async function readSiteSettings(env: Pick<Env, 'ROSTER'>): Promise<SiteSettings> {
  if (!env.ROSTER) return { ...DEFAULT_SITE_SETTINGS };
  const stored = await env.ROSTER.get(SITE_SETTINGS_KEY, 'json');
  return normalizeSiteSettings(stored);
}

export async function isViewerJoinOpen(env: Pick<Env, 'ROSTER'>): Promise<boolean> {
  return (await readSiteSettings(env)).viewerAccessOpen;
}

export async function isStreamerAccessOpen(env: Pick<Env, 'ROSTER'>): Promise<boolean> {
  return (await readSiteSettings(env)).streamerAccessOpen;
}
