export interface ToastItem {
  id: number;
  text: string;
}

interface ToastNoticeProps {
  items: ToastItem[];
}

/** 레이아웃을 밀지 않는 고정 오버레이 알림 (한 번에 하나만) */
export default function ToastNotice({ items }: ToastNoticeProps) {
  const item = items[0];
  if (!item) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <p
        key={item.id}
        role="status"
        className="pointer-events-auto max-w-lg rounded-lg border border-val-line bg-val-panel/95 px-4 py-2.5 text-sm text-val-cream shadow-xl backdrop-blur"
      >
        {item.text}
      </p>
    </div>
  );
}
