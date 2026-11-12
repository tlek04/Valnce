import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChatCommand } from './commands.js';
import { allowChatCommand } from './commandGate.js';

test('parseChatCommand covers join, apply, away, help, order', () => {
  assert.deepEqual(parseChatCommand('!도움'), { type: 'help' });
  assert.deepEqual(parseChatCommand('!불참'), { type: 'away' });
  assert.deepEqual(parseChatCommand('!참가'), { type: 'join', riotId: undefined, canOrder: false });
  assert.deepEqual(parseChatCommand('!신청 Foo#KR1'), {
    type: 'join',
    riotId: 'Foo#KR1',
    canOrder: false,
  });
  assert.deepEqual(parseChatCommand('!참가 Foo#KR1 오더'), {
    type: 'join',
    riotId: 'Foo#KR1',
    canOrder: true,
  });
  assert.equal(parseChatCommand('안녕하세요'), null);
});

test('allowChatCommand dedupes rapid repeats from the same sender', () => {
  assert.equal(allowChatCommand({ senderKey: 'u1', commandType: 'join', cooldownMs: 60_000 }), true);
  assert.equal(allowChatCommand({ senderKey: 'u1', commandType: 'join', cooldownMs: 60_000 }), false);
  assert.equal(allowChatCommand({ senderKey: 'u2', commandType: 'join', cooldownMs: 60_000 }), true);
});
