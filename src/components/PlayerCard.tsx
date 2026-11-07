import { useLayoutEffect, useRef, useState } from 'react';
import { Lock, Megaphone, Pencil, Swords, Trash2, Users } from 'lucide-react';
import { Player } from '../types';
import { TIER_STYLES, formatRating, getRestrictionLabel } from '../constants/valorant';
import { useAppStore } from '../store/useAppStore';
import { formatRecord, formatRiotId, formatStreak } from '../utils/matchStats';
import { playerScrimTier } from '../utils/rating';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
  /** 대기열에만 삭제(휴지통) 표시 */
  showDelete?: boolean;
  overlay?: boolean;
}

/** 실제로 넘칠 때만 … 을 붙인다 (짧으면 절대 안 붙음). */
function useEllipsisWhenOverflow<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      setOverflow(false);
      return;
    }
    const sync = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return { ref, overflow };
}

function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export default function PlayerCard({
  player,
  onEdit,
  onDelete,
  showDelete = false,
  overlay = false,
}: PlayerCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inWaitlist = useAppStore((state) => state.waitlist.some((item) => item.id === player.id));
  const showMatchRecord = useAppStore((state) => state.showMatchRecord);
  const updatePlayer = useAppStore((state) => state.updatePlayer);
  const roster = useAppStore((state) => [...state.waitlist, ...state.team1, ...state.team2]);
  const names = (ids: string[]) =>
    ids
      .map((id) => roster.find((item) => item.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  const rivals = names(player.rivalIds ?? []);
  const allies = names(player.allyIds ?? []);
  const restrictionLabels = (player.restrictions ?? []).map(getRestrictionLabel);
  const scrimTier = playerScrimTier(player);
  const isMatch = player.lockedTeam === 'MATCH' || player.lockedTeam === 'WAITLIST';
  const isBench = player.lockedTeam === 'BENCH';
  const teamLockLabel =
    player.lockedTeam === 'TEAM_1' ? '1팀 고정' : player.lockedTeam === 'TEAM_2' ? '2팀 고정' : null;
  const teamLockTone =
    player.lockedTeam === 'TEAM_1'
      ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
      : 'border-val-red/30 bg-val-red/10 text-val-red';
  const streakLabel = formatStreak(player.streak);
  const hasRecord =
    showMatchRecord && (player.wins > 0 || player.losses > 0 || player.streak !== 0);
  const riotId = formatRiotId(player.riotName, player.riotTag);
  const queueNo = player.queueNo;
  const playCount = player.playCount ?? 0;
  // 팀·대기열 동일. 대기열+내전만 뱃지 단독(현재·최고 숨김).
  const waitlistScrimOnly = inWaitlist && Boolean(scrimTier);
  const showCurrent = Boolean(scrimTier) && !inWaitlist;
  const showPeak = !waitlistScrimOnly;

  const nameEllipsis = useEllipsisWhenOverflow<HTMLHeadingElement>(player.name);
  const riotEllipsis = useEllipsisWhenOverflow<HTMLParagraphElement>(riotId);

  const setLock = (value: 'MATCH' | 'BENCH' | null) => {
    updatePlayer(player.id, { lockedTeam: value });
  };

  const chipBtn = (active: boolean, tone: 'teal' | 'warn') => {
    if (tone === 'teal') {
      return active
        ? 'rounded border border-val-teal/50 bg-val-teal/25 px-1.5 py-0.5 text-[11px] font-semibold text-val-teal'
        : 'rounded border border-val-line/50 px-1.5 py-0.5 text-[11px] text-val-muted/70 hover:border-val-teal/40 hover:text-val-teal';
    }
    return active
      ? 'rounded border border-val-warn/50 bg-val-warn/25 px-1.5 py-0.5 text-[11px] font-semibold text-val-warn'
      : 'rounded border border-val-line/50 px-1.5 py-0.5 text-[11px] text-val-muted/70 hover:border-val-warn/40 hover:text-val-warn';
  };

  return (
    <article
      className={`rounded-xl border bg-val-panel/80 p-3 shadow-sm transition-colors ${
        overlay ? 'border-val-red/60 shadow-xl' : 'border-val-line hover:border-val-red/40'
      }`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5">
        <div className="flex min-w-[1.25rem] items-center justify-center self-center">
          {queueNo ? (
            <span className="text-sm font-semibold leading-none text-val-muted">#{queueNo}</span>
          ) : null}
        </div>
        <h3
          ref={nameEllipsis.ref}
          className={`min-w-0 self-center whitespace-nowrap text-lg font-semibold leading-none text-val-cream ${
            nameEllipsis.overflow ? 'overflow-hidden text-ellipsis' : 'overflow-hidden'
          }`}
          title={nameEllipsis.overflow ? player.name : undefined}
        >
          {player.name}
        </h3>

        <div className="row-span-2 flex flex-col items-end justify-start gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs leading-none text-val-muted">
            {showCurrent ? <span>현재 {formatRating(player.currentTier)}</span> : null}
            {showPeak ? <span>최고 {formatRating(player.maxTier)}</span> : null}
            <span
              className={`rounded-md border px-2 py-0.5 text-base font-semibold leading-none ${
                TIER_STYLES[(scrimTier ?? player.currentTier).tier]
              }`}
            >
              {scrimTier ? `내전 ${formatRating(scrimTier)}` : formatRating(player.currentTier)}
            </span>
          </div>
          <div className="flex min-h-[1.25rem] items-center justify-end gap-2">
            {hasRecord ? (
              <p className="text-sm leading-none text-val-muted">
                {formatRecord(player)}
                {streakLabel ? (
                  <span className={`ml-1 ${player.streak > 0 ? 'text-val-teal' : 'text-val-red'}`}>
                    {streakLabel}
                  </span>
                ) : null}
              </p>
            ) : (
              <span className="w-0" aria-hidden />
            )}
            {!overlay && showDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-sm text-val-muted hover:bg-white/5"
                    onPointerDown={stop}
                    onClick={() => setConfirmDelete(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-val-red px-2 py-1 text-sm font-medium text-white hover:bg-val-red/90"
                    onPointerDown={stop}
                    onClick={() => onDelete(player.id)}
                  >
                    삭제
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`${player.name} 삭제`}
                  className="rounded-md p-1 text-val-muted hover:bg-val-red/10 hover:text-val-red"
                  onPointerDown={stop}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={16} />
                </button>
              )
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-center">
          {!overlay ? (
            <button
              type="button"
              aria-label={`${player.name} 수정`}
              className="rounded-md p-1 text-val-muted hover:bg-white/5 hover:text-val-cream"
              onPointerDown={stop}
              onClick={() => onEdit(player)}
            >
              <Pencil size={18} />
            </button>
          ) : null}
        </div>
        <div className="min-w-0 self-center">
          {riotId ? (
            <p
              ref={riotEllipsis.ref}
              className={`whitespace-nowrap text-sm leading-none text-val-muted ${
                riotEllipsis.overflow ? 'overflow-hidden text-ellipsis' : 'overflow-hidden'
              }`}
              title={riotEllipsis.overflow ? riotId : undefined}
            >
              {riotId}
            </p>
          ) : null}
        </div>

        {!overlay ? (
          <>
            <div aria-hidden />
            <div className="col-span-2 flex flex-wrap items-center gap-1">
              <button
                type="button"
                aria-pressed={isMatch}
                title="이번 판 무조건 참가"
                className={chipBtn(isMatch, 'teal')}
                onPointerDown={stop}
                onClick={() => setLock(isMatch ? null : 'MATCH')}
              >
                고정
              </button>
              <button
                type="button"
                aria-pressed={isBench}
                title="대기열 유지 · 이번 판 제외"
                className={chipBtn(isBench, 'warn')}
                onPointerDown={stop}
                onClick={() => setLock(isBench ? null : 'BENCH')}
              >
                벤치
              </button>
            </div>
          </>
        ) : null}

        {(player.canOrder || teamLockLabel || restrictionLabels.length > 0 || rivals || allies) && (
          <>
            <div aria-hidden />
            <div className="col-span-2 flex flex-wrap gap-1">
              {player.canOrder && (
                <span className="inline-flex items-center gap-0.5 rounded border border-val-teal/35 bg-val-teal/10 px-1.5 py-0.5 text-[11px] font-medium text-val-teal">
                  <Megaphone size={11} />
                  오더
                </span>
              )}
              {teamLockLabel ? (
                <span
                  className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] font-medium ${teamLockTone}`}
                >
                  <Lock size={11} />
                  {teamLockLabel}
                </span>
              ) : null}
              {restrictionLabels.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="rounded border border-val-warn/35 bg-val-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-val-warn"
                >
                  {label}
                </span>
              ))}
              {rivals && (
                <span className="inline-flex items-center gap-0.5 rounded border border-val-red/35 bg-val-red/10 px-1.5 py-0.5 text-[11px] font-medium text-val-red">
                  <Swords size={11} />
                  {rivals}
                </span>
              )}
              {allies && (
                <span className="inline-flex items-center gap-0.5 rounded border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-300">
                  <Users size={11} />
                  {allies}
                </span>
              )}
            </div>
          </>
        )}

        <div className="col-span-3 flex justify-end">
          <span
            className="text-[11px] leading-none text-val-muted/80"
            title="최근 24시간 내전 참여 횟수"
          >
            참여 {playCount}회
          </span>
        </div>
      </div>
    </article>
  );
}
