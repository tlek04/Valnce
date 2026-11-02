import { X } from 'lucide-react';

interface ChipListProps {
  items: { id: string; label: string }[];
  onRemove: (id: string) => void;
  tone?: 'orange' | 'rose' | 'sky';
}

const TONE = {
  orange: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  rose: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  sky: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
};

export default function ChipList({ items, onRemove, tone = 'orange' }: ChipListProps) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.id}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${TONE[tone]}`}
        >
          {item.label}
          <button
            type="button"
            aria-label={`${item.label} 삭제`}
            className="rounded p-0.5 hover:bg-white/10"
            onClick={() => onRemove(item.id)}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
