import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderScreens } from './ui-scenarios.mjs';

test('all screen markup, text, classes and accessibility attributes remain identical', async () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/ui.json', import.meta.url)));
  assert.deepEqual(await renderScreens(), expected);
});
