import { useCallback, useEffect, useRef, useState } from 'react';
import { JoinApplication } from '../types';
import { useAppStore } from '../store/useAppStore';
import {
  approveJoinApplication,
  claimAutoJoinApplication,
  fetchJoinQueue,
  rejectJoinApplication,
} from '../utils/joinApi';
import { nextAddNo, normalizePlayer, toSavedPlayer } from '../utils/player';
import { clearStreamerToken } from '../utils/streamerAuth';

function patchBoardQueueNo(playerId: string, queueNo: number) {
  useAppStore.setState((state) => ({
    waitlist: state.waitlist.map((player) =>
      player.id === playerId ? { ...player, queueNo } : player
    ),
    team1: state.team1.map((player) => (player.id === playerId ? { ...player, queueNo } : player)),
    team2: state.team2.map((player) => (player.id === playerId ? { ...player, queueNo } : player)),
  }));
}

export function useJoinApplications(onNotice?: (message: string) => void, onUnauthorized?: () => void) {
  const applyRemoteRoster = useAppStore((state) => state.applyRemoteRoster);
  const addPlayer = useAppStore((state) => state.addPlayer);
  const enlistPlayer = useAppStore((state) => state.enlistPlayer);
  const [applications, setApplications] = useState<JoinApplication[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const claimingRef = useRef(new Set<string>());

  const refreshApplications = useCallback(async () => {
    const result = await fetchJoinQueue();
    if (!result.ok) {
      if (result.error?.includes('인증') || result.error?.includes('비밀번호')) {
        clearStreamerToken();
        onUnauthorized?.();
        return;
      }
      return;
    }
    const items = result.items ?? [];
    setApplications(items.filter((item) => !item.auto));

    for (const item of items.filter((row) => row.auto && row.playerId)) {
      if (claimingRef.current.has(item.id)) continue;
      claimingRef.current.add(item.id);
      try {
        const claimed = await claimAutoJoinApplication(item.id);
        if (!claimed.ok || !claimed.player) {
          if (claimed.error?.includes('인증')) {
            clearStreamerToken();
            onUnauthorized?.();
            return;
          }
          continue;
        }

        const player = normalizePlayer(claimed.player);
        const queueNo = item.queueNo || player.queueNo || nextAddNo([
          useAppStore.getState().waitlist,
          useAppStore.getState().team1,
          useAppStore.getState().team2,
        ]);
        const state = useAppStore.getState();
        const onBoard = [...state.waitlist, ...state.team1, ...state.team2].some(
          (row) => row.id === player.id
        );
        const inRoster = state.players.some((row) => row.id === player.id);

        if (onBoard) {
          enlistPlayer(player.id, 'waitlist');
        } else if (inRoster) {
          enlistPlayer(player.id, 'waitlist');
        } else {
          addPlayer({ ...player, queueNo });
          onNotice?.(`${player.name} 기존 시청자 · 대기열 추가 (#${queueNo})`);
          continue;
        }
        patchBoardQueueNo(player.id, queueNo);
        onNotice?.(`${player.name} 기존 시청자 · 대기열 추가 (#${queueNo})`);
      } finally {
        claimingRef.current.delete(item.id);
      }
    }
  }, [addPlayer, enlistPlayer, onNotice, onUnauthorized]);

  useEffect(() => {
    void refreshApplications();
    const timer = window.setInterval(() => void refreshApplications(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshApplications]);

  const handleApprove = async (item: JoinApplication) => {
    setActingId(item.id);
    const result = await approveJoinApplication(item.id);
    setActingId(null);
    if (!result.ok || !result.player) {
      if (result.error?.includes('인증')) {
        clearStreamerToken();
        onUnauthorized?.();
        return;
      }
      onNotice?.(result.error || '승인에 실패했습니다.');
      return;
    }
    if (result.roster) {
      applyRemoteRoster(
        result.roster.players.map((row) => toSavedPlayer(row)),
        result.roster.updatedAt
      );
    }
    const state = useAppStore.getState();
    const addNo = nextAddNo([state.waitlist, state.team1, state.team2]);
    addPlayer({ ...normalizePlayer(result.player), queueNo: addNo });
    setApplications((prev) => prev.filter((row) => row.id !== item.id));
    onNotice?.(`${item.name} 승인 · 대기열에 추가됨 (#${addNo})`);
  };

  const handleReject = async (item: JoinApplication) => {
    setActingId(item.id);
    const result = await rejectJoinApplication(item.id);
    setActingId(null);
    if (!result.ok) {
      if (result.error?.includes('인증')) {
        clearStreamerToken();
        onUnauthorized?.();
        return;
      }
      onNotice?.(result.error || '거절에 실패했습니다.');
      return;
    }
    setApplications((prev) => prev.filter((row) => row.id !== item.id));
    onNotice?.(`${item.name} 신청을 거절했습니다.`);
  };

  return { applications, actingId, handleApprove, handleReject };
}
