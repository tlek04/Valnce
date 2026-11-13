import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP_TEXT, parseChatCommand } from './commands.js';
import { allowChatCommand } from './commandGate.js';
import { CHAT_MESSAGE_MAX, clipChat, formatCommandReply } from './chatReply.js';

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

test('formatCommandReply stays within chat limit and maps outcomes', () => {
  assert.ok(HELP_TEXT.length <= CHAT_MESSAGE_MAX);
  assert.equal(
    formatCommandReply({
      name: '쏭',
      kind: 'result',
      result: {
        ok: true,
        status: 200,
        body: { action: 'join', autoJoined: false, application: { queueNo: 12 } },
      },
    }),
    '쏭 신청 접수 #12 · 승인 대기 중이에요.'
  );
  assert.equal(
    formatCommandReply({
      name: '쏭',
      kind: 'result',
      ready: false,
      result: { ok: true, status: 200, body: { action: 'check_in', checkIn: 'away' } },
    }),
    '쏭 이번 판 불참 처리했어요.'
  );
  assert.equal(
    formatCommandReply({
      name: '쏭',
      kind: 'result',
      result: { ok: false, status: 400, body: { code: 'need_riot' } },
    }),
    '쏭 처음이면 !신청 닉#태그 로 신청해 주세요.'
  );
  assert.equal(clipChat('a'.repeat(120)).length, CHAT_MESSAGE_MAX);
});
