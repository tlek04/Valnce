import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useDndContext, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Search, Trash2, UserPlus, X } from 'lucide-react';
import { SavedPlayer } from '../types';
import { TIER_STYLES, formatRating } from '../constants/valorant';
import { formatRecord, formatRiotId, formatStreak } from '../utils/matchStats';
import { useAppStore } from '../store/useAppStore';

import { savedDragId, parseSavedDragId } from '../utils/dragIds';

interface SavedPlayerPanelProps {
  onClose: () => void;
  onNotice?: (message: string) => void;
}

export default function SavedPlayerPanel({ onClose, onNotice }: SavedPlayerPanelProps) {
  const players = useAppStore((state) => state.players);
  const waitlist = useAppStore((state) => state.waitlist);
  const team1 = useAppStore((state) => state.team1);
  const team2 = useAppStore((state) => state.team2);
  const enlistPlayer = useAppStore((state) => state.enlistPlayer);
  const removePlayer = useAppStore((state) => state.removePlayer);
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const { active } = useDndContext();
  const draggingSaved = Boolean(active && parseSavedDragId(String(active.id)));

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      previous?.focus();
    };
  }, []);

  const busyIds = useMemo(
    () => new Set([...waitlist, ...team1, ...team2].map((player) => player.id)),
    [waitlist, team1, team2]
  );

  const available = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players
      .filter((player) => !busyIds.has(player.id))
      .filter((player) => {
        if (!needle) return true;
        const riot = formatRiotId(player.riotName, player.riotTag).toLowerCase();
        return player.name.toLowerCase().includes(needle) || riot.includes(needle);
      });
  }, [players, busyIds, query]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((item) => item.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 ${
        draggingSaved ? 'pointer-events-none' : 'bg-black/70'
      }`}
    >
      {!draggingSaved && <button type="button" aria-label="모달 닫기" className="absolute inset-0" onClick={onClose} />}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-player-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className={`relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-val-line bg-val-panel p-5 shadow-2xl sm:rounded-2xl ${
          draggingSaved ? 'opacity-0' : ''
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-red">Roster</p>
            <h2 id="saved-player-title" className="mt-1 font-display text-2xl font-bold text-val-cream">
              기존 플레이어
            </h2>
            <p className="mt-1 text-xs text-val-muted">
              {players.length}명 · 닉네임·태그·티어·전적을 보관합니다
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            className="rounded-md p-1.5 text-val-muted hover:bg-white/5 hover:text-val-cream"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <label htmlFor="saved-player-search" className="sr-only">
          기존 플레이어 검색
        </label>
        <div className="mb-3 flex items-center rounded-lg border border-val-line bg-val-bg px-2">
          <Search size={14} className="shrink-0 text-val-muted" />
          <input
            id="saved-player-search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="닉네임 검색"
            className="w-full bg-transparent px-2 py-2.5 text-sm text-val-cream outline-none placeholder:text-val-muted/60"
          />
        </div>

        {available.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-val-muted">
            {players.length === 0
              ? '기존 플레이어가 없습니다. 새로 추가하세요.'
              : query.trim()
                ? '검색 결과가 없습니다.'
                : '대기열·팀에 없는 기존 플레이어가 없습니다.'}
          </p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
            {available.map((player) => (
              <SavedPlayerRow
                key={player.id}
                player={player}
                onEnlist={() => {
                  const result = enlistPlayer(player.id, 'waitlist');
                  if (result.message) onNotice?.(result.message);
                }}
                onDelete={() => {
                  if (window.confirm(`${player.name}을(를) 기존 플레이어에서 삭제할까요?`)) {
                    removePlayer(player.id);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SavedPlayerRow({
  player,
  onEnlist,
  onDelete,
}: {
  player: SavedPlayer;
  onEnlist: () => void;
  onDelete: () => void;
}) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: savedDragId(player.id),
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`flex cursor-grab items-center gap-2 rounded-lg border border-val-line bg-val-bg px-2 py-1.5 touch-none active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
      aria-label={`${player.name} 드래그하여 대기열에 추가`}
      {...listeners}
    >
      <span aria-hidden className="shrink-0 rounded p-1 text-val-muted">
        <GripVertical size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-val-cream">{player.name}</span>
        <span className="mt-0.5 block truncate text-[10px] text-val-muted">
          {formatRiotId(player.riotName, player.riotTag) || '태그 없음'}
          {(player.wins > 0 || player.losses > 0) && (
            <>
              {' · '}
              {formatRecord(player)}
              {formatStreak(player.streak) ? ` · ${formatStreak(player.streak)}` : ''}
            </>
          )}
        </span>
      </div>
      <span
        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_STYLES[player.currentTier.tier]}`}
      >
        {formatRating(player.currentTier)}
      </span>
      <button
        type="button"
        aria-label={`${player.name} 대기열에 추가`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onEnlist}
        className="shrink-0 rounded p-1 text-val-muted hover:bg-white/5 hover:text-val-cream"
      >
        <UserPlus size={14} />
      </button>
      <button
        type="button"
        aria-label={`${player.name} 기존에서 삭제`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onDelete}
        className="shrink-0 rounded p-1 text-val-muted hover:bg-val-red/10 hover:text-val-red"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}
