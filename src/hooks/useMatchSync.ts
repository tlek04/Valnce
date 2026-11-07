import { useCallback, useRef, useState } from 'react';
import { PLAY_WINDOW_MS } from '../constants/game';
import { useAppStore } from '../store/useAppStore';
import { importQualifyingMatches, isMatchSyncConfigured } from '../utils/matchImport';

/** 전적 동기화 버튼을 눌렀을 때만 Henrik API를 호출한다. */
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
        useAppStore.getState().markMatchSyncAttempt();

        if (!imported.ok) {
          onNotice?.(imported.error || '전적 동기화에 실패했습니다.');
          return { ok: false as const, skipped: false as const };
        }

        useAppStore.getState().reconcileMatchStats(imported.matches);
        const count = imported.matches.length;
        const recent = imported.matches.filter(
          (match) => Date.now() - match.playedAt <= PLAY_WINDOW_MS
        ).length;
        onNotice?.(
          count > 0
            ? `전적 동기화: ${count}판 반영 · 최근 24시간 ${recent}판 참여 반영`
            : '조건에 맞는 커스텀이 없습니다. (시드 최근 판 · 명단 태그 2명+ · 8월~최신)'
        );
        return { ok: true as const, skipped: false as const, matchCount: count };
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    },
    [onNotice]
  );

  return { runMatchSync, syncing };
}
