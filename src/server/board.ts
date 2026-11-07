import { Env, BoardPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';

export const BOARD_KEY = 'shared-board';
export type BoardEnv = Pick<Env, 'ROSTER' | 'STREAMER_PASSWORD'>;

function emptyBoard(updatedAt = 0): BoardPayload {
  return {
    updatedAt,
    waitlist: [],
    team1: [],
    team2: [],
    matchMapId: null,
    attackSide: null,
    balanceNote: null,
    balanceDetails: [],
  };
}

function normalizeStored(raw: BoardPayload | null): BoardPayload {
  if (!raw || typeof raw !== 'object') return emptyBoard();
  return {
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    waitlist: Array.isArray(raw.waitlist) ? raw.waitlist : [],
    team1: Array.isArray(raw.team1) ? raw.team1 : [],
    team2: Array.isArray(raw.team2) ? raw.team2 : [],
    matchMapId: typeof raw.matchMapId === 'string' ? raw.matchMapId : null,
    attackSide: raw.attackSide === 'TEAM_1' || raw.attackSide === 'TEAM_2' ? raw.attackSide : null,
    balanceNote: typeof raw.balanceNote === 'string' ? raw.balanceNote : null,
    balanceDetails: Array.isArray(raw.balanceDetails)
      ? raw.balanceDetails.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export async function handleBoard(request: Request, env: BoardEnv): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (request.method === 'GET') {
    const stored = (await env.ROSTER.get(BOARD_KEY, 'json')) as BoardPayload | null;
    return json(normalizeStored(stored));
  }

  if (request.method === 'PUT') {
    const denied = await requireStreamer(request, env);
    if (denied) return denied;

    let body: Partial<BoardPayload>;
    try {
      body = (await request.json()) as Partial<BoardPayload>;
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }

    if (!Array.isArray(body.waitlist) || !Array.isArray(body.team1) || !Array.isArray(body.team2)) {
      return json({ error: 'waitlist·team1·team2 배열이 필요합니다.' }, { status: 400 });
    }

    const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
    const existing = normalizeStored(
      (await env.ROSTER.get(BOARD_KEY, 'json')) as BoardPayload | null
    );
    if (existing.updatedAt > updatedAt) {
      return json({ ok: false, newer: true, ...existing }, { status: 409 });
    }

    const payload: BoardPayload = {
      updatedAt,
      waitlist: body.waitlist,
      team1: body.team1,
      team2: body.team2,
      matchMapId: typeof body.matchMapId === 'string' ? body.matchMapId : null,
      attackSide:
        body.attackSide === 'TEAM_1' || body.attackSide === 'TEAM_2' ? body.attackSide : null,
      balanceNote: typeof body.balanceNote === 'string' ? body.balanceNote : null,
      balanceDetails: Array.isArray(body.balanceDetails)
        ? body.balanceDetails.filter((item): item is string => typeof item === 'string')
        : [],
    };
    await env.ROSTER.put(BOARD_KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
