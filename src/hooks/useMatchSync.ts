import { useCallback, useRef, useState } from 'react';
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
        onNotice?.(
          count > 0
            ? `전적 동기화: ${count}판 반영 (시드 합산·중복 제거)`
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
