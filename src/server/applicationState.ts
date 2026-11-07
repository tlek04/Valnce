import { Env, RosterStorage } from './types';
import { dispatchApi } from './router';
import { json } from './http';
import { validateRequest } from './validation';

const legacyKeys = new Set(['shared-roster', 'shared-board', 'site-settings', 'auth:trusted-devices', 'auth:session-epoch', 'auth:access-log', 'join-queue']);
interface Entry { value: unknown; expiresAt?: number }
interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  transaction<T>(callback: (storage: Storage) => Promise<T>): Promise<T>;
  setAlarm(at: number): Promise<void>;
  getAlarm(): Promise<number | null>;
}

/** One named object owns all shared mutations. Each response commits its writes atomically. */
export class ApplicationState {
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  constructor(private ctx: { storage: Storage }, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (this.waiting >= 32) return json({ error: '요청이 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 });
    this.waiting++;
    const work = this.tail.then(() => this.run(request));
    this.tail = work.catch(() => undefined);
    try { return await work; } finally { this.waiting--; }
  }

  private async run(request: Request): Promise<Response> {
    const pending = new Map<string, Entry>();
    const now = Date.now();
    const storage = this.ctx.storage;
    const roster: RosterStorage = {
      get: async (key) => {
        let entry = pending.get(key) ?? await storage.get<Entry>(`data:${key}`);
        if (!entry) {
          // Import each legacy KV key once; persist null too, preventing resurrection.
          entry = { value: legacyKeys.has(key) ? await this.env.ROSTER.get(key, 'json') : null };
          if (key === 'shared-roster' && entry.value && typeof entry.value === 'object') {
            const data = entry.value as { updatedAt?: number };
            if ((data.updatedAt ?? 0) > now) data.updatedAt = now;
          }
          if (legacyKeys.has(key)) pending.set(key, entry);
        }
        return entry.expiresAt && entry.expiresAt <= now ? null : structuredClone(entry.value);
      },
      put: async (key, value, options) => {
        pending.set(key, { value: JSON.parse(value), ...(options?.expirationTtl
          ? { expiresAt: now + options.expirationTtl * 1000 } : {}) });
      },
      delete: async (key) => { pending.set(key, { value: null }); },
    };
    try {
      const invalid = await validateRequest(request);
      if (invalid) return invalid;
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const rateKey = `limit:${ip}`;
      const rate = await storage.get<{ count: number; until: number }>(rateKey);
      const current = rate && rate.until > now ? rate : { count: 0, until: now + 60_000 };
      if (current.count >= 240) return json({ error: '요청이 너무 많습니다.' }, { status: 429 });
      await storage.put(rateKey, { ...current, count: current.count + 1 });
      const response = await dispatchApi(request, { ...this.env, ROSTER: roster });
      // Failed mutations cannot partially delete a ticket or update a roster.
      if (response.status < 500) {
        await storage.transaction(async (transaction) => {
          for (const [key, value] of pending) await transaction.put(`data:${key}`, value);
        });
      }
      if (await storage.getAlarm() === null) await storage.setAlarm(now + 3600_000);
      return response;
    } catch {
      return json({ error: '요청 처리에 실패했습니다. 다시 시도하세요.' }, { status: 500 });
    }
  }

  async alarm(): Promise<void> {
    // Run in the same queue so cleanup cannot race an in-flight commit.
    const work = this.tail.then(async () => {
      const now = Date.now();
      for (const [key, entry] of await this.ctx.storage.list<Entry>({ prefix: 'data:' })) {
        if (entry.expiresAt && entry.expiresAt <= now) {
          // Ephemeral keys are never migrated from legacy KV again after expiry.
          if (legacyKeys.has(key.slice(5))) await this.ctx.storage.put(key, { value: null });
          else await this.ctx.storage.delete(key);
        }
      }
      for (const [key, rate] of await this.ctx.storage.list<{ until: number }>({ prefix: 'limit:' })) {
        if (rate.until <= now) await this.ctx.storage.delete(key);
      }
    });
    this.tail = work.catch(() => undefined);
    await work;
  }
}
