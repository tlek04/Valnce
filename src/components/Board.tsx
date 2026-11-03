import { useMemo, useState } from 'react';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Trophy } from 'lucide-react';
import { ColumnId, Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import { allyGroupOf, orderGroup } from '../utils/relations';
import PlayerCard from './PlayerCard';
import TeamPanel from './TeamPanel';
import WaitlistPanel from './WaitlistPanel';
import { parseSavedDragId } from './SavedPlayerPanel';
import { toSessionPlayer } from '../utils/player';

interface BoardProps {
  onAdd: () => void;
  onEdit: (player: Player) => void;
  onNotice?: (message: string) => void;
}

function isColumnId(id: string): id is ColumnId {
  return id === 'waitlist' || id === 'team1' || id === 'team2';
}

const detectCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

export default function Board({ onAdd, onEdit, onNotice }: BoardProps) {
  const waitlist = useAppStore((state) => state.waitlist);
  const team1 = useAppStore((state) => state.team1);
  const team2 = useAppStore((state) => state.team2);
  const players = useAppStore((state) => state.players);
  const movePlayer = useAppStore((state) => state.movePlayer);
  const enlistPlayer = useAppStore((state) => state.enlistPlayer);
  const recordTeamResult = useAppStore((state) => state.recordTeamResult);
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns = useMemo(
    () => ({
      waitlist,
      team1,
      team2,
    }),
    [waitlist, team1, team2]
  );

  const findContainer = (id: string): ColumnId | null => {
    if (parseSavedDragId(id)) return null;
    if (isColumnId(id)) return id;
    if (waitlist.some((player) => player.id === id)) return 'waitlist';
    if (team1.some((player) => player.id === id)) return 'team1';
    if (team2.some((player) => player.id === id)) return 'team2';
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const rawId = String(event.active.id);
    const savedId = parseSavedDragId(rawId);
    const id = savedId ?? rawId;
    const onBoard = [...waitlist, ...team1, ...team2].find((item) => item.id === id);
    const saved = players.find((item) => item.id === id);
    setActivePlayer(onBoard ?? (saved ? toSessionPlayer(saved) : null));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePlayer(null);
    if (!over) return;

    const rawId = String(active.id);
    const savedId = parseSavedDragId(rawId);
    const overId = String(over.id);
    const to = parseSavedDragId(overId) ? 'waitlist' : findContainer(overId);
    if (!to) return;

    const target = columns[to];
    const index = isColumnId(overId) || parseSavedDragId(overId) ? target.length : target.findIndex((player) => player.id === overId);
    const result = savedId
      ? enlistPlayer(savedId, to, index < 0 ? target.length : index)
      : movePlayer(rawId, to, index < 0 ? target.length : index);
    if (result.message) onNotice?.(result.message);
  };

  const roster = useMemo(() => [...waitlist, ...team1, ...team2], [waitlist, team1, team2]);
  const activeGroup = activePlayer
    ? orderGroup(allyGroupOf(roster, activePlayer.id), activePlayer.id)
    : [];
  const groupedIds = useMemo(() => new Set(activeGroup.map((player) => player.id)), [activeGroup]);
  const allyNames = activeGroup
    .filter((player) => player.id !== activePlayer?.id)
    .map((player) => player.name)
    .join(', ');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detectCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActivePlayer(null)}
    >
      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 xl:grid-cols-[320px_1fr]">
        <WaitlistPanel
          onAdd={onAdd}
          onEdit={onEdit}
          onNotice={onNotice}
          groupedIds={groupedIds}
          activeId={activePlayer?.id}
        />
        <div id="match-board" className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={team1.length === 0 || team2.length === 0}
              onClick={() => {
                const result = recordTeamResult('TEAM_1');
                onNotice?.(result.message);
              }}
              style={{ backgroundColor: 'rgba(56, 189, 248, 0.68)' }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trophy size={15} />
              1팀 승
            </button>
            <button
              type="button"
              disabled={team1.length === 0 || team2.length === 0}
              onClick={() => {
                const result = recordTeamResult('TEAM_2');
                onNotice?.(result.message);
              }}
              style={{ backgroundColor: 'rgba(255, 70, 85, 0.6)' }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trophy size={15} />
              2팀 승
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TeamPanel
              side="TEAM_1"
              onEdit={onEdit}
              groupedIds={groupedIds}
              activeId={activePlayer?.id}
            />
            <TeamPanel
              side="TEAM_2"
              onEdit={onEdit}
              groupedIds={groupedIds}
              activeId={activePlayer?.id}
            />
          </div>
        </div>
      </main>
      <DragOverlay>
        {activePlayer ? (
          <div className="z-[60] w-[min(100%,20rem)]">
            <PlayerCard player={activePlayer} onEdit={() => undefined} onDelete={() => undefined} overlay />
            {allyNames ? (
              <p className="mt-1 rounded-md bg-[#38BDF8] px-2 py-1 text-center text-xs font-semibold text-[#0F1923]">
                {allyNames} 함께 이동
              </p>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
