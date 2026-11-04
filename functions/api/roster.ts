interface Env {
  ROSTER: KVNamespace;
  STREAMER_PASSWORD?: string;
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

function bearerToken(request: Request) {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

function requireStreamer(request: Request, env: Env): Response | null {
  if (!env.STREAMER_PASSWORD) {
    return json({ error: 'STREAMER_PASSWORD 시크릿이 없습니다.' }, { status: 503 });
  }
  if (bearerToken(request) !== env.STREAMER_PASSWORD) {
    return json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  return null;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }
  const stored = (await env.ROSTER.get(KEY, 'json')) as RosterPayload | null;
  return json({
    updatedAt: stored?.updatedAt ?? 0,
    players: Array.isArray(stored?.players) ? stored.players : [],
  });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  const denied = requireStreamer(request, env);
  if (denied) return denied;

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
      { status: 409 }
    );
  }

  const payload: RosterPayload = {
    updatedAt,
    players: body.players,
  };
  await env.ROSTER.put(KEY, JSON.stringify(payload));
  return json({ ok: true, updatedAt });
};
