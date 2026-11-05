import { loadSource, memoryStorage } from './load-source.mjs';
import { player } from './scenarios.mjs';

export async function renderScreens(root = 'src') {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
  globalThis.window = { location: { pathname: '/' } };
  const entry = `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { useAppStore } from './${root}/store/useAppStore';
    import LandingPage from './${root}/pages/LandingPage';
    import JoinPage from './${root}/pages/JoinPage';
    import StreamerGate from './${root}/pages/StreamerGate';
    import ManageApp from './${root}/pages/ManageApp';
    import PlayerFormModal from './${root}/components/PlayerFormModal';
    import SavedPlayerPanel from './${root}/components/SavedPlayerPanel';
    export { useAppStore };
    const noop = () => {};
    export function render(player) {
      return {
        landing: renderToStaticMarkup(<LandingPage onSelectStreamer={noop} onSelectViewer={noop} />),
        join: renderToStaticMarkup(<JoinPage onBack={noop} />),
        gate: renderToStaticMarkup(<StreamerGate onBack={noop} onSuccess={noop} />),
        manage: renderToStaticMarkup(<ManageApp onLogout={noop} />),
        create: renderToStaticMarkup(<PlayerFormModal open player={null} onClose={noop} />),
        edit: renderToStaticMarkup(<PlayerFormModal open player={player} onClose={noop} />),
        library: renderToStaticMarkup(<SavedPlayerPanel onClose={noop} />),
      };
    }`;
  const ui = await loadSource('ui-test.tsx', entry);
  const p = player('sample', { name: '테스트 플레이어', riotName: '닉네임', riotTag: 'KR', wins: 3, losses: 2, streak: 2 });
  // SSR uses getInitialState; explicitly expose the fixture state for this render only.
  ui.useAppStore.getInitialState = ui.useAppStore.getState;
  const empty = ui.render(p);
  ui.useAppStore.getState().addPlayer(p);
  ui.useAppStore.getState().addPlayer(player('other', { name: '다른 플레이어' }));
  ui.useAppStore.getState().movePlayer('sample', 'team1');
  ui.useAppStore.getState().movePlayer('other', 'team2');
  const populated = ui.render(p);
  return { empty, populated };
}
