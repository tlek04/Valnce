/**
 * 원격 OAuth: cloudflared 임시 터널로 콜백을 공개한 뒤 로그인 서버를 띄운다.
 * 개발자 센터 리디렉션 URL에 출력된 https://.../callback 을 저장한 다음,
 * 스트리머에게 account-interlock 링크를 보내면 된다.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { ChzzkOpenClient } from 'chzzk-open-sdk';
import { FileTokenStore } from './tokenStore.js';
import { loadEnv } from './env.js';

function waitForTunnelUrl(child: ReturnType<typeof spawn>, timeoutMs = 90_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('cloudflared 터널 URL을 기다리는 시간이 초과되었습니다.'));
      }
    }, timeoutMs);

    const onData = (buf: Buffer) => {
      const text = buf.toString();
      process.stderr.write(text);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[0].replace(/\/$/, ''));
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`cloudflared 종료 code=${code}`));
      }
    });
  });
}

async function main() {
  const env = loadEnv();
  const tunnel = spawn(
    'npx',
    ['--yes', 'cloudflared', 'tunnel', '--url', `http://127.0.0.1:${env.loginPort}`],
    { shell: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  console.log('cloudflared 터널 시작 중…');
  const publicBase = await waitForTunnelUrl(tunnel);
  const redirectUri = `${publicBase}/callback`;

  // 이번 실행용으로 프로세스 env에 반영 (개발자 센터에도 동일 값 등록 필요)
  process.env.CHZZK_REDIRECT_URI = redirectUri;
  writeFileSync(
    '.redirect-uri.tmp',
    `${redirectUri}\n`,
    'utf8'
  );

  const tokenStore = new FileTokenStore(env.tokenPath);
  const client = new ChzzkOpenClient({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    tokenStore,
  });

  const state = randomBytes(16).toString('hex');
  const authUrl = client.getAuthorizationUrl({
    redirectUri,
    state,
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', redirectUri);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      if (!code || returnedState !== state) {
        console.error('callback mismatch', { hasCode: Boolean(code), returnedState, expectedState: state });
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<h1>invalid callback</h1><p>링크가 만료됐습니다. npm run login:remote 를 다시 실행하세요.</p>'
        );
        return;
      }
      await client.auth.login({ code, state });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<h1>Valnce 브릿지 로그인 완료</h1><p>스트리머 계정 동의가 저장되었습니다. 이 창을 닫아도 됩니다.</p>'
      );
      console.log(`토큰 저장: ${env.tokenPath}`);
      setTimeout(() => {
        tunnel.kill();
        process.exit(0);
      }, 300);
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h1>login failed</h1>');
      setTimeout(() => {
        tunnel.kill();
        process.exit(1);
      }, 300);
    }
  });

  server.listen(env.loginPort, '0.0.0.0', () => {
    console.log('');
    console.log('=== 원격 로그인 준비됨 ===');
    console.log(`1) 치지직 개발자 센터 리디렉션 URL을 아래로 저장하세요:`);
    console.log(`   ${redirectUri}`);
    console.log(`2) 저장 후 스트리머에게 아래 링크를 보내세요 (스트리머 계정으로 열기):`);
    console.log(authUrl);
    console.log('');
  });

  const shutdown = () => {
    tunnel.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
