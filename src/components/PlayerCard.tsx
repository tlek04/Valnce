import { useState } from 'react';
import { GripVertical, Lock, Pencil, Swords, Trash2, Users } from 'lucide-react';
import { Player } from '../types';
import { TIER_STYLES, formatRating, getRestrictionLabel, sameRating } from '../constants/valorant';
import { useAppStore } from '../store/useAppStore';
import { playerScrimTier } from '../utils/rating';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
  draggable?: boolean;
  overlay?: boolean;
}

export default function PlayerCard({
  player,
  onEdit,
  onDelete,
  draggable = false,
  overlay = false,
}: PlayerCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const showPeak = !sameRating(player.maxTier, player.currentTier);
  const lockLabel =
    player.lockedTeam === 'TEAM_1' ? '1팀 고정' : player.lockedTeam === 'TEAM_2' ? '2팀 고정' : null;

  return (
    <article
      className={`rounded-xl border bg-val-panel/80 p-3 shadow-sm transition-colors ${
        overlay ? 'border-val-red/60 shadow-xl' : 'border-val-line hover:border-val-red/40'
      }`}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <span aria-hidden className="mt-0.5 shrink-0 rounded p-1 text-val-muted">
            <GripVertical size={16} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 break-words font-semibold text-val-cream">{player.name}</h3>
            <span
              className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${
                TIER_STYLES[(scrimTier ?? player.currentTier).tier]
              }`}
            >
              {scrimTier ? `내전 ${formatRating(scrimTier)}` : formatRating(player.currentTier)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {scrimTier && (
              <span className="text-xs text-val-muted">현재 {formatRating(player.currentTier)}</span>
            )}
            {showPeak && (
              <span className="text-xs text-val-muted">최고 {formatRating(player.maxTier)}</span>
            )}
            {lockLabel && (
              <span className="inline-flex items-center gap-1 rounded-md border border-val-red/30 bg-val-red/10 px-2 py-0.5 text-xs text-val-red">
                <Lock size={11} />
                {lockLabel}
              </span>
            )}
          </div>
          {(restrictionLabels.length > 0 || rivals || allies) && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {restrictionLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="text-orange-300/90">
                  {label}
                </span>
              ))}
              {rivals && (
                <span className="inline-flex items-center gap-1 text-rose-300">
                  <Swords size={11} />
                  {rivals}
                </span>
              )}
              {allies && (
                <span className="inline-flex items-center gap-1 text-sky-300">
                  <Users size={11} />
                  {allies}
                </span>
              )}
            </div>
          )}
        </div>

        {!overlay &&
          (confirmDelete ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-val-muted hover:bg-white/5"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setConfirmDelete(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-md bg-val-red px-2 py-1 text-xs font-medium text-white hover:bg-val-red/90"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onDelete(player.id)}
              >
                삭제
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`${player.name} 수정`}
                className="rounded-md p-1.5 text-val-muted hover:bg-white/5 hover:text-val-cream"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onEdit(player)}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                aria-label={`${player.name} 삭제`}
                className="rounded-md p-1.5 text-val-muted hover:bg-val-red/10 hover:text-val-red"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
      </div>
    </article>
  );
}
