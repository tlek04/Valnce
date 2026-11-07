import { loadSource, memoryStorage } from './load-source.mjs';
import { player } from './scenarios.mjs';

export async function clientScenarios(root = 'src') {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
  const api = await loadSource('client-entry.ts', `
    export * from './${root}/utils/joinApi';
    export * from './${root}/utils/rosterSync';
    export * from './${root}/utils/streamerAuth';
    export * from './${root}/utils/matchImport';
    export { useAppStore } from './${root}/store/useAppStore';
  `);
  const roster = [player('seed', { name: '포뇨', riotName: 'seed', riotTag: 'KR' })];
  api.useAppStore.getState().applyRemoteRoster(roster, 1);
  const calls = [
    ['fetchRemoteRoster', []], ['pushRemoteRoster', [roster, 123]],
    ['submitJoinApplication', [{ name: 'viewer', riotName: 'riot', riotTag: 'KR' }]],
    ['fetchJoinQueue', []], ['approveJoinApplication', ['id/with space']],
    ['rejectJoinApplication', ['id/with space']], ['verifyStreamerPassword', ['fake']],
    ['importQualifyingMatches', [roster]],
  ];
  const responses = [
    [200, JSON.stringify({ ok: true, updatedAt: 500, players: roster, items: [], player: roster[0], application: { id: 'application' }, matches: [] })],
    [401, JSON.stringify({ error: '인증이 필요합니다.' })],
    [409, JSON.stringify({ updatedAt: 500, players: roster, error: '중복' })],
    [404, '<!doctype html>'], [502, '{'], [200, ''], [0, 'network failure'],
  ];
  const originalFetch = globalThis.fetch;
  const output = [];
  try {
    for (const [name, args] of calls) {
      for (const [status, body] of responses) {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('valnce-streamer-token', 'fake');
        localStorage.setItem('valnce-device-id', 'test-device-id');
        const requests = [];
        globalThis.fetch = async (url, options) => {
          requests.push({ url, options });
          if (status === 0) throw new Error('network failure');
          return new Response(body, { status });
        };
        output.push({
          name,
          status,
          result: await api[name](...args),
          requests,
          token: localStorage.getItem('valnce-streamer-token'),
        });
      }
    }
  } finally { globalThis.fetch = originalFetch; }
  return JSON.parse(JSON.stringify(output));
}
