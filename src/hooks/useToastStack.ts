import { useCallback, useEffect, useState } from 'react';
import { ToastItem } from '../components/ToastNotice';

const TOAST_TTL_MS = 3200;

export function useToastStack() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showNotice = useCallback((text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    // 확인용 알림은 하나만 유지 — 새 알림이 이전 알림을 대체한다.
    setItems([{ id, text }]);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const current = items[0];
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== current.id));
    }, TOAST_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [items]);

  return { items, showNotice };
}
