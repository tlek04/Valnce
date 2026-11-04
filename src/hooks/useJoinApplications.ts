import { useCallback, useEffect, useState } from 'react';
import { JoinApplication } from '../types';
import { useAppStore } from '../store/useAppStore';
import { approveJoinApplication, fetchJoinQueue, rejectJoinApplication } from '../utils/joinApi';
import { nextAddNo, normalizePlayer, toSavedPlayer } from '../utils/player';
import { clearStreamerToken } from '../utils/streamerAuth';

export function useJoinApplications(onNotice?: (message: string) => void, onUnauthorized?: () => void) {
  const applyRemoteRoster = useAppStore((state) => state.applyRemoteRoster);
  const addPlayer = useAppStore((state) => state.addPlayer);
  const [applications, setApplications] = useState<JoinApplication[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

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
    setApplications(result.items ?? []);
  }, [onUnauthorized]);

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
        result.roster.players.map((player) => toSavedPlayer(player)),
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
