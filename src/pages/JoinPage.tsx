import { FormEvent, useState } from 'react';
import { submitJoinApplication } from '../utils/joinApi';
import { loadJoinProfile, saveJoinProfile } from '../utils/joinProfile';

interface JoinPageProps {
  onBack: () => void;
}

export default function JoinPage({ onBack }: JoinPageProps) {
  const saved = loadJoinProfile();
  const [name, setName] = useState(saved.name);
  const [riotName, setRiotName] = useState(saved.riotName);
  const [riotTag, setRiotTag] = useState(saved.riotTag);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    queueNo: number;
    name: string;
    autoJoined: boolean;
  } | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const profile = {
      name: name.trim(),
      riotName: riotName.trim(),
      riotTag: riotTag.trim().replace(/^#+/, ''),
    };
    const result = await submitJoinApplication(profile);
    setBusy(false);
    if (!result.ok || !result.application) {
      const reason = result.error || '알 수 없는 오류입니다.';
      setError(reason);
      window.alert(`신청 실패\n${reason}`);
      return;
    }
    saveJoinProfile(profile);
    setDone({
      queueNo: result.application.queueNo,
      name: result.application.name,
      autoJoined: Boolean(result.autoJoined),
    });
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-val-line bg-val-panel/80 p-6 text-center shadow-xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-teal">
            {done.autoJoined ? '합류 완료' : '신청 완료'}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-val-cream">
            {done.autoJoined ? '대기열로 들어갑니다' : '접수되었습니다'}
          </h1>
          <p className="mt-3 text-sm text-val-muted">
            <span className="font-semibold text-val-cream">{done.name}</span>
            {' · '}
            순번 <span className="font-semibold text-val-teal">#{done.queueNo}</span>
          </p>
          <p className="mt-2 text-xs text-val-muted">
            {done.autoJoined
              ? '기존 시청자라 승인 없이 스트리머 대기열에 추가됩니다.'
              : '스트리머 승인 후 대기열에 들어갑니다.'}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-6 rounded-lg border border-val-line px-4 py-2.5 text-sm font-semibold text-val-cream hover:bg-white/5"
          >
            처음으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-val-line bg-val-panel/80 p-6 shadow-xl"
      >
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-teal">Viewer</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-val-cream">참가 신청</h1>
        <p className="mt-2 text-sm text-val-muted">치지직 닉과 발로란트 닉만 입력하면 됩니다.</p>

        <label htmlFor="join-name" className="mt-6 block text-xs font-semibold text-val-muted">
          치지직 닉네임
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="mt-1.5 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none focus:border-val-teal"
        />

        <label htmlFor="join-riot-name" className="mt-4 block text-xs font-semibold text-val-muted">
          발로란트 닉네임
        </label>
        <input
          id="join-riot-name"
          value={riotName}
          onChange={(event) => setRiotName(event.target.value)}
          required
          className="mt-1.5 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none focus:border-val-teal"
        />

        <label htmlFor="join-riot-tag" className="mt-4 block text-xs font-semibold text-val-muted">
          태그 (# 없이)
        </label>
        <input
          id="join-riot-tag"
          value={riotTag}
          onChange={(event) => setRiotTag(event.target.value.replace(/^#+/, ''))}
          required
          placeholder="KR1"
          className="mt-1.5 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none focus:border-val-teal"
        />

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-val-warn/40 bg-val-warn/10 px-3 py-2 text-sm text-val-warn">
            신청 실패: {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !name.trim() || !riotName.trim() || !riotTag.trim()}
            className="rounded-lg bg-val-teal/80 px-4 py-2.5 text-sm font-semibold text-val-bg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '신청 중…' : '신청하기'}
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
