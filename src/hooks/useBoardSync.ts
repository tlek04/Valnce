import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { isApplyingRemoteBoard } from '../utils/boardApplyGuard';
import {
  boardSnapshotFromState,
  fetchRemoteBoard,
  isBoardSyncConfigured,
  pushRemoteBoard,
} from '../utils/boardSync';

type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline';

function boardChanged(
  state: ReturnType<typeof useAppStore.getState>,
  previous: ReturnType<typeof useAppStore.getState>
) {
  return (
    state.waitlist !== previous.waitlist ||
    state.team1 !== previous.team1 ||
    state.team2 !== previous.team2 ||
    state.matchMapId !== previous.matchMapId ||
    state.attackSide !== previous.attackSide ||
    state.balanceNote !== previous.balanceNote ||
    state.balanceDetails !== previous.balanceDetails
  );
}

/** 대기열·팀·맵·공수 보드를 서버(KV)와 맞춘다. last-write-wins. */
export function useBoardSync(
  onNotice?: (message: string) => void,
  onUnauthorized?: () => void
) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const pushTimer = useRef<number | null>(null);
  const hydrated = useRef(false);
  const pulling = useRef(false);
  const pushEpoch = useRef(0);

  useEffect(() => {
    if (!isBoardSyncConfigured()) return;

    let started = false;

    const clearPushTimer = () => {
      if (pushTimer.current) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
    };

    const pushBoard = (updatedAt: number) => {
      clearPushTimer();
      const epoch = ++pushEpoch.current;
      pushTimer.current = window.setTimeout(() => {
        setStatus('syncing');
        const snapshotAt = updatedAt;
        const snapshot = boardSnapshotFromState(useAppStore.getState());
        void pushRemoteBoard(snapshot, snapshotAt).then((result) => {
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
            const localAt = useAppStore.getState().boardUpdatedAt ?? 0;
            if (localAt > snapshotAt) {
              pushBoard(localAt);
              return;
            }
            useAppStore.getState().applyRemoteBoard(result.board, result.board.updatedAt);
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
      const remote = await fetchRemoteBoard();
      if (!remote) {
        setStatus('offline');
        hydrated.current = true;
        return;
      }

      const localUpdatedAt = useAppStore.getState().boardUpdatedAt ?? 0;
      if (remote.updatedAt > localUpdatedAt) {
        useAppStore.getState().applyRemoteBoard(remote, remote.updatedAt);
        const count = remote.waitlist.length + remote.team1.length + remote.team2.length;
        if (count > 0) {
          onNotice?.(`서버 보드 ${count}명을 불러왔습니다.`);
        }
        setStatus('ok');
      } else if (localUpdatedAt > remote.updatedAt) {
        const state = useAppStore.getState();
        const pushed = await pushRemoteBoard(
          boardSnapshotFromState(state),
          state.boardUpdatedAt || Date.now()
        );
        if (!pushed.ok && 'unauthorized' in pushed && pushed.unauthorized) {
          onUnauthorized?.();
          return;
        }
        if (!pushed.ok && pushed.conflict) {
          useAppStore.getState().applyRemoteBoard(pushed.board, pushed.board.updatedAt);
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

    const pullRemote = async () => {
      if (!hydrated.current || pulling.current || isApplyingRemoteBoard()) return;
      if (pushTimer.current) return;
      pulling.current = true;
      try {
        const remote = await fetchRemoteBoard();
        if (!remote) return;
        const localUpdatedAt = useAppStore.getState().boardUpdatedAt ?? 0;
        if (remote.updatedAt <= localUpdatedAt) return;
        clearPushTimer();
        useAppStore.getState().applyRemoteBoard(remote, remote.updatedAt);
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
      if (!hydrated.current || isApplyingRemoteBoard()) return;
      if (!boardChanged(state, previous)) return;

      const updatedAt =
        state.boardUpdatedAt !== previous.boardUpdatedAt && state.boardUpdatedAt
          ? state.boardUpdatedAt
          : Date.now();
      if (state.boardUpdatedAt === previous.boardUpdatedAt) {
        useAppStore.getState().setBoardUpdatedAt(updatedAt);
      }
      pushBoard(updatedAt);
    });

    const pollTimer = window.setInterval(() => void pullRemote(), 5000);
    const onFocus = () => void pullRemote();
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
