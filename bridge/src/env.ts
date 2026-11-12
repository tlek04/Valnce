import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv() {
  const candidates = [resolve(process.cwd(), '.env'), resolve(import.meta.dirname, '../.env')];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadDotEnv();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

export function loadEnv() {
  return {
    clientId: required('CHZZK_CLIENT_ID'),
    clientSecret: required('CHZZK_CLIENT_SECRET'),
    channelId: required('CHZZK_CHANNEL_ID'),
    valnceBaseUrl: required('VALNCE_BASE_URL'),
    bridgeSecret: required('CHAT_BRIDGE_SECRET'),
    tokenPath: resolve(process.env.CHZZK_TOKEN_PATH?.trim() || './data/tokens.json'),
    redirectUri: process.env.CHZZK_REDIRECT_URI?.trim() || 'http://127.0.0.1:8788/callback',
    loginPort: Number(process.env.CHZZK_LOGIN_PORT || 8788),
  };
}
