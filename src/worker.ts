import { Env } from './server/types';
import { json } from './server/http';
export { ApplicationState } from './server/applicationState';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) {
      if (!env.STATE) return json({ error: 'STATE 저장소가 연결되지 않았습니다.' }, { status: 503 });
      return env.STATE.get(env.STATE.idFromName('shared-v1')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
