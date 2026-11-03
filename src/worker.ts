interface Env {
  ROSTER: KVNamespace;
  ASSETS: Fetcher;
}

interface RosterPayload {
  updatedAt: number;
  players: unknown[];
}

const KEY = 'shared-roster';

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

async function handleRoster(request: Request, env: Env): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (request.method === 'GET') {
    const stored = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
    return json({
      updatedAt: stored?.updatedAt ?? 0,
      players: Array.isArray(stored?.players) ? stored.players : [],
    });
  }

  if (request.method === 'PUT') {
    let body: Partial<RosterPayload>;
    try {
      body = (await request.json()) as Partial<RosterPayload>;
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }

    if (!Array.isArray(body.players)) {
      return json({ error: 'players 배열이 필요합니다.' }, { status: 400 });
    }

    const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
    const existing = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
    if (existing && typeof existing.updatedAt === 'number' && existing.updatedAt > updatedAt) {
      return json(
        { ok: false, newer: true, updatedAt: existing.updatedAt, players: existing.players },
        { status: 409 },
      );
    }

    const payload: RosterPayload = {
      updatedAt,
      players: body.players,
    };
    await env.ROSTER.put(KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/roster' || url.pathname === '/api/roster/') {
      return handleRoster(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
