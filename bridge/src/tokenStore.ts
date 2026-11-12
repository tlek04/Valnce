import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ChzzkTokenSet, TokenStore } from 'chzzk-open-sdk';

/** 디스크에 refresh 토큰을 남겨 재시작 후에도 유지한다. */
export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string) {}

  async get(): Promise<ChzzkTokenSet | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as ChzzkTokenSet;
      if (!parsed?.accessToken || !parsed?.refreshToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async set(tokens: ChzzkTokenSet): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch {
      /* ignore */
    }
  }
}
