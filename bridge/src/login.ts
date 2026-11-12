/**
 * 1회성 OAuth 로그인 — 브라우저에서 치지직 계정으로 동의 후 tokens.json 저장.
 * 개발자 센터 앱의 리디렉션 URL과 CHZZK_REDIRECT_URI가 같아야 한다.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ChzzkOpenClient } from 'chzzk-open-sdk';
import { FileTokenStore } from './tokenStore.js';
import { loadEnv } from './env.js';

async function main() {
  const env = loadEnv();
  const tokenStore = new FileTokenStore(env.tokenPath);
  const client = new ChzzkOpenClient({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    tokenStore,
  });

  const state = randomBytes(16).toString('hex');
  const authUrl = client.getAuthorizationUrl({
    redirectUri: env.redirectUri,
    state,
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${env.loginPort}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      if (!code || returnedState !== state) {
        console.error('callback mismatch', {
          hasCode: Boolean(code),
          returnedState,
          expectedState: state,
        });
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<h1>invalid callback</h1><p>로그인 링크가 만료됐거나 state가 맞지 않습니다. 터미널에서 npm run login을 다시 실행한 뒤, 새로 출력된 전체 URL로만 접속하세요.</p>'
        );
        return;
      }
      await client.auth.login({ code, state });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h1>Valnce 브릿지 로그인 완료</h1><p>이 창을 닫아도 됩니다.</p>');
      console.log(`토큰 저장: ${env.tokenPath}`);
      setTimeout(() => process.exit(0), 200);
    } catch (error) {
      console.error(error);
      res.writeHead(500);
      res.end('login failed');
      setTimeout(() => process.exit(1), 200);
    }
  });

  server.listen(env.loginPort, '0.0.0.0', () => {
    console.log(`로그인 서버: http://localhost:${env.loginPort}`);
    console.log('브라우저에서 아래 URL을 여세요:');
    console.log(authUrl);
    console.log('개발자 센터 리디렉션 URL과 아래가 완전히 같아야 합니다:');
    console.log(env.redirectUri);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
