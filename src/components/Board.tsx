import { useEffect, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { Player } from '../types';
import { useBoardDrag } from '../hooks/useBoardDrag';
import { advantageSummary, balanceLabel } from '../utils/rating';
import PlayerCard from './PlayerCard';
import TeamPanel from './TeamPanel';
import WaitlistPanel from './WaitlistPanel';

interface BoardProps {
  onAdd: () => void;
  onEdit: (player: Player) => void;
  onNotice?: (message: string) => void;
  onUnauthorized?: () => void;
}

export default function Board({ onAdd, onEdit, onNotice, onUnauthorized }: BoardProps) {
  const {
    team1,
    team2,
    balanceDetails,
    recordTeamResult,
    activePlayer,
    setActivePlayer,
    sensors,
    detectCollision,
    handleDragStart,
    handleDragEnd,
    groupedIds,
    allyNames,
  } = useBoardDrag(onNotice);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (balanceDetails.length === 0) setDetailsOpen(false);
  }, [balanceDetails]);

  const advantage =
    team1.length > 0 && team2.length > 0 ? advantageSummary(team1, team2) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detectCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActivePlayer(null)}
    >
      <main className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 xl:grid-cols-[minmax(18rem,22rem)_1fr]">
        <WaitlistPanel
          onAdd={onAdd}
          onEdit={onEdit}
          onNotice={onNotice}
          onUnauthorized={onUnauthorized}
          groupedIds={groupedIds}
          activeId={activePlayer?.id}
        />
        <div id="match-board" className="min-w-0 space-y-3">
          {advantage && (
            <div className="space-y-1.5 rounded-xl border border-val-line bg-val-panel/60 px-4 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-val-muted">티어 차이</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-display text-lg font-bold ${
                      advantage.side === 'team1'
                        ? 'text-[#38BDF8]'
                        : advantage.side === 'team2'
                          ? 'text-val-red'
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
                  {balanceDetails.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDetailsOpen((open) => !open)}
                      className="shrink-0 text-xs font-semibold text-val-teal hover:underline"
                    >
                      {detailsOpen ? '접기' : '자세히'}
                    </button>
                  )}
                </div>
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
          <div className="grid gap-4 md:grid-cols-2">
            <TeamPanel
              side="TEAM_1"
              onEdit={onEdit}
              canWin={team1.length > 0 && team2.length > 0}
              onWin={() => {
                recordTeamResult('TEAM_1');
              }}
              groupedIds={groupedIds}
              activeId={activePlayer?.id}
            />
            <TeamPanel
              side="TEAM_2"
              onEdit={onEdit}
              canWin={team1.length > 0 && team2.length > 0}
              onWin={() => {
                recordTeamResult('TEAM_2');
              }}
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
