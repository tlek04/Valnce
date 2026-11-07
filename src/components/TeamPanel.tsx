import { Trophy } from 'lucide-react';
import { Player } from '../types';
import { TIER_STYLES, formatRating } from '../constants/valorant';
import { useAppStore } from '../store/useAppStore';
import { teamAverageRating } from '../utils/rating';
import DroppableColumn from './DroppableColumn';
import SortablePlayerCard from './SortablePlayerCard';

interface TeamPanelProps {
  side: 'TEAM_1' | 'TEAM_2';
  onEdit: (player: Player) => void;
  onWin?: () => void;
  canWin?: boolean;
  groupedIds?: Set<string>;
  activeId?: string;
}

export default function TeamPanel({
  side,
  onEdit,
  onWin,
  canWin = false,
  groupedIds,
  activeId,
}: TeamPanelProps) {
  const team = useAppStore((state) => (side === 'TEAM_1' ? state.team1 : state.team2));
  const attackSide = useAppStore((state) => state.attackSide);
  const dismissPlayer = useAppStore((state) => state.dismissPlayer);
  const title = side === 'TEAM_1' ? '1팀' : '2팀';
  const winLabel = side === 'TEAM_1' ? '1팀 승' : '2팀 승';
  const accent = side === 'TEAM_1' ? 'text-[#38BDF8]' : 'text-val-red';
  const winStyle =
    side === 'TEAM_1' ? 'rgba(56, 189, 248, 0.68)' : 'rgba(255, 70, 85, 0.6)';
  const columnId = side === 'TEAM_1' ? 'team1' : 'team2';
  const emptyCount = Math.max(0, 5 - team.length);
  const average = teamAverageRating(team);
  const sideRole =
    attackSide == null ? null : attackSide === side ? '공격' : '수비';

  return (
    <DroppableColumn
      id={columnId}
      players={team}
      className="flex min-h-[12rem] flex-col rounded-2xl border border-val-line bg-val-panel/60 p-4 sm:p-5 md:min-h-[20rem] xl:min-h-[28rem]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={`whitespace-nowrap font-display text-2xl font-bold ${accent}`}>{title}</h2>
          {sideRole && (
            <span
              className={`rounded-md border px-2 py-0.5 text-sm font-semibold leading-none ${
                sideRole === '공격'
                  ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
                  : 'border-val-line bg-val-bg/80 text-val-muted'
              }`}
            >
              {sideRole}
            </span>
          )}
          {average ? (
            <span
              className={`rounded-md border px-2.5 py-1 text-base font-semibold leading-none ${
                TIER_STYLES[average.tier]
              }`}
            >
              평균 {formatRating(average)}
            </span>
          ) : (
            <span className="rounded-md border border-val-line px-2.5 py-1 text-base font-semibold leading-none text-val-muted">
              평균 -
            </span>
          )}
        </div>
        {onWin && (
          <button
            type="button"
            disabled={!canWin}
            onClick={onWin}
            style={{ backgroundColor: winStyle }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trophy size={17} />
            {winLabel}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {team.map((player) => (
          <SortablePlayerCard
            key={player.id}
            player={player}
            grouped={Boolean(activeId) && activeId !== player.id && groupedIds?.has(player.id)}
            onEdit={onEdit}
            onDelete={dismissPlayer}
          />
        ))}
        {Array.from({ length: emptyCount }, (_, index) => (
          <div
            key={`empty-${columnId}-${index}`}
            className="flex min-h-[3.75rem] items-center justify-center rounded-xl border border-dashed border-val-line text-base text-val-muted md:min-h-[4.75rem]"
          >
            빈 자리 {team.length + index + 1}
          </div>
        ))}
      </div>
    </DroppableColumn>
  );
}
