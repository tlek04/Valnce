// One-off: regenerate fixtures from current src. Not part of npm test.
import { mkdirSync, writeFileSync } from 'node:fs';
import { domainScenarios, storeScenarios, serverScenarios, fixedNow } from './scenarios.mjs';
import { renderScreens } from './ui-scenarios.mjs';
import { clientScenarios } from './client-scenarios.mjs';

mkdirSync('tests/fixtures', { recursive: true });

Date.now = () => fixedNow;
const behavior = {};
for (const [name, run] of Object.entries({
  domain: domainScenarios,
  store: storeScenarios,
  server: serverScenarios,
})) {
  let sequence = 0;
  crypto.randomUUID = () => `test-id-${++sequence}`;
  behavior[name] = await run('src');
}
writeFileSync('tests/fixtures/behavior.json', JSON.stringify(behavior, null, 2) + '\n');
console.log('updated behavior.json');

writeFileSync('tests/fixtures/ui.json', JSON.stringify(await renderScreens('src'), null, 2) + '\n');
console.log('updated ui.json');

writeFileSync('tests/fixtures/client.json', JSON.stringify(await clientScenarios('src'), null, 2) + '\n');
console.log('updated client.json');
