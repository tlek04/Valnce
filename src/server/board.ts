import { Env, BoardPayload } from './types';
import { json } from './http';
import { requireStreamer } from './auth';
import { BOARD_TTL_MS, BOARD_TTL_SECONDS } from '../constants/game';

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

function parseStored(raw: BoardPayload | null): BoardPayload {
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

function isBoardExpired(board: BoardPayload, now = Date.now()) {
  return board.updatedAt > 0 && now - board.updatedAt > BOARD_TTL_MS;
}

function liveBoard(board: BoardPayload, now = Date.now()): BoardPayload {
  return isBoardExpired(board, now) ? emptyBoard(0) : board;
}

/** 조인 중복 검사용 — 대기열·팀 전원 (24시간 만료 반영) */
export async function readSharedBoard(env: Pick<Env, 'ROSTER'>): Promise<BoardPayload> {
  if (!env.ROSTER) return emptyBoard();
  const stored = (await env.ROSTER.get(BOARD_KEY, 'json')) as BoardPayload | null;
  const parsed = parseStored(stored);
  if (isBoardExpired(parsed) && typeof env.ROSTER.delete === 'function') {
    await env.ROSTER.delete(BOARD_KEY);
  }
  return liveBoard(parsed);
}

export function boardSeats(board: BoardPayload) {
  return [...board.waitlist, ...board.team1, ...board.team2];
}

export async function handleBoard(request: Request, env: BoardEnv): Promise<Response> {
  if (!env.ROSTER) {
    return json({ error: 'ROSTER KV가 연결되지 않았습니다.' }, { status: 503 });
  }

  if (request.method === 'GET') {
    const board = await readSharedBoard(env);
    return json(board);
  }

  if (request.method === 'PUT') {
    const denied = await requireStreamer(request, env);
    if (denied) return denied;

    let body: Partial<BoardPayload> & { baseUpdatedAt?: number };
    try {
      body = (await request.json()) as Partial<BoardPayload>;
    } catch {
      return json({ error: '잘못된 JSON입니다.' }, { status: 400 });
    }

    if (!Array.isArray(body.waitlist) || !Array.isArray(body.team1) || !Array.isArray(body.team2)) {
      return json({ error: 'waitlist·team1·team2 배열이 필요합니다.' }, { status: 400 });
    }

    let updatedAt = Date.now();
    const raw = parseStored((await env.ROSTER.get(BOARD_KEY, 'json')) as BoardPayload | null);
    // 만료된 보드는 빈 슬레이트로 보고 덮어쓴다. 살아 있는 보드만 LWW 409.
    if ((body.baseUpdatedAt ?? 0) !== (isBoardExpired(raw) ? 0 : raw.updatedAt)) {
      return json({ ok: false, newer: true, ...raw }, { status: 409 });
    }

    updatedAt = Math.max(updatedAt, raw.updatedAt + 1);
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
    await env.ROSTER.put(BOARD_KEY, JSON.stringify(payload), {
      expirationTtl: BOARD_TTL_SECONDS,
    });
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
