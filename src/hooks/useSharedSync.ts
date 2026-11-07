import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

type State = ReturnType<typeof useAppStore.getState>;
type Snapshot = { updatedAt: number };
type Status = 'idle' | 'syncing' | 'ok' | 'offline';
export interface SyncAdapter<T extends Snapshot> {
  configured(): boolean;
  fetch(): Promise<T | null>;
  push(state: State, base: number): Promise<{ ok: true; updatedAt?: number } | { ok: false; unauthorized?: boolean; remote?: T }>;
  changed(state: State, previous: State): boolean;
  timestamp(state: State): number;
  applying(): boolean;
  apply(remote: T): void;
}

/** One upload in flight, explicit dirty state, and effect-scoped cancellation. */
export function useSharedSync<T extends Snapshot>(adapter: SyncAdapter<T>, onNotice?: (message: string) => void, onUnauthorized?: () => void) {
  const [status, setStatus] = useState<Status>('idle');
  useEffect(() => {
    if (!adapter.configured()) return;
    let alive = true, hydrated = false, dirty = false, busy = false, started = false;
    let generation = 0, base = 0;
    let timer: number | undefined;
    const schedule = () => {
      if (!alive || !hydrated) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = undefined; void push(); }, 700);
    };
    const push = async () => {
      if (!alive || busy || !dirty || !hydrated) return;
      busy = true;
      setStatus('syncing');
      const version = generation;
      const result = await adapter.push(useAppStore.getState(), base);
      if (!alive) return;
      busy = false;
      if (result.ok) {
        base = result.updatedAt ?? base;
        if (generation === version) dirty = false;
        setStatus('ok');
      } else if (result.unauthorized) {
        onUnauthorized?.();
        setStatus('offline');
        return;
      } else if (result.remote) {
        // Never resurrect removed players or silently overwrite another client's revision.
        base = result.remote.updatedAt;
        adapter.apply(result.remote);
        dirty = false;
        generation++;
        onNotice?.('다른 기기의 변경을 불러왔습니다. 저장되지 않은 조작은 다시 확인해 주세요.');
        setStatus('ok');
      } else {
        setStatus('offline');
      }
      if (dirty && result.ok) schedule();
    };
    const pull = async (initial = false) => {
      if (!alive || busy) return;
      if (dirty && hydrated) { void push(); return; }
      busy = true;
      const version = generation;
      const localAt = adapter.timestamp(useAppStore.getState());
      const remote = await adapter.fetch();
      if (!alive) return;
      busy = false;
      if (!remote) {
        // Initial failure must not let an empty board overwrite an unknown remote revision.
        setStatus('offline');
        return;
      }
      if (version !== generation) {
        // Preserve edits made while this read was in flight; CAS detects remote changes.
        base = remote.updatedAt;
        hydrated = true;
        schedule();
        return;
      }
      base = remote.updatedAt;
      if (initial && localAt > remote.updatedAt && localAt <= Date.now() + 60_000) {
        dirty = true;
      } else {
        adapter.apply(remote);
      }
      hydrated = true;
      setStatus('ok');
      if (dirty) schedule();
    };
    const start = () => {
      if (started) return;
      started = true;
      void pull(true);
    };
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (adapter.applying() || !adapter.changed(state, previous)) return;
      generation++;
      dirty = true;
      schedule();
    });
    const unsubscribeHydrate = useAppStore.persist.onFinishHydration(start);
    if (useAppStore.persist.hasHydrated()) start();
    const refresh = () => { if (started) void pull(!hydrated); };
    const poll = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      unsubscribe(); unsubscribeHydrate();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [adapter, onNotice, onUnauthorized]);
  return status;
}
