import { FormEvent, useState } from 'react';
import { verifyStreamerPassword } from '../utils/streamerAuth';

interface StreamerGateProps {
  onSuccess: () => void;
  onBack: () => void;
}

export default function StreamerGate({ onSuccess, onBack }: StreamerGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await verifyStreamerPassword(password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || '비밀번호가 올바르지 않습니다.');
      return;
    }
    onSuccess();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-val-line bg-val-panel/80 p-6 shadow-xl"
      >
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-red">Streamer</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-val-cream">스트리머 입장</h1>
        <p className="mt-2 text-sm text-val-muted">매니저 화면으로 가려면 비밀번호를 입력하세요.</p>

        <label htmlFor="streamer-password" className="mt-6 block text-xs font-semibold text-val-muted">
          비밀번호
        </label>
        <input
          id="streamer-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none focus:border-val-red"
        />
        {error && <p className="mt-2 text-sm text-val-warn">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !password.trim()}
            className="rounded-lg bg-val-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-val-red/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '확인 중…' : '입장'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-val-line px-4 py-2.5 text-sm font-semibold text-val-muted hover:text-val-cream"
          >
            뒤로
          </button>
        </div>
      </form>
    </div>
  );
}
