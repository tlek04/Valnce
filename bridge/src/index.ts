import { ChzzkOpenClient } from 'chzzk-open-sdk';
import { FileTokenStore } from './tokenStore.js';
import { ValnceClient } from './valnceClient.js';
import { HELP_TEXT, parseChatCommand } from './commands.js';
import { allowChatCommand } from './commandGate.js';
import { loadEnv } from './env.js';

const HEARTBEAT_MS = 30_000;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

async function main() {
  const env = loadEnv();
  const tokenStore = new FileTokenStore(env.tokenPath);
  const tokens = await tokenStore.get();
  if (!tokens) {
    throw new Error(`토큰이 없습니다. 먼저 npm run login 으로 OAuth 로그인하세요. (${env.tokenPath})`);
  }

  const client = new ChzzkOpenClient({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    tokenStore,
  });
  await client.auth.setTokens(tokens);

  const valnce = new ValnceClient({
    baseUrl: env.valnceBaseUrl,
    bridgeSecret: env.bridgeSecret,
  });

  const realtime = client.createRealtime({
    auth: 'client',
    subscriptions: ['chat'],
  });

  realtime.on('chat', (chat) => {
    void handleChat(valnce, {
      nickname: chat.nickname,
      content: chat.content,
      senderChannelId: chat.senderChannelId,
      channelId: chat.channelId,
    });
  });

  realtime.on('disconnected', () => log('치지직 세션 끊김 — 재연결 대기'));
  realtime.on('reconnecting', () => log('치지직 세션 재연결 중…'));
  realtime.on('revoked', (event) => log('구독 권한 회수', event));

  await realtime.start();
  log('치지직 채팅 구독 시작', { channelId: env.channelId });

  const beat = async () => {
    try {
      await valnce.heartbeat(env.channelId);
    } catch (error) {
      log('heartbeat 실패', error instanceof Error ? error.message : error);
    }
  };
  await beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_MS);

  const shutdown = () => {
    clearInterval(timer);
    realtime.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function handleChat(
  valnce: ValnceClient,
  chat: { nickname?: string; content?: string; senderChannelId?: string; channelId?: string }
) {
  const name = (chat.nickname ?? '').trim();
  const content = (chat.content ?? '').trim();
  if (!name || !content) return;

  const command = parseChatCommand(content);
  if (!command) return;

  if (command.type === 'help') {
    log(`${name}: 도움 요청 — ${HELP_TEXT}`);
    return;
  }

  const senderKey = (chat.senderChannelId || name).trim();
  const commandType = command.type === 'away' ? 'away' : 'join';
  if (
    !allowChatCommand({
      senderKey,
      commandType,
      riotId: command.type === 'join' ? command.riotId : undefined,
    })
  ) {
    log(`${name}: 명령 쿨다운 (로컬 디듀프)`);
    return;
  }

  try {
    if (command.type === 'away') {
      const result = await valnce.participate({
        name,
        senderChannelId: chat.senderChannelId,
        ready: false,
      });
      log(`${name}: !불참`, result.status, result.body.code ?? result.body.action ?? result.body.error);
      return;
    }

    const result = await valnce.participate({
      name,
      senderChannelId: chat.senderChannelId,
      riotId: command.riotId,
      canOrder: command.canOrder,
      ready: true,
    });
    log(
      `${name}: !참가/신청`,
      result.status,
      result.body.code ?? result.body.action ?? result.body.error ?? (result.ok ? 'ok' : 'fail')
    );
  } catch (error) {
    log(`${name}: 명령 처리 실패`, error instanceof Error ? error.message : error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
