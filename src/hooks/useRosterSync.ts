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
  const pulling = useRef(false);
  const pushEpoch = useRef(0);

  useEffect(() => {
    if (!isRosterSyncConfigured()) return;

    let started = false;

    const clearPushTimer = () => {
      if (pushTimer.current) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
    };

    const pushPlayers = (updatedAt: number) => {
      clearPushTimer();
      const epoch = ++pushEpoch.current;
      pushTimer.current = window.setTimeout(() => {
        setStatus('syncing');
        const snapshotAt = updatedAt;
        const snapshotPlayers = useAppStore.getState().players;
        void pushRemoteRoster(snapshotPlayers, snapshotAt).then((result) => {
          if (epoch !== pushEpoch.current) return;
          if (result.ok) {
            setStatus('ok');
            return;
          }
          if ('unauthorized' in result && result.unauthorized) {
            onUnauthorized?.();
            return;
          }
          if (result.conflict) {
            // 로컬이 푸시 대기 중 더 바뀌었으면 서버 스냅샷으로 덮지 않음
            const localAt = useAppStore.getState().rosterUpdatedAt ?? 0;
            if (localAt > snapshotAt) {
              pushPlayers(localAt);
              return;
            }
            useAppStore.getState().applyRemoteRoster(result.roster.players, result.roster.updatedAt);
            setStatus('ok');
            return;
          }
          setStatus('offline');
        });
      }, 700);
    };

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
        setStatus('ok');
      } else if (localUpdatedAt > remote.updatedAt) {
        const { players, rosterUpdatedAt } = useAppStore.getState();
        const pushed = await pushRemoteRoster(players, rosterUpdatedAt || Date.now());
        if (!pushed.ok && 'unauthorized' in pushed && pushed.unauthorized) {
          onUnauthorized?.();
          return;
        }
        if (!pushed.ok && pushed.conflict) {
          useAppStore.getState().applyRemoteRoster(pushed.roster.players, pushed.roster.updatedAt);
          setStatus('ok');
        } else if (!pushed.ok) {
          setStatus('offline');
        } else {
          setStatus('ok');
        }
      } else {
        setStatus('ok');
      }
      hydrated.current = true;
    };

    const pullRemote = async (opts?: { enlistNew?: boolean }) => {
      if (!hydrated.current || pulling.current || isApplyingRemoteRoster()) return;
      if (pushTimer.current) return; // 로컬 푸시 대기 중이면 pull로 덮지 않음
      pulling.current = true;
      try {
        const remote = await fetchRemoteRoster();
        if (!remote) return;
        const state = useAppStore.getState();
        const localUpdatedAt = state.rosterUpdatedAt ?? 0;
        if (remote.updatedAt <= localUpdatedAt) return;

        clearPushTimer();
        const beforeIds = new Set(state.players.map((player) => player.id));
        state.applyRemoteRoster(remote.players, remote.updatedAt);

        if (opts?.enlistNew) {
          for (const player of remote.players) {
            if (beforeIds.has(player.id)) continue;
            const board = useAppStore.getState();
            const onBoard = [...board.waitlist, ...board.team1, ...board.team2].some(
              (row) => row.id === player.id
            );
            if (!onBoard) board.enlistPlayer(player.id, 'waitlist');
          }
        }
        setStatus('ok');
      } finally {
        pulling.current = false;
      }
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

      const updatedAt =
        state.rosterUpdatedAt !== previous.rosterUpdatedAt && state.rosterUpdatedAt
          ? state.rosterUpdatedAt
          : Date.now();
      if (state.rosterUpdatedAt === previous.rosterUpdatedAt) {
        useAppStore.getState().setRosterUpdatedAt(updatedAt);
      }
      pushPlayers(updatedAt);
    });

    const pollTimer = window.setInterval(() => void pullRemote({ enlistNew: true }), 5000);
    const onFocus = () => void pullRemote({ enlistNew: true });
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      unsubHydrate();
      unsub();
      window.clearInterval(pollTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearPushTimer();
    };
  }, [onNotice, onUnauthorized]);

  return status;
}
