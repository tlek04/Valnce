import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadSource, memoryStorage } from './load-source.mjs';

export const fixedNow = 1793790000000;
export function player(id, extra = {}) {
  return { id, name: id, currentTier: { tier: 'Gold', division: 2 },
    maxTier: { tier: 'Gold', division: 2 }, canOrder: false, restrictions: [],
    lockedTeam: null, rivalIds: [], allyIds: [], wins: 0, losses: 0, streak: 0, ...extra };
}
const clean = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function domainScenarios(root = 'src') {
  const { autoBalanceTeams } = await loadSource(`${root}/utils/balance.ts`);
  const { applyMove, applyRelationPlacement } = await loadSource(`${root}/utils/placement.ts`);
  const rating = await loadSource(`${root}/utils/rating.ts`);
  const data = await loadSource(`${root}/utils/player.ts`);
  const persistence = root === 'src' ? await loadSource(`${root}/store/persistence.ts`) : data;
  const output = {};
  for (const count of [0, 1, 2, 3, 5, 9, 10, 11, 15]) {
    const roster = Array.from({ length: count }, (_, i) => player(`p${i}`));
    output[`balance-${count}`] = autoBalanceTeams([], [], roster);
  }
  const a = player('a', { allyIds: ['b'], lockedTeam: 'TEAM_1' });
  const b = player('b', { allyIds: ['a'], rivalIds: ['c'] });
  const c = player('c', { rivalIds: ['b'] });
  output.relations = autoBalanceTeams([], [], [a, b, c, player('d')]);
  output.conflictingLocks = autoBalanceTeams([], [], [a, { ...b, lockedTeam: 'TEAM_2' }, c]);
  output.indirectConflict = applyMove({ waitlist: [a, { ...b, allyIds: ['a', 'c'] }, c], team1: [], team2: [] }, 'a', 'team1');
  const full = Array.from({ length: 5 }, (_, i) => player(`t${i}`));
  output.overflow = applyMove({ waitlist: [], team1: [player('a'), player('b')], team2: full }, 'a', 'team2', 2);
  output.reorder = applyMove({ waitlist: [player('a'), player('b'), player('c')], team1: [], team2: [] }, 'a', 'waitlist', 1);
  output.relationEdit = applyRelationPlacement({ waitlist: [], team1: [a], team2: [b, c] }, a);
  output.scores = ['Iron', 'Gold', 'Diamond', 'Radiant'].flatMap((tier) => [1, 2, 3].map((division) => {
    const p = player(tier, { currentTier: { tier, division }, maxTier: { tier: 'Radiant' } });
    return [rating.getPlayerScore(p), rating.teamAverageLabel([p]), rating.advantageSummary([p], [a])];
  }));
  // Deterministic broad coverage: preserve candidate order, tie breaks, messages and input immutability.
  let seed = 763;
  const random = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  const samples = [];
  for (let run = 0; run < 160; run++) {
    const roster = Array.from({ length: 2 + random(12) }, (_, i) => player(`p${i}`, {
      currentTier: { tier: ['Iron', 'Silver', 'Gold', 'Diamond'][random(4)], division: 1 + random(3) },
      lockedTeam: [null, null, null, 'TEAM_1', 'TEAM_2'][random(5)],
    }));
    if (run % 3 === 0) { roster[0].allyIds = ['p1']; roster[1].allyIds = ['p0']; }
    if (run % 4 === 0) roster[0].rivalIds = ['p1'];
    const state = { team1: roster.slice(0, 2), team2: roster.slice(2, 4), waitlist: roster.slice(4) };
    const before = clean(state);
    samples.push(autoBalanceTeams(state.team1, state.team2, state.waitlist));
    samples.push(applyMove(state, 'p0', ['waitlist', 'team1', 'team2'][random(3)], random(6)));
    assert.deepEqual(state, before, 'domain functions must not mutate their input');
  }
  output.generatedCases = { cases: samples.length, digest: digest(samples) };
  const persisted = { players: [a, a, b], team1: [a], team2: [], waitlist: [b, a], sessionSavedAt: fixedNow,
    balanceNote: '기준', balanceDetails: ['상세'], rosterUpdatedAt: 100, lastMatchSyncAt: 50,
    showMatchRecord: true };
  output.restore = persistence.restorePersistedState(persisted);
  output.expired = persistence.restorePersistedState({ ...persisted, sessionSavedAt: fixedNow - 7200001 });
  output.legacy = data.toSavedPlayer({ id: 'legacy', name: ' 이름 ', currentTier: 'Gold-2', wins: 2.8, losses: -1 });
  return clean(output);
}

export async function storeScenarios(root = 'src') {
  globalThis.localStorage = memoryStorage();
  const { useAppStore: store } = await loadSource(`${root}/store/useAppStore.ts`);
  const output = [];
  const capture = (label, result) => output.push({ label, result, state: clean(store.getState()), storage: clean(JSON.parse(localStorage.getItem('valorant-balancer-storage'))) });
  const call = (action, ...args) => capture(action, store.getState()[action](...args));
  call('addPlayer', player('a', { riotName: 'A', riotTag: 'KR' }));
  call('addPlayer', player('b'));
  call('addPlayer', player('c'));
  call('updatePlayer', 'a', { allyIds: ['b'], lockedTeam: 'TEAM_1' });
  call('movePlayer', 'c', 'team2');
  call('recordTeamResult', 'TEAM_1');
  call('recordPlayerResult', 'c', 'win');
  call('adjustPlayerRecord', 'a', 'wins', -1);
  call('adjustPlayerRecord', 'a', 'wins', 0);
  call('reconcileMatchStats', [{ matchId: 'm', playedAt: 1, mapName: '', results: [{ playerId: 'a', result: 'loss' }] }]);
  call('dismissPlayer', 'b');
  call('enlistPlayer', 'b', 'team2');
  call('autoBalance');
  call('resetTeams');
  call('removePlayer', 'a');
  call('importSavedPlayers', [player('d')]);
  call('applyRemoteRoster', [player('e')], 1000);
  call('clearRoster');
  return clean(output);
}

export async function serverScenarios(root = 'src') {
  const worker = (await loadSource(`${root}/worker.ts`)).default;
  const values = new Map();
  const env = {
    STREAMER_PASSWORD: 'test-only',
    ADMIN_PASSWORD: 'admin-only',
    HENRIK_API_KEY: 'fake',
    ROSTER: {
      get: async (key) => JSON.parse(values.get(key) ?? 'null'),
      put: async (key, value) => {
        values.set(key, value);
      },
    },
    ASSETS: { fetch: async () => new Response('asset') },
  };
  const output = [];
  let authToken = '';
  async function request(path, method = 'GET', body, authenticated = true) {
    const headers = {};
    if (authenticated && authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await worker.fetch(new Request(`https://example.test${path}`, { method,
      headers,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), env);
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    output.push({ path, method, status: response.status, data, kv: [...values.entries()] });
    return data;
  }
  await request('/', 'GET', undefined, false);
  await request('/api/auth/login', 'POST', { password: 'bad' }, false);
  const loggedIn = await request('/api/auth/login', 'POST', { password: 'test-only' }, false);
  authToken = typeof loggedIn?.token === 'string' ? loggedIn.token : '';
  await request('/api/roster');
  await request('/api/roster', 'PUT', { players: [] }, false);
  await request('/api/roster', 'PUT', '{');
  await request('/api/roster', 'PUT', { players: [player('a')], updatedAt: 100 });
  await request('/api/roster', 'PUT', { players: [], updatedAt: 99 });
  await request('/api/join', 'GET', undefined, false);
  await request('/api/join', 'POST', { name: '' }, false);
  const joined = await request('/api/join', 'POST', { name: 'viewer', riotName: 'nick', riotTag: 'KR' }, false);
  await request('/api/join', 'POST', { name: 'viewer', riotName: 'other', riotTag: 'KR' }, false);
  await request('/api/join');
  await request(`/api/join/${joined.application.id}/approve`, 'POST');
  await request('/api/join/missing/reject', 'POST');
  // existing roster riot → auto join (no approve)
  const autoJoined = await request('/api/join', 'POST', { name: 'viewer', riotName: 'nick', riotTag: 'KR' }, false);
  await request(`/api/join/${autoJoined.application?.id}/claim`, 'POST');
  await request(`/api/join/${joined.application.id}/claim`, 'POST');
  const second = await request('/api/join', 'POST', { name: 'other', riotName: 'other', riotTag: 'KR' }, false);
  await request(`/api/join/${second.application.id}/reject`, 'POST');
  await request('/api/matches/import', 'POST', { seeds: [], roster: [] });
  // streamer token cannot read access-log
  await request('/api/auth/access-log');
  const adminLogin = await request('/api/auth/login', 'POST', { password: 'admin-only' }, false);
  const streamerToken = authToken;
  authToken = typeof adminLogin?.token === 'string' ? adminLogin.token : '';
  await request('/api/auth/access-log');
  authToken = streamerToken;
  await request('/api/auth/revoke-all', 'POST', { password: 'bad' }, false);
  // streamer password cannot revoke
  await request('/api/auth/revoke-all', 'POST', { password: 'test-only' }, false);
  const staleToken = authToken;
  await request('/api/auth/revoke-all', 'POST', { password: 'admin-only' }, false);
  authToken = staleToken;
  await request('/api/roster');
  const relogin = await request('/api/auth/login', 'POST', { password: 'admin-only' }, false);
  authToken = typeof relogin?.token === 'string' ? relogin.token : '';
  await request('/api/auth/access-log');
  await request('/api/auth/access-log', 'DELETE');
  await request('/api/auth/access-log');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{
    metadata: { match_id: 'm1', started_at: new Date(fixedNow).toISOString(), is_completed: true, queue: { id: 'custom' }, map: { name: 'Ascent' } },
    players: [{ name: 'one', tag: 'KR', team_id: 'Red' }, { name: 'two', tag: 'KR', team_id: 'Blue' }],
    teams: [{ team_id: 'Red', won: true }, { team_id: 'Blue', won: false }],
  }] });
  try {
    const input = { seeds: [{ riotName: 'one', riotTag: 'KR' }, { riotName: 'two', riotTag: 'KR' }],
      roster: [{ id: 'one', riotName: 'one', riotTag: 'KR' }, { id: 'two', riotName: 'two', riotTag: 'KR' }] };
    await request('/api/matches/import', 'POST', input);
    globalThis.fetch = async () => new Response('', { status: 500 });
    await request('/api/matches/import', 'POST', input);
  } finally { globalThis.fetch = originalFetch; }
  return clean(output);
}
