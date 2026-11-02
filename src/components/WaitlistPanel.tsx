import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import DroppableColumn from './DroppableColumn';
import SavedPlayerPanel from './SavedPlayerPanel';
import SortablePlayerCard from './SortablePlayerCard';

interface WaitlistPanelProps {
  onAdd: () => void;
  onEdit: (player: Player) => void;
  onNotice?: (message: string) => void;
  groupedIds?: Set<string>;
  activeId?: string;
}

export default function WaitlistPanel({
  onAdd,
  onEdit,
  onNotice,
  groupedIds,
  activeId,
}: WaitlistPanelProps) {
  const waitlist = useAppStore((state) => state.waitlist);
  const savedCount = useAppStore((state) => state.players.length);
  const dismissPlayer = useAppStore((state) => state.dismissPlayer);
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <DroppableColumn
      id="waitlist"
      players={waitlist}
      className="flex min-h-[12rem] flex-col rounded-2xl border border-val-line bg-val-panel/60 p-4 md:min-h-[20rem] xl:min-h-[28rem]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users size={18} className="shrink-0 text-val-red" />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold tracking-wide">대기열</h2>
            <p className="text-xs text-val-muted">{waitlist.length}명 대기 중</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-val-red px-3 py-2 text-sm font-semibold text-white hover:bg-val-red/90"
          >
            <UserPlus size={16} />
            추가
          </button>
          <button
            type="button"
            onClick={() => setLibraryOpen((open) => !open)}
            aria-pressed={libraryOpen}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold ${
              libraryOpen
                ? 'border-val-red/60 bg-val-red/15 text-val-cream'
                : 'border-val-line text-val-cream hover:bg-white/5'
            }`}
          >
            기존 플레이어
          </button>
        </div>
      </div>

      {libraryOpen && <SavedPlayerPanel onClose={() => setLibraryOpen(false)} onNotice={onNotice} />}

      {waitlist.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-val-line px-4 py-8 text-center">
          <p className="text-sm font-medium text-val-cream">대기열이 비어 있습니다</p>
          <p className="mt-1 text-xs text-val-muted">
            {savedCount > 0
              ? '새로 등록하거나 기존 플레이어를 대기열에 넣으세요.'
              : '플레이어를 등록하거나 팀에서 여기로 드래그하세요.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onAdd} className="text-sm font-semibold text-val-red hover:underline">
              플레이어 등록
            </button>
            {savedCount > 0 && (
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="text-sm font-semibold text-sky-300 hover:underline"
              >
                기존 플레이어 추가
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {waitlist.map((player) => (
            <SortablePlayerCard
              key={player.id}
              player={player}
              grouped={Boolean(activeId) && activeId !== player.id && groupedIds?.has(player.id)}
              onEdit={onEdit}
              onDelete={dismissPlayer}
            />
          ))}
        </div>
      )}
    </DroppableColumn>
  );
}
