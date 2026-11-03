import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { Player } from '../types';
import PlayerCard from './PlayerCard';

interface SortablePlayerCardProps {
  player: Player;
  grouped?: boolean;
  onEdit: (player: Player) => void;
  onDelete: (id: string) => void;
}

export default function SortablePlayerCard({
  player,
  grouped = false,
  onEdit,
  onDelete,
}: SortablePlayerCardProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className={`cursor-grab touch-none active:cursor-grabbing ${grouped ? 'rounded-xl ring-2 ring-[#38BDF8]/70' : ''}`}
      aria-label={`${player.name} 드래그하여 이동`}
      {...listeners}
    >
      <PlayerCard player={player} onEdit={onEdit} onDelete={onDelete} draggable />
    </div>
  );
}
