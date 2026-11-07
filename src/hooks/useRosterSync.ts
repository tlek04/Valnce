import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { isApplyingRemoteRoster } from '../utils/rosterApplyGuard';
import { fetchRemoteRoster, isRosterSyncConfigured, pushRemoteRoster } from '../utils/rosterSync';

type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline';

/** 기존 플레이어 명단만 서버(KV)와 맞춘다. 방 코드 없음. */
export function useRosterSync(
  onNotice?: (message: string) => void,
  onUnauthorized?: () => void
) {
  const [status, setStatus] = useState<SyncStatus>('idle');
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
        useAppStore.getState().applyRemoteRoster(remote.players, remote.updatedAt);
        onNotice?.(`서버 명단 ${remote.players.length}명을 불러왔습니다.`);
      } else if (localUpdatedAt > remote.updatedAt) {
        const { players, rosterUpdatedAt } = useAppStore.getState();
        const pushed = await pushRemoteRoster(players, rosterUpdatedAt || Date.now());
        if (!pushed.ok && 'unauthorized' in pushed && pushed.unauthorized) {
          onUnauthorized?.();
          return;
        }
        if (!pushed.ok && pushed.conflict) {
          useAppStore.getState().applyRemoteRoster(pushed.roster.players, pushed.roster.updatedAt);
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
      if (!hydrated.current || isApplyingRemoteRoster()) return;
      if (state.players === previous.players) return;
      // 원격 반영·수동 stamp로 rosterUpdatedAt이 이미 바뀐 경우 Date.now()로 덮어 push하지 않음
      if (state.rosterUpdatedAt !== previous.rosterUpdatedAt) return;

      const updatedAt = Date.now();
      useAppStore.getState().setRosterUpdatedAt(updatedAt);

      if (pushTimer.current) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => {
        setStatus('syncing');
        void pushRemoteRoster(useAppStore.getState().players, updatedAt).then((result) => {
          if (result.ok) {
            setStatus('ok');
            return;
          }
          if ('unauthorized' in result && result.unauthorized) {
            onUnauthorized?.();
            return;
          }
          if (result.conflict) {
            useAppStore.getState().applyRemoteRoster(result.roster.players, result.roster.updatedAt);
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
  }, [onNotice, onUnauthorized]);

  return status;
}
