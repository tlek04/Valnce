import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchRemoteRoster, isRosterSyncConfigured, pushRemoteRoster } from '../utils/rosterSync';

type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline';

/** 기존 플레이어 명단만 서버(KV)와 맞춘다. 방 코드 없음. */
export function useRosterSync(onNotice?: (message: string) => void) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const applyingRemote = useRef(false);
  const pushTimer = useRef<number | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!isRosterSyncConfigured()) return;

    let started = false;
    const finishHydration = async () => {
      if (started) return;
      started = true;
      setStatus('syncing');
      const remote = await fetchRemoteRoster();
      if (!remote) {
        setStatus('offline');
        hydrated.current = true;
        return;
      }

      const localUpdatedAt = useAppStore.getState().rosterUpdatedAt ?? 0;
      if (remote.updatedAt > localUpdatedAt) {
        applyingRemote.current = true;
        useAppStore.getState().applyRemoteRoster(remote.players, remote.updatedAt);
        applyingRemote.current = false;
        onNotice?.(`서버 명단 ${remote.players.length}명을 불러왔습니다.`);
      } else if (localUpdatedAt > remote.updatedAt) {
        const { players, rosterUpdatedAt } = useAppStore.getState();
        const pushed = await pushRemoteRoster(players, rosterUpdatedAt || Date.now());
        if (!pushed.ok && pushed.conflict) {
          applyingRemote.current = true;
          useAppStore.getState().applyRemoteRoster(pushed.roster.players, pushed.roster.updatedAt);
          applyingRemote.current = false;
        }
      }
      setStatus('ok');
      hydrated.current = true;
    };

    const unsubHydrate = useAppStore.persist.onFinishHydration(() => {
      void finishHydration();
    });
    if (useAppStore.persist.hasHydrated()) {
      void finishHydration();
    }

    const unsub = useAppStore.subscribe((state, previous) => {
      if (!hydrated.current || applyingRemote.current) return;
      if (state.players === previous.players) return;

      const updatedAt = Date.now();
      useAppStore.setState({ rosterUpdatedAt: updatedAt });

      if (pushTimer.current) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => {
        setStatus('syncing');
        void pushRemoteRoster(useAppStore.getState().players, updatedAt).then((result) => {
          if (result.ok) {
            setStatus('ok');
            return;
          }
          if (result.conflict) {
            applyingRemote.current = true;
            useAppStore.getState().applyRemoteRoster(result.roster.players, result.roster.updatedAt);
            applyingRemote.current = false;
            setStatus('ok');
            return;
          }
          setStatus('offline');
        });
      }, 700);
    });

    return () => {
      unsubHydrate();
      unsub();
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, [onNotice]);

  return status;
}
