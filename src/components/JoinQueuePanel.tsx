import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { JoinApplication } from '../types';
import { useAppStore } from '../store/useAppStore';
import { approveJoinApplication, fetchJoinQueue, rejectJoinApplication } from '../utils/joinApi';
import { normalizePlayer, toSavedPlayer } from '../utils/player';
import { clearStreamerToken } from '../utils/streamerAuth';

interface JoinQueuePanelProps {
  onNotice?: (message: string) => void;
  onUnauthorized?: () => void;
}

export default function JoinQueuePanel({ onNotice, onUnauthorized }: JoinQueuePanelProps) {
  const [items, setItems] = useState<JoinApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const applyRemoteRoster = useAppStore((state) => state.applyRemoteRoster);
  const addPlayer = useAppStore((state) => state.addPlayer);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchJoinQueue();
    setLoading(false);
    if (!result.ok) {
      if (result.error?.includes('인증') || result.error?.includes('비밀번호')) {
        clearStreamerToken();
        onUnauthorized?.();
        return;
      }
      onNotice?.(result.error || '신청 목록을 불러오지 못했습니다.');
      return;
    }
    setItems(result.items ?? []);
  }, [onNotice, onUnauthorized]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
    addPlayer(normalizePlayer(result.player));
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    onNotice?.(`${item.name} 승인 · 대기열에 추가됨 (#${item.queueNo})`);
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
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    onNotice?.(`${item.name} 신청을 거절했습니다.`);
  };

  return (
    <section className="rounded-2xl border border-val-line bg-val-panel/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-val-cream">신청 대기</h2>
          <p className="text-xs text-val-muted">{items.length}명 승인 대기</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="신청 목록 새로고침"
          className="rounded-lg p-2 text-val-muted hover:bg-white/5 hover:text-val-cream"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-val-line px-3 py-6 text-center text-sm text-val-muted">
          대기 중인 신청이 없습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-val-line bg-val-bg/70 px-3 py-2.5"
            >
              <span className="shrink-0 text-[11px] font-semibold text-val-teal">#{item.queueNo}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-val-cream">{item.name}</p>
                <p className="truncate text-[11px] text-val-muted">
                  {item.riotName}#{item.riotTag}
                </p>
              </div>
              <button
                type="button"
                disabled={actingId === item.id}
                onClick={() => void handleApprove(item)}
                className="inline-flex items-center gap-1 rounded-lg bg-val-teal/70 px-2.5 py-1.5 text-xs font-semibold text-val-bg hover:brightness-110 disabled:opacity-40"
              >
                <Check size={14} />
                승인
              </button>
              <button
                type="button"
                disabled={actingId === item.id}
                onClick={() => void handleReject(item)}
                className="inline-flex items-center gap-1 rounded-lg border border-val-line px-2.5 py-1.5 text-xs font-semibold text-val-muted hover:border-val-red/40 hover:text-val-red disabled:opacity-40"
              >
                <X size={14} />
                거절
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
