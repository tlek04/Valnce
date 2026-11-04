import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clientScenarios } from './client-scenarios.mjs';

test('client API success, auth, conflicts, malformed responses and offline behavior', async () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/client.json', import.meta.url)));
  assert.deepEqual(await clientScenarios(), expected);
});
