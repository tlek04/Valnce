import { useCallback, useEffect, useRef, useState } from 'react';
import { JoinApplication, Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import {
  approveJoinApplication,
  claimAutoJoinApplication,
  fetchJoinQueue,
  rejectJoinApplication,
} from '../utils/joinApi';
import { normalizePlayer, toSavedPlayer, withAddNo } from '../utils/player';
import { clearAllAuthTokens } from '../utils/streamerAuth';

function isAuthError(error?: string) {
  return Boolean(error && (error.includes('인증') || error.includes('비밀번호')));
}

function isAccessClosedError(error?: string) {
  return Boolean(error && error.includes('닫혀'));
}

function boardQueueNo(playerId: string): number | undefined {
  const state = useAppStore.getState();
  const found = [...state.waitlist, ...state.team1, ...state.team2].find(
    (row) => row.id === playerId
  );
  return found?.queueNo;
}

function isOnBoard(playerId: string): boolean {
  const state = useAppStore.getState();
  return [...state.waitlist, ...state.team1, ...state.team2].some((row) => row.id === playerId);
}

function forceAppendWaitlist(player: Player) {
  useAppStore.setState((state) => {
    const already = [...state.waitlist, ...state.team1, ...state.team2].some(
      (row) => row.id === player.id
    );
    if (already) return state;
    const { queueNo: _ticket, ...rest } = player;
    const session = withAddNo(
      { ...rest, canOrder: Boolean(player.canOrder) } as Player,
      [state.waitlist, state.team1, state.team2]
    );
    const now = Date.now();
    const hasSaved = state.players.some((item) => item.id === player.id);
    return {
      players: hasSaved ? state.players : [...state.players, toSavedPlayer(session)],
      waitlist: [...state.waitlist, session],
      boardUpdatedAt: now,
      rosterUpdatedAt: hasSaved ? state.rosterUpdatedAt : now,
    };
  });
}

/** 신청 티켓 번호는 쓰지 않고, 오늘 보드에 올라가는 순서로 순번을 붙인다. */
function bringPlayerToWaitlist(player: ReturnType<typeof normalizePlayer>): number | undefined {
  const state = useAppStore.getState();
  const { queueNo: _applicationTicket, ...withoutTicket } = player;
  const profile = { ...withoutTicket, canOrder: Boolean(player.canOrder) } as Player;

  if (isOnBoard(player.id)) {
    state.updatePlayer(player.id, {
      name: profile.name,
      canOrder: profile.canOrder,
      ...(profile.riotName ? { riotName: profile.riotName } : {}),
      ...(profile.riotTag ? { riotTag: profile.riotTag } : {}),
      currentTier: profile.currentTier,
      maxTier: profile.maxTier,
    });
    return boardQueueNo(player.id);
  }

  const inRoster = state.players.some((row) => row.id === player.id);
  if (inRoster) {
    state.updatePlayer(player.id, {
      name: profile.name,
      ...(profile.riotName ? { riotName: profile.riotName } : {}),
      ...(profile.riotTag ? { riotTag: profile.riotTag } : {}),
      currentTier: profile.currentTier,
      maxTier: profile.maxTier,
    });
    const enlisted = state.enlistPlayer(player.id, 'waitlist');
    if (enlisted.ok && isOnBoard(player.id)) {
      state.updatePlayer(player.id, { canOrder: profile.canOrder });
    } else {
      forceAppendWaitlist(profile);
    }
    return boardQueueNo(player.id);
  }

  state.addPlayer(profile);
  if (!isOnBoard(player.id)) {
    forceAppendWaitlist(profile);
  }
  return boardQueueNo(player.id);
}

export function useJoinApplications(onNotice?: (message: string) => void, onUnauthorized?: () => void) {
  const applyRemoteRoster = useAppStore((state) => state.applyRemoteRoster);
  const [applications, setApplications] = useState<JoinApplication[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const claimingRef = useRef(new Set<string>());
  const actingRef = useRef(new Set<string>());
  const pausedRef = useRef(false);
  const pollGeneration = useRef(0);

  const applyQueueItems = useCallback((items: JoinApplication[] | undefined, generation?: number) => {
    if (!items) return;
    if (generation !== undefined && generation !== pollGeneration.current) return;
    setApplications(items.filter((item) => !item.auto));
  }, []);

  const handleStaffAuthFailure = useCallback(() => {
    clearAllAuthTokens();
    onUnauthorized?.();
  }, [onUnauthorized]);

  const refreshApplications = useCallback(async () => {
    if (pausedRef.current) return;
    const generation = ++pollGeneration.current;
    const result = await fetchJoinQueue();
    if (generation !== pollGeneration.current) return;
    if (!result.ok) {
      if (isAccessClosedError(result.error)) {
        pausedRef.current = true;
        return;
      }
      if (isAuthError(result.error)) {
        handleStaffAuthFailure();
        return;
      }
      onNotice?.(result.error || '신청 목록을 불러오지 못했습니다.');
      return;
    }
    const items = result.items ?? [];
    applyQueueItems(items, generation);

    for (const item of items.filter((row) => row.auto && row.playerId)) {
      if (claimingRef.current.has(item.id)) continue;
      claimingRef.current.add(item.id);
      try {
        const claimed = await claimAutoJoinApplication(item.id);
        if (claimed.items) applyQueueItems(claimed.items);
        if (!claimed.ok || !claimed.player) {
          if (isAccessClosedError(claimed.error)) {
            pausedRef.current = true;
            return;
          }
          if (isAuthError(claimed.error)) {
            handleStaffAuthFailure();
            return;
          }
          continue;
        }

        const player = normalizePlayer(claimed.player);
        const boardNo = bringPlayerToWaitlist(player);

        onNotice?.(`${player.name} 기존 시청자 · 대기열 추가 (#${boardNo ?? '-'})`);
      } finally {
        claimingRef.current.delete(item.id);
      }
    }
  }, [applyQueueItems, handleStaffAuthFailure, onNotice]);

  useEffect(() => {
    void refreshApplications();
    const timer = window.setInterval(() => void refreshApplications(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshApplications]);

  const handleApprove = async (item: JoinApplication) => {
    if (actingRef.current.has(item.id)) return;
    actingRef.current.add(item.id);
    setActingId(item.id);
    setApplications((prev) => prev.filter((row) => row.id !== item.id));
    try {
      const result = await approveJoinApplication(item.id);
      if (!result.ok || !result.player) {
        void refreshApplications();
        if (isAccessClosedError(result.error)) return;
        if (isAuthError(result.error)) {
          handleStaffAuthFailure();
          return;
        }
        onNotice?.(result.error || '승인에 실패했습니다.');
        return;
      }
      if (result.items) applyQueueItems(result.items);

      // 보드에 먼저 올린 뒤 명단을 맞춤 — 명단 반영이 대기열 추가를 막지 않게
      const player = normalizePlayer(result.player);
      const boardNo = bringPlayerToWaitlist(player);
      if (result.roster) {
        applyRemoteRoster(
          result.roster.players.map((row) => toSavedPlayer(row)),
          result.roster.updatedAt
        );
      }

      onNotice?.(
        result.mmr === 'fallback'
          ? `${item.name} 승인 · 대기열 (#${boardNo ?? '-'}) · 티어 조회 실패(기본값)`
          : `${item.name} 승인 · 대기열에 추가됨 (#${boardNo ?? '-'})`
      );
    } finally {
      actingRef.current.delete(item.id);
      setActingId(null);
    }
  };

  const handleReject = async (item: JoinApplication) => {
    if (actingRef.current.has(item.id)) return;
    actingRef.current.add(item.id);
    setActingId(item.id);
    setApplications((prev) => prev.filter((row) => row.id !== item.id));
    try {
      const result = await rejectJoinApplication(item.id);
      if (!result.ok) {
        void refreshApplications();
        if (isAccessClosedError(result.error)) return;
        if (isAuthError(result.error)) {
          handleStaffAuthFailure();
          return;
        }
        onNotice?.(result.error || '거절에 실패했습니다.');
        return;
      }
      if (result.items) applyQueueItems(result.items);
      onNotice?.(`${item.name} 신청을 거절했습니다.`);
    } finally {
      actingRef.current.delete(item.id);
      setActingId(null);
    }
  };

  return { applications, actingId, handleApprove, handleReject };
}
