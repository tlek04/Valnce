import { FormEvent, useState } from 'react';
import {
  getAuthRole,
  getStreamerToken,
  setAuthSession,
  verifyStreamerPassword,
} from '../utils/streamerAuth';

interface AdminUnlockOverlayProps {
  onClose: () => void;
  onAdminEnter: () => void;
}

export default function AdminUnlockOverlay({ onClose, onAdminEnter }: AdminUnlockOverlayProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim() || busy) return;

    const prevToken = getStreamerToken();
    const prevRole = getAuthRole();

    setBusy(true);
    setError(null);
    const result = await verifyStreamerPassword(password);
    setBusy(false);

    if (!result.ok || result.role !== 'admin') {
      if (prevToken && prevRole) {
        setAuthSession(prevToken, prevRole);
      }
      setError(
        result.role && result.role !== 'admin'
          ? '관리자 비밀번호가 아닙니다.'
          : result.error || '관리자 비밀번호가 아닙니다.'
      );
      return;
    }

    onAdminEnter();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <button type="button" aria-label="닫기" className="absolute inset-0" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-val-line bg-val-panel p-5 shadow-2xl"
      >
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-red">Admin</p>
        <h2 className="mt-1 font-display text-xl font-bold text-val-cream">관리자 입장</h2>
        <label htmlFor="admin-unlock-password" className="mt-4 block text-xs font-semibold text-val-muted">
          관리자 비밀번호
        </label>
        <input
          id="admin-unlock-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none focus:border-val-red"
        />
        {error && <p className="mt-2 text-sm text-val-warn">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !password.trim()}
            className="rounded-lg bg-val-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-val-red/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '확인 중…' : '입장'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-val-line px-4 py-2.5 text-sm font-semibold text-val-muted hover:text-val-cream"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
