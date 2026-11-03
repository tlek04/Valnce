import { Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import { teamAverageLabel } from '../utils/rating';
import DroppableColumn from './DroppableColumn';
import SortablePlayerCard from './SortablePlayerCard';

interface TeamPanelProps {
  side: 'TEAM_1' | 'TEAM_2';
  onEdit: (player: Player) => void;
  groupedIds?: Set<string>;
  activeId?: string;
}

export default function TeamPanel({ side, onEdit, groupedIds, activeId }: TeamPanelProps) {
  const team = useAppStore((state) => (side === 'TEAM_1' ? state.team1 : state.team2));
  const dismissPlayer = useAppStore((state) => state.dismissPlayer);
  const title = side === 'TEAM_1' ? '1팀' : '2팀';
  const accent = side === 'TEAM_1' ? 'text-[#38BDF8]' : 'text-val-red';
  const columnId = side === 'TEAM_1' ? 'team1' : 'team2';
  const emptyCount = Math.max(0, 5 - team.length);
  const average = teamAverageLabel(team);

  return (
    <DroppableColumn
      id={columnId}
      players={team}
      className="flex min-h-[12rem] flex-col rounded-2xl border border-val-line bg-val-panel/60 p-4 md:min-h-[20rem] xl:min-h-[28rem]"
    >
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`font-display text-xl font-bold tracking-wide ${accent}`}>{title}</h2>
          <p className="text-xs text-val-muted">평균 {average}</p>
        </div>
        <span className="shrink-0 text-xs text-val-muted">{team.length} / 5</span>
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
            className="flex min-h-[3.25rem] items-center justify-center rounded-xl border border-dashed border-val-line text-sm text-val-muted md:min-h-[4.25rem]"
          >
            빈 자리 {team.length + index + 1}
          </div>
        ))}
      </div>
    </DroppableColumn>
  );
}
