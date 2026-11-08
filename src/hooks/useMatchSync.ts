import { useCallback, useEffect, useRef, useState } from 'react';
import { MATCH_SYNC_COOLDOWN_MS, PLAY_WINDOW_MS } from '../constants/game';
import { useAppStore } from '../store/useAppStore';
import { importQualifyingMatches, isMatchSyncConfigured } from '../utils/matchImport';

/** 자동 전적 동기화 대상 (마지막 성공 후 12시간) */
export function isMatchSyncDue(lastAt: number | null, now = Date.now()) {
  return lastAt == null || now - lastAt >= MATCH_SYNC_COOLDOWN_MS;
}

/** @deprecated isMatchSyncDue 사용 */
export function isDailyMatchSyncDue(lastAt: number | null, now = Date.now()) {
  return isMatchSyncDue(lastAt, now);
}

/**
 * 전적·최근 참여 동기화.
 * - 헤더 버튼·팀 초기화(force): 서버 10초 제한만 적용, 즉시 요청
 * - 팀 승 기록·매니지 입장 자동: 12시간에 한 번
 */
export function useMatchSync(onNotice?: (message: string) => void) {
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);

  const runMatchSync = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force) {
        if (!isMatchSyncDue(useAppStore.getState().lastMatchSyncAt)) {
          return { ok: false as const, skipped: true as const };
        }
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
    const tryAuto = () => {
      if (cancelled || inFlight.current) return;
      void runMatchSync();
    };

    const start = () => {
      if (!cancelled) tryAuto();
    };

    if (useAppStore.persist.hasHydrated()) {
      start();
    } else {
      removeHydration = useAppStore.persist.onFinishHydration(start);
    }

    const timer = window.setInterval(tryAuto, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      removeHydration?.();
    };
  }, [runMatchSync]);

  return { runMatchSync, syncing };
}
