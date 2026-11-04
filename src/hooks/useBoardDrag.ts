import { useMemo, useState } from 'react';
import {
  CollisionDetection,
  DragEndEvent,
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
import { parseSavedDragId } from '../utils/dragIds';
import { toSessionPlayer } from '../utils/player';

function isColumnId(id: string): id is ColumnId {
  return id === 'waitlist' || id === 'team1' || id === 'team2';
}

const detectCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

export function useBoardDrag(onNotice?: (message: string) => void) {
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
  return {
    team1, team2,
    balanceNote, balanceDetails,
    recordTeamResult, activePlayer,
    setActivePlayer, sensors,
    detectCollision, handleDragStart,
    handleDragEnd, groupedIds,
    allyNames
  };
}
