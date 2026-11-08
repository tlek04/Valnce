import { useJoinApplications } from '../hooks/useJoinApplications';
import { useMemo, useState } from 'react';
import { Contact, UserMinus, UserPlus, Users } from 'lucide-react';
import { Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import DroppableColumn from './DroppableColumn';
import JoinApplicationCard from './JoinApplicationCard';
import SavedPlayerPanel from './SavedPlayerPanel';
import SortablePlayerCard from './SortablePlayerCard';

interface WaitlistPanelProps {
  onAdd: () => void;
  onEdit: (player: Player) => void;
  onNotice?: (message: string) => void;
  onUnauthorized?: () => void;
  groupedIds?: Set<string>;
  activeId?: string;
}

export default function WaitlistPanel({
  onAdd,
  onEdit,
  onNotice,
  onUnauthorized,
  groupedIds,
  activeId,
}: WaitlistPanelProps) {
  const waitlist = useAppStore((state) => state.waitlist);
  const team1 = useAppStore((state) => state.team1);
  const team2 = useAppStore((state) => state.team2);
  const savedCount = useAppStore((state) => state.players.length);
  const dismissPlayer = useAppStore((state) => state.dismissPlayer);
  const dismissAbsentPlayers = useAppStore((state) => state.dismissAbsentPlayers);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { applications, actingId, handleApprove, handleReject } = useJoinApplications(onNotice, onUnauthorized);

  const absentCount = useMemo(() => {
    const seats = [...waitlist, ...team1, ...team2];
    return seats.filter((player) => player.checkIn === null || player.checkIn === 'away').length;
  }, [waitlist, team1, team2]);

  const isEmpty = waitlist.length === 0 && applications.length === 0;

  return (
    <DroppableColumn
      id="waitlist"
      players={waitlist}
      className="flex min-h-[10rem] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-val-line bg-val-panel/60 p-3 sm:min-h-[12rem] sm:p-5 md:min-h-[20rem] xl:min-h-[28rem]"
    >
      <div className="mb-3 space-y-2 sm:mb-4 sm:space-y-2.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 sm:gap-x-2.5">
          <Users size={20} className="relative top-[0.15em] shrink-0 text-val-red" />
          <h2 className="font-display text-xl font-bold leading-none sm:text-2xl">대기열</h2>
          <p className="text-xs leading-none text-val-muted sm:text-sm">
            {waitlist.length}명 대기
            {applications.length > 0 ? ` · 신청 ${applications.length}명` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-val-red px-3 py-2 text-sm font-semibold text-white hover:bg-val-red/90 sm:flex-none sm:text-base"
          >
            <UserPlus size={16} />
            새로 추가
          </button>
          <button
            type="button"
            onClick={() => setLibraryOpen((open) => !open)}
            aria-pressed={libraryOpen}
            style={{
              backgroundColor: libraryOpen ? 'rgba(56, 189, 248, 0.8)' : 'rgba(56, 189, 248, 0.68)',
            }}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 sm:flex-none sm:text-base"
          >
            <Contact size={16} />
            기존 플레이어
          </button>
          <button
            type="button"
            aria-label="미응답·불참 정리"
            title="출석 미응답·불참을 보드에서 내보냅니다"
            disabled={absentCount === 0}
            onClick={() => {
              const result = dismissAbsentPlayers();
              onNotice?.(result.message);
            }}
            style={{ backgroundColor: 'rgba(251, 191, 36, 0.55)' }}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:text-base"
          >
            <UserMinus size={16} />
            미응답·불참 정리
            {absentCount > 0 ? ` (${absentCount})` : ''}
          </button>
        </div>
      </div>

      {libraryOpen && <SavedPlayerPanel onClose={() => setLibraryOpen(false)} onNotice={onNotice} />}

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-val-line px-4 py-8 text-center">
          <p className="text-base font-medium text-val-cream">대기열이 비어 있습니다</p>
          <p className="mt-1 text-sm text-val-muted">
            {savedCount > 0
              ? '새로 추가하거나 기존 플레이어를 대기열에 넣으세요.'
              : '새로 추가하거나 팀에서 여기로 드래그하세요.'}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {applications.map((application) => (
            <JoinApplicationCard
              key={application.id}
              application={application}
              busy={actingId === application.id}
              onApprove={(item) => void handleApprove(item)}
              onReject={(item) => void handleReject(item)}
            />
          ))}
          {waitlist.map((player) => (
            <SortablePlayerCard
              key={player.id}
              player={player}
              showDelete
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
