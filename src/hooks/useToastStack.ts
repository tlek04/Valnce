import { useCallback, useEffect, useState } from 'react';
import { ToastItem } from '../components/ToastNotice';

const TOAST_TTL_MS = 3200;

export function useToastStack() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showNotice = useCallback((text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((prev) => [...prev, { id, text }].slice(-4));
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const oldest = items[0];
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== oldest.id));
    }, TOAST_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [items]);

  return { items, showNotice };
}
