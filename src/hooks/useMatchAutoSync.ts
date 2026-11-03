import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { importQualifyingMatches, isMatchSyncConfigured } from '../utils/matchImport';
import { MATCH_SYNC_INTERVAL_MS } from '../utils/valorantMatch';

export function useMatchAutoSync(onNotice?: (message: string) => void) {
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);
  const autoStarted = useRef(false);

  const markAttempt = () => {
    useAppStore.setState({ lastMatchSyncAt: Date.now() });
  };

  const runMatchSync = useCallback(
    async (options?: { force?: boolean; soft?: boolean }) => {
      if (!isMatchSyncConfigured()) {
        if (options?.force && !options.soft) {
          onNotice?.('배포된 Cloudflare 주소에서만 커스텀 전적 동기화가 됩니다.');
        }
        return { ok: false as const, skipped: true as const };
      }
      if (inFlight.current) return { ok: false as const, skipped: true as const };

      const last = useAppStore.getState().lastMatchSyncAt ?? 0;
      if (!options?.force && Date.now() - last < MATCH_SYNC_INTERVAL_MS) {
        return { ok: false as const, skipped: true as const };
      }

      inFlight.current = true;
      setSyncing(true);
      try {
        const imported = await importQualifyingMatches();
        // 성공·실패 모두 시도 시각을 남겨 짧은 재폭주 방지 (수동 force는 항상 가능)
        markAttempt();

        if (!imported.ok) {
          if (!options?.soft) onNotice?.(imported.error || '커스텀 전적 동기화에 실패했습니다.');
          else onNotice?.(`${imported.error || '매치 미확인'} · 수동 반영은 임시일 수 있습니다.`);
          return { ok: false as const, skipped: false as const };
        }

        useAppStore.getState().reconcileMatchStats(imported.matches);
        const count = imported.matches.length;
        if (options?.soft) {
          onNotice?.(
            count > 0
              ? `커스텀 ${count}판 기준으로 전적을 맞췄습니다.`
              : '임시 반영됨. 매치가 아직 안 보이면 나중에 커스텀 동기화로 확정하세요.'
          );
        } else {
          onNotice?.(
            count > 0
              ? `커스텀 전적 동기화: ${count}판 반영 (시드 합산·중복 제거)`
              : '조건에 맞는 커스텀이 없습니다. (시드 최근 판 · 명단 태그 2명+ · 8월~최신)'
          );
        }
        return { ok: true as const, skipped: false as const, matchCount: count };
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    },
    [onNotice]
  );

  useEffect(() => {
    if (!isMatchSyncConfigured()) return;

    const maybeAuto = () => {
      if (autoStarted.current) return;
      autoStarted.current = true;
      void runMatchSync({ force: false });
    };

    if (useAppStore.persist.hasHydrated()) {
      maybeAuto();
    }
    const unsub = useAppStore.persist.onFinishHydration(() => {
      maybeAuto();
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // 쿨다운은 runMatchSync 내부에서 처리
      void runMatchSync({ force: false });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [runMatchSync]);

  return { runMatchSync, syncing };
}
