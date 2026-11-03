import { X } from 'lucide-react';

interface ChipListProps {
  items: { id: string; label: string }[];
  onRemove: (id: string) => void;
  tone?: 'orange' | 'rose' | 'sky';
}

const TONE = {
  orange: 'border-val-warn/30 bg-val-warn/10 text-val-warn',
  rose: 'border-val-red/30 bg-val-red/10 text-val-red',
  sky: 'border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]',
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
