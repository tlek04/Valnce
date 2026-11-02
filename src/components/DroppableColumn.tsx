import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ReactNode } from 'react';
import { Player } from '../types';

interface DroppableColumnProps {
  id: string;
  players: Player[];
  className?: string;
  children: ReactNode;
}

export default function DroppableColumn({ id, players, className, children }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={`${className ?? ''} ${isOver ? 'ring-2 ring-val-red/40' : ''}`}
    >
      <SortableContext items={players.map((player) => player.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </section>
  );
}
