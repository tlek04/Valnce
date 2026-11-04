import { Env, RosterPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';

export const ROSTER_KEY = 'shared-roster';
export type RosterEnv = Pick<Env, 'ROSTER' | 'STREAMER_PASSWORD'>;

export async function handleRoster(request: Request, env: RosterEnv): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (request.method === 'GET') {
    const stored = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
    return json({
      updatedAt: stored?.updatedAt ?? 0,
      players: Array.isArray(stored?.players) ? stored.players : [],
    });
  }

  if (request.method === 'PUT') {
    const denied = await requireStreamer(request, env);
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
    const existing = (await env.ROSTER.get(ROSTER_KEY, 'json')) as RosterPayload | null;
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
    await env.ROSTER.put(ROSTER_KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

