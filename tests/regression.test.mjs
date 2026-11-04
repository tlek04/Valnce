import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domainScenarios, storeScenarios, serverScenarios, fixedNow } from './scenarios.mjs';

const expected = JSON.parse(readFileSync(new URL('./fixtures/behavior.json', import.meta.url)));
for (const [name, run] of Object.entries({ domain: domainScenarios, store: storeScenarios, server: serverScenarios })) {
  test(`${name}: existing behavior, order, messages and persistence`, async () => {
    const originalNow = Date.now;
    const originalUUID = crypto.randomUUID;
    let sequence = 0;
    Date.now = () => fixedNow;
    crypto.randomUUID = () => `test-id-${++sequence}`;
    try { assert.deepEqual(await run(), expected[name]); }
    finally { Date.now = originalNow; crypto.randomUUID = originalUUID; }
  });
}
