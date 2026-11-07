import { Env } from './types';
import {
  handleAuthAccessLog,
  handleAuthLogin,
  handleAuthRevokeAll,
  handleAuthTrustDevice,
  handleAuthTrustStatus,
} from './auth';
import { handleBoard } from './board';
import { handleRoster } from './roster';
import { handleJoin } from './join';
import { handleMatchImport } from './matches';
import { handleSiteSettings } from './siteSettings';

export async function dispatchApi(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/auth/login') {
      return handleAuthLogin(request, env);
    }
    if (path === '/api/auth/access-log') {
      return handleAuthAccessLog(request, env);
    }
    if (path === '/api/auth/revoke-all') {
      return handleAuthRevokeAll(request, env);
    }
    if (path === '/api/auth/trust-status') {
      return handleAuthTrustStatus(request, env);
    }
    if (path === '/api/auth/trust-device') {
      return handleAuthTrustDevice(request, env);
    }
    if (path === '/api/roster') {
      return handleRoster(request, env);
    }
    if (path === '/api/board') {
      return handleBoard(request, env);
    }
    if (path === '/api/site-settings') {
      return handleSiteSettings(request, env);
    }
    if (path === '/api/matches/import') {
      return handleMatchImport(request, env);
    }
    if (path === '/api/join' || path.startsWith('/api/join/')) {
      return handleJoin(request, env, path);
    }
    return env.ASSETS.fetch(request);
}
