import { useState } from 'react';
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

export default function PlayerCard({
  player,
  onEdit,
  onDelete,
  showDelete = false,
  overlay = false,
}: PlayerCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inWaitlist = useAppStore((state) => state.waitlist.some((item) => item.id === player.id));
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
  const lockLabel =
    player.lockedTeam === 'TEAM_1' ? '1팀 고정' : player.lockedTeam === 'TEAM_2' ? '2팀 고정' : null;
  const lockTone =
    player.lockedTeam === 'TEAM_1'
      ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
      : 'border-val-red/30 bg-val-red/10 text-val-red';
  const streakLabel = formatStreak(player.streak);
  const hasRecord = player.wins > 0 || player.losses > 0 || player.streak !== 0;
  const riotId = formatRiotId(player.riotName, player.riotTag);
  const queueNo = player.queueNo;

  return (
    <article
      className={`rounded-xl border bg-val-panel/80 p-3 shadow-sm transition-colors ${
        overlay ? 'border-val-red/60 shadow-xl' : 'border-val-line hover:border-val-red/40'
      }`}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5">
        <div className="flex items-center justify-center self-center">
          {queueNo ? (
            <span className="text-sm font-semibold leading-none text-val-muted">#{queueNo}</span>
          ) : null}
        </div>
        <h3 className="min-w-0 self-center truncate text-lg font-semibold leading-none text-val-cream">
          {player.name}
        </h3>
        <span
          className={`justify-self-end self-center rounded-md border px-2 py-0.5 text-base font-semibold leading-none ${
            TIER_STYLES[(scrimTier ?? player.currentTier).tier]
          }`}
        >
          {scrimTier ? `내전 ${formatRating(scrimTier)}` : formatRating(player.currentTier)}
        </span>

        {/* 2행: 수정 | 게임닉·승패 | 현재·최고 — 최고는 항상 이 행 */}
        <div className="flex items-center justify-center">
          {!overlay ? (
            <button
              type="button"
              aria-label={`${player.name} 수정`}
              className="rounded-md p-1 text-val-muted hover:bg-white/5 hover:text-val-cream"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onEdit(player)}
            >
              <Pencil size={18} />
            </button>
          ) : null}
        </div>
        <div className="min-w-0 self-center space-y-1">
          {riotId ? (
            <p className="truncate text-sm leading-none text-val-muted">{riotId}</p>
          ) : null}
          {hasRecord ? (
            <p className="text-sm leading-none text-val-muted">
              {formatRecord(player)}
              {streakLabel ? (
                <span className={`ml-1 ${player.streak > 0 ? 'text-val-teal' : 'text-val-red'}`}>
                  {streakLabel}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 justify-self-end self-center text-xs leading-none text-val-muted">
          {scrimTier && !inWaitlist ? (
            <span>현재 {formatRating(player.currentTier)}</span>
          ) : null}
          <span>최고 {formatRating(player.maxTier)}</span>
          {!overlay && showDelete ? (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-val-muted hover:bg-white/5"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setConfirmDelete(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="rounded-md bg-val-red px-2 py-1 text-sm font-medium text-white hover:bg-val-red/90"
                  onPointerDown={(event) => event.stopPropagation()}
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
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
              </button>
            )
          ) : null}
        </div>

        {(player.canOrder ||
          lockLabel ||
          restrictionLabels.length > 0 ||
          rivals ||
          allies) && (
          <>
            <div aria-hidden />
            <div className="col-span-2 flex flex-wrap gap-1">
              {player.canOrder && (
                <span className="inline-flex items-center gap-0.5 rounded border border-val-teal/35 bg-val-teal/10 px-1.5 py-0.5 text-[11px] font-medium text-val-teal">
                  <Megaphone size={11} />
                  오더
                </span>
              )}
              {lockLabel && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] font-medium ${lockTone}`}
                >
                  <Lock size={11} />
                  {lockLabel}
                </span>
              )}
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
      </div>
    </article>
  );
}
