import { useCallback, useEffect, useRef, useState } from 'react';
import { DAY_MS, PLAY_WINDOW_MS } from '../constants/game';
import { useAppStore } from '../store/useAppStore';
import { importQualifyingMatches, isMatchSyncConfigured } from '../utils/matchImport';

/** 마지막 성공 동기화로부터 하루가 지났으면 자동 동기화 대상 */
export function isDailyMatchSyncDue(lastAt: number | null, now = Date.now()) {
  return lastAt == null || now - lastAt >= DAY_MS;
}

/**
 * 전적·최근 참여 동기화.
 * - 헤더 버튼: 즉시 강제 동기화
 * - 하루 1회: 매니지 입장 후(및 매시간 점검) 자동 동기화
 */
export function useMatchSync(onNotice?: (message: string) => void) {
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);

  const runMatchSync = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force) {
        return { ok: false as const, skipped: true as const };
      }
      if (!isMatchSyncConfigured()) {
        onNotice?.('배포된 Cloudflare 주소에서만 전적 동기화가 됩니다.');
        return { ok: false as const, skipped: true as const };
      }
      if (inFlight.current) return { ok: false as const, skipped: true as const };

      inFlight.current = true;
      setSyncing(true);
      try {
        const imported = await importQualifyingMatches(useAppStore.getState().players);

        if (!imported.ok) {
          onNotice?.(imported.error || '전적 동기화에 실패했습니다.');
          return { ok: false as const, skipped: false as const };
        }

        // 성공 시에만 lastMatchSyncAt을 갱신해 하루 1회 자동 주기를 맞춘다.
        useAppStore.getState().reconcileMatchStats(imported.matches);
        const count = imported.matches.length;
        const recent = imported.matches.filter(
          (match) => Date.now() - match.playedAt <= PLAY_WINDOW_MS
        ).length;
        const skipped =
          imported.skippedSeeds && imported.skippedSeeds.length > 0
            ? ` · 제외 ${imported.skippedSeeds.length}명`
            : '';
        onNotice?.(
          count > 0
            ? `전적 동기화: ${count}판 반영 · 최근 24시간 ${recent}판 참여 반영${skipped}`
            : `조건에 맞는 커스텀이 없습니다. (포 뇨#S92 최근 판 · 명단 태그 2명+ · 8월~최신)${skipped}`
        );
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

    let cancelled = false;
    let removeHydration: (() => void) | undefined;
    const tryDaily = () => {
      if (cancelled || inFlight.current) return;
      if (!isDailyMatchSyncDue(useAppStore.getState().lastMatchSyncAt)) return;
      void runMatchSync({ force: true });
    };

    const start = () => {
      if (!cancelled) tryDaily();
    };

    if (useAppStore.persist.hasHydrated()) {
      start();
    } else {
      removeHydration = useAppStore.persist.onFinishHydration(start);
    }

    const timer = window.setInterval(tryDaily, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      removeHydration?.();
    };
  }, [runMatchSync]);

  return { runMatchSync, syncing };
}
