import { Env } from './server/types';
import {
  handleAuthAccessLog,
  handleAuthLogin,
  handleAuthRevokeAll,
} from './server/auth';
import { handleRoster } from './server/roster';
import { handleJoin } from './server/join';
import { handleMatchImport } from './server/matches';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    if (path === '/api/roster') {
      return handleRoster(request, env);
    }
    if (path === '/api/matches/import') {
      return handleMatchImport(request, env);
    }
    if (path === '/api/join' || path.startsWith('/api/join/')) {
      return handleJoin(request, env, path);
    }
    return env.ASSETS.fetch(request);
  },
};
