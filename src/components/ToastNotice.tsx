interface ToastNoticeProps {
  text: string;
}

/** 레이아웃을 밀지 않는 고정 오버레이 알림 */
export default function ToastNotice({ text }: ToastNoticeProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4"
      aria-live="polite"
    >
      <p
        role="status"
        className="pointer-events-auto max-w-lg rounded-lg border border-val-line bg-val-panel/95 px-4 py-2.5 text-sm text-val-cream shadow-xl backdrop-blur"
      >
        {text}
      </p>
    </div>
  );
}
