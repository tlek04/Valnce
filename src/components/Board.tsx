import { useEffect, useMemo, useState } from 'react';
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
import { ColumnId, Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import { allyGroupOf, orderGroup } from '../utils/relations';
import { advantageSummary, balanceLabel } from '../utils/rating';
import PlayerCard from './PlayerCard';
import TeamPanel from './TeamPanel';
import WaitlistPanel from './WaitlistPanel';
import { parseSavedDragId } from './SavedPlayerPanel';
import { toSessionPlayer } from '../utils/player';

interface BoardProps {
  onAdd: () => void;
  onEdit: (player: Player) => void;
  onNotice?: (message: string) => void;
  onMatchSync?: (options?: { force?: boolean; soft?: boolean }) => void;
  matchSyncing?: boolean;
}

function isColumnId(id: string): id is ColumnId {
  return id === 'waitlist' || id === 'team1' || id === 'team2';
}

const detectCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

export default function Board({ onAdd, onEdit, onNotice, onMatchSync, matchSyncing = false }: BoardProps) {
  const waitlist = useAppStore((state) => state.waitlist);
  const team1 = useAppStore((state) => state.team1);
  const team2 = useAppStore((state) => state.team2);
  const players = useAppStore((state) => state.players);
  const balanceNote = useAppStore((state) => state.balanceNote);
  const balanceDetails = useAppStore((state) => state.balanceDetails);
  const movePlayer = useAppStore((state) => state.movePlayer);
  const enlistPlayer = useAppStore((state) => state.enlistPlayer);
  const recordTeamResult = useAppStore((state) => state.recordTeamResult);
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (balanceDetails.length === 0) setDetailsOpen(false);
  }, [balanceDetails]);

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
  const canShowAdvantage = team1.length > 0 && team2.length > 0;
  const advantage = canShowAdvantage ? advantageSummary(team1, team2) : null;

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
          {(advantage || balanceNote) && (
            <div className="space-y-1.5 rounded-xl border border-val-line bg-val-panel/60 px-4 py-2 text-sm">
              {advantage && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-val-muted">티어 차이</span>
                  <span
                    className={`font-display text-lg font-bold ${
                      advantage.side === 'team1'
                        ? 'text-sky-300'
                        : advantage.side === 'team2'
                          ? 'text-rose-300'
                          : 'text-val-cream'
                    }`}
                  >
                    {advantage.text}
                    {advantage.amount > 0 ? (
                      <span className="ml-2 text-sm font-medium text-val-muted">
                        {balanceLabel(advantage.amount)}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {balanceNote && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs leading-relaxed text-val-muted">나눈 기준: {balanceNote}</p>
                    {balanceDetails.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDetailsOpen((open) => !open)}
                        className="shrink-0 text-xs font-semibold text-sky-300 hover:underline"
                      >
                        {detailsOpen ? '접기' : '자세히'}
                      </button>
                    )}
                  </div>
                  {detailsOpen && balanceDetails.length > 0 && (
                    <ul className="space-y-1 rounded-lg border border-val-line bg-val-bg/70 px-3 py-2 text-xs leading-relaxed text-val-cream/90">
                      {balanceDetails.map((line) => (
                        <li key={line}>· {line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-val-muted">
              경기 결과 · 최종 전적은 커스텀 매치 동기화 기준으로 맞춰집니다
            </span>
            <button
              type="button"
              disabled={matchSyncing}
              onClick={() => onMatchSync?.({ force: true })}
              className="rounded-lg border border-val-line bg-val-bg px-3 py-1.5 text-xs font-semibold text-val-cream hover:border-val-red/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {matchSyncing ? '동기화 중' : '커스텀 동기화'}
            </button>
            <button
              type="button"
              disabled={team1.length === 0 || team2.length === 0}
              onClick={() => {
                const result = recordTeamResult('TEAM_1');
                onNotice?.(result.message);
                onMatchSync?.({ force: true, soft: true });
              }}
              className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              1팀 승
            </button>
            <button
              type="button"
              disabled={team1.length === 0 || team2.length === 0}
              onClick={() => {
                const result = recordTeamResult('TEAM_2');
                onNotice?.(result.message);
                onMatchSync?.({ force: true, soft: true });
              }}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
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
              <p className="mt-1 rounded-md bg-sky-500 px-2 py-1 text-center text-xs font-semibold text-white">
                {allyNames} 함께 이동
              </p>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
