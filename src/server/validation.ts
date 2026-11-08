import { json } from './http';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 100) => typeof value === 'string' && value.length <= max;
const rating = (value: unknown) => object(value) &&
  ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'].includes(String(value.tier)) &&
  (value.tier === 'Radiant' || [1, 2, 3].includes(Number(value.division)));

function players(value: unknown, board = false): boolean {
  if (!Array.isArray(value) || value.length > 500) return false;
  const ids = new Set();
  return value.every((row) => {
    if (!object(row) || !text(row.id, 100) || !row.id || ids.has(row.id) || !text(row.name) || !row.name) return false;
    ids.add(row.id);
    if (!rating(row.currentTier) || (row.maxTier !== undefined && !rating(row.maxTier))) return false;
    if (row.internalTier != null && !rating(row.internalTier)) return false;
    for (const key of ['riotName', 'riotTag']) if (row[key] != null && !text(row[key])) return false;
    for (const key of ['wins', 'losses', 'playCount', 'streak', 'queueNo']) {
      if (row[key] != null && (!Number.isSafeInteger(row[key]) || Math.abs(Number(row[key])) > 1000000 || (key !== 'streak' && Number(row[key]) < 0))) return false;
    }
    if (row.playAts != null && (!Array.isArray(row.playAts) || row.playAts.length > 1000 || !row.playAts.every(v => Number.isFinite(v) && v <= Date.now() + 60_000))) return false;
    if (row.canOrder != null && typeof row.canOrder !== 'boolean') return false;
    for (const key of ['allyIds','rivalIds']) if (row[key] != null && (!Array.isArray(row[key]) || row[key].length > 500 || !row[key].every(v => text(v)))) return false;
    if (row.restrictions != null && (!Array.isArray(row.restrictions) || row.restrictions.length > 100 || !row.restrictions.every(v => object(v) && text(v.id) && text(v.type) && (v.customText == null || text(v.customText, 200)) && (v.weaponId == null || text(v.weaponId, 40))))) return false;
    if (board) {
      if (row.lockedTeam != null && !['TEAM_1','TEAM_2','MATCH','WAITLIST','BENCH'].includes(String(row.lockedTeam))) return false;
      if (row.checkIn != null && row.checkIn !== 'ready' && row.checkIn !== 'away') return false;
    } else if (row.lockedTeam != null && !['TEAM_1','TEAM_2','MATCH','WAITLIST'].includes(String(row.lockedTeam))) {
      return false;
    }
    return true;
  });
}

/** Validate before handlers cast JSON. Read a bounded clone; leave the original body intact. */
export async function validateRequest(request: Request): Promise<Response | null> {
  let path: string;
  try { path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, ''); }
  catch { return json({ error: '잘못된 경로입니다.' }, { status: 400 }); }
  if (path.length > 500) return json({ error: '경로가 너무 깁니다.' }, { status: 414 });
  if (!['POST','PUT','DELETE'].includes(request.method)) return null;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  const reader = request.clone().body?.getReader();
  let size = 0, raw = '';
  const decoder = new TextDecoder();
  if (reader) {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void reader.cancel(); }, 8000);
    try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) { void reader.cancel(); return json({ error: '요청이 너무 큽니다.' }, { status: 413 }); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    if (timedOut) return json({ error: '요청 수신 시간이 초과되었습니다.' }, { status: 408 });
    } finally { clearTimeout(timer); }
  }
  const noBody = /^\/api\/join\/[^/]+\/(approve|reject|claim)$/.test(path) || (path === '/api/auth/access-log' && request.method === 'DELETE');
  if (!raw && noBody) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: '잘못된 JSON입니다.' }, { status: 400 }); }
  const bad = () => json({ error: '입력 형식이나 허용 범위를 확인하세요.' }, { status: 400 });
  if (!object(body)) return bad();
  if (body.updatedAt != null && (!Number.isSafeInteger(body.updatedAt) || Number(body.updatedAt) < 0 || Number(body.updatedAt) > Date.now() + 60_000)) return bad();
  if (body.baseUpdatedAt != null && (!Number.isSafeInteger(body.baseUpdatedAt) || Number(body.baseUpdatedAt) < 0)) return bad();
  if (path === '/api/auth/login' || path === '/api/auth/revoke-all') return text(body.password, 256) ? null : bad();
  if (path === '/api/auth/trust-device') {
    if (body.deviceId != null && !text(body.deviceId, 100)) return bad();
    if (body.label != null && !text(body.label, 100)) return bad();
  }
  if (path === '/api/join') {
    for (const key of ['name','riotName','riotTag']) if (!text(body[key], 100)) return bad();
    if (body.canOrder != null && typeof body.canOrder !== 'boolean') return bad();
  }
  if (path === '/api/join/check-in') {
    if (typeof body.ready !== 'boolean') return bad();
  }
  if (path === '/api/roster' && !players(body.players)) return bad();
  if (path === '/api/board') {
    if (!players(body.waitlist, true) || !players(body.team1, true) || !players(body.team2, true)) return bad();
    const a = body.team1 as unknown[], b = body.team2 as unknown[], w = body.waitlist as unknown[];
    if (a.length > 5 || b.length > 5 || !players([...w,...a,...b], true)) return bad();
    if (body.balanceNote != null && !text(body.balanceNote, 1000)) return bad();
    if (body.balanceDetails != null && (!Array.isArray(body.balanceDetails) || body.balanceDetails.length > 500 || !body.balanceDetails.every(v => text(v, 1000)))) return bad();
  }
  if (path === '/api/site-settings' && Object.values(body).some(v => typeof v !== 'boolean')) return bad();
  if (path === '/api/matches/import') {
    for (const key of ['seeds','roster']) {
      const list = body[key];
      if (!Array.isArray(list) || list.length > (key === 'seeds' ? 1 : 500) || !list.every(v => object(v) && text(v.riotName) && text(v.riotTag) && (key === 'seeds' || text(v.id)))) return bad();
    }
  }
  return null;
}
