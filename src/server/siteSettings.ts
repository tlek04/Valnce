import { Env } from './types';
import { json } from './http';
import { requireAdmin } from './auth';

export const SITE_SETTINGS_KEY = 'site-settings';

export interface SiteSettings {
  /** 랜딩 대문의 시청자 카드 · `/join` 참가 신청 */
  showViewerCard: boolean;
  /** 매니지 보드 카드의 승패·연승 표시 */
  showMatchRecord: boolean;
}

const DEFAULT_SETTINGS: SiteSettings = {
  showViewerCard: true,
  showMatchRecord: true,
};

type SiteEnv = Pick<Env, 'ROSTER' | 'ADMIN_PASSWORD' | 'STREAMER_PASSWORD'>;

function normalize(raw: unknown): SiteSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const data = raw as { showViewerCard?: unknown; showMatchRecord?: unknown };
  return {
    showViewerCard: data.showViewerCard !== false,
    showMatchRecord: data.showMatchRecord !== false,
  };
}

export async function readSiteSettings(env: Pick<Env, 'ROSTER'>): Promise<SiteSettings> {
  if (!env.ROSTER) return { ...DEFAULT_SETTINGS };
  const stored = await env.ROSTER.get(SITE_SETTINGS_KEY, 'json');
  return normalize(stored);
}

export async function isViewerJoinOpen(env: Pick<Env, 'ROSTER'>): Promise<boolean> {
  const settings = await readSiteSettings(env);
  return settings.showViewerCard;
}

export async function handleSiteSettings(request: Request, env: SiteEnv): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (request.method === 'GET') {
    const settings = await readSiteSettings(env);
    return json(settings);
  }

  if (request.method === 'PUT') {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;

    let body: Partial<SiteSettings>;
    try {
      body = (await request.json()) as Partial<SiteSettings>;
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }

    const existing = await readSiteSettings(env);
    const next: SiteSettings = {
      showViewerCard:
        body.showViewerCard !== undefined ? body.showViewerCard !== false : existing.showViewerCard,
      showMatchRecord:
        body.showMatchRecord !== undefined ? body.showMatchRecord !== false : existing.showMatchRecord,
    };
    await env.ROSTER.put(SITE_SETTINGS_KEY, JSON.stringify(next));
    return json({ ok: true, ...next });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
