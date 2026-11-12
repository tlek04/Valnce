import { Env } from './types';
import { json } from './http';
import { requireAdmin } from './auth';
import {
  SITE_SETTINGS_KEY,
  SiteSettings,
  normalizeSiteSettings,
  readSiteSettings,
} from './siteSettingsStore';

export {
  SITE_SETTINGS_KEY,
  readSiteSettings,
  isViewerJoinOpen,
  isStreamerAccessOpen,
} from './siteSettingsStore';
export type { SiteSettings } from './siteSettingsStore';

type SiteEnv = Pick<Env, 'ROSTER' | 'ADMIN_PASSWORD' | 'STREAMER_PASSWORD'>;

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
    const next = normalizeSiteSettings({
      showViewerCard:
        body.showViewerCard !== undefined ? body.showViewerCard !== false : existing.showViewerCard,
      showStreamerCard:
        body.showStreamerCard !== undefined
          ? body.showStreamerCard !== false
          : existing.showStreamerCard,
      showMatchRecord:
        body.showMatchRecord !== undefined ? body.showMatchRecord !== false : existing.showMatchRecord,
      streamerAccessOpen:
        body.streamerAccessOpen !== undefined
          ? body.streamerAccessOpen !== false
          : existing.streamerAccessOpen,
      viewerAccessOpen:
        body.viewerAccessOpen !== undefined
          ? body.viewerAccessOpen !== false
          : existing.viewerAccessOpen,
      chatBridgeOpen:
        body.chatBridgeOpen !== undefined ? body.chatBridgeOpen !== false : existing.chatBridgeOpen,
    });
    await env.ROSTER.put(SITE_SETTINGS_KEY, JSON.stringify(next));
    return json({ ok: true, ...next });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
