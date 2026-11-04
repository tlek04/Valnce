// Explicit one-time capture from the preserved pre-refactor sources. Never run as part of tests.
import { mkdirSync, writeFileSync } from 'node:fs';
import { domainScenarios, storeScenarios, serverScenarios, fixedNow } from './scenarios.mjs';
const output = {};
Date.now = () => fixedNow;
for (const [name, run] of Object.entries({ domain: domainScenarios, store: storeScenarios, server: serverScenarios })) {
  let sequence = 0;
  crypto.randomUUID = () => `test-id-${++sequence}`;
  output[name] = await run('.refactor-baseline/src');
}
mkdirSync('tests/fixtures', { recursive: true });
writeFileSync('tests/fixtures/behavior.json', JSON.stringify(output, null, 2) + '\n');
