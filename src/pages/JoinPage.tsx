import { FormEvent, useEffect, useState } from 'react';
import { fetchJoinStatus, JoinStatus, submitJoinApplication } from '../utils/joinApi';
import {
  clearJoinSession,
  loadJoinProfile,
  loadJoinSession,
  saveJoinProfile,
  saveJoinSession,
} from '../utils/joinProfile';
import { fetchSiteSettings } from '../utils/siteSettings';
import { formatRiotId, hasCompleteRiotId, parseRiotId } from '../utils/matchStats';

interface JoinPageProps {
  onBack: () => void;
}

type DoneState = {
  id: string;
  queueNo: number;
  name: string;
  autoJoined: boolean;
  status: JoinStatus;
};

export default function JoinPage({ onBack }: JoinPageProps) {
  const saved = loadJoinProfile();
  const [name, setName] = useState(saved.name);
  const [riotId, setRiotId] = useState(formatRiotId(saved.riotName, saved.riotTag));
  const [canOrder, setCanOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DoneState | null>(() => loadJoinSession());
  const [joinOpen, setJoinOpen] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(() => Boolean(loadJoinSession()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = await fetchSiteSettings();
      if (!cancelled) setJoinOpen(settings.viewerAccessOpen);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const session = loadJoinSession();
    if (!session) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await fetchJoinStatus(session.id);
      if (cancelled) return;
      if (!result.ok || !result.status) {
        clearJoinSession();
        setDone(null);
        setRestoring(false);
        return;
      }
      const next: DoneState = {
        id: session.id,
        queueNo: result.queueNo ?? session.queueNo,
        name: result.name ?? session.name,
        autoJoined: session.autoJoined,
        status: result.status,
      };
      saveJoinSession(next);
      setDone(next);
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!done || done.status !== 'pending') return;
    let cancelled = false;
    const tick = async () => {
      const result = await fetchJoinStatus(done.id);
      if (cancelled || !result.ok || !result.status) return;
      if (result.status === 'pending') return;
      setDone((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          status: result.status!,
          queueNo: result.queueNo ?? prev.queueNo,
          name: result.name ?? prev.name,
        };
        saveJoinSession(next);
        return next;
      });
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [done]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const parsed = parseRiotId(riotId);
    if (!parsed.riotName || !parsed.riotTag) {
      setBusy(false);
      setError('발로란트 닉네임#태그 형식으로 입력하세요.');
      return;
    }
    const profile = {
      name: name.trim(),
      riotName: parsed.riotName,
      riotTag: parsed.riotTag,
      canOrder,
    };
    const result = await submitJoinApplication(profile);
    setBusy(false);
    if (!result.ok || !result.application) {
      setError(result.error || '알 수 없는 오류입니다.');
      return;
    }
    saveJoinProfile(profile);
    const next: DoneState = {
      id: result.application.id,
      queueNo: result.application.queueNo,
      name: result.application.name,
      autoJoined: Boolean(result.autoJoined),
      status: 'pending',
    };
    saveJoinSession(next);
    setDone(next);
  };

  const resetToForm = () => {
    clearJoinSession();
    setDone(null);
    setError(null);
  };

  if (joinOpen === null || restoring) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <p className="text-sm text-val-muted">불러오는 중…</p>
      </div>
    );
  }

  if (joinOpen === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-val-line bg-val-panel/80 p-6 text-center shadow-xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-muted">Closed</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-val-cream">참가 신청 마감</h1>
          <p className="mt-3 text-sm text-val-muted">지금은 시청자 참가 신청을 받지 않습니다.</p>
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

  if (done) {
    const waiting = done.status === 'pending';
    const title = waiting
      ? done.autoJoined
        ? '합류 대기 중'
        : '승인 대기 중'
      : done.status === 'rejected'
        ? '거절되었습니다'
        : done.status === 'cancelled'
          ? '합류가 취소되었습니다'
          : done.autoJoined
            ? '대기열에 들어갔습니다'
            : '승인되었습니다';
    const detail = waiting
      ? done.autoJoined
        ? '스트리머 매니지 화면이 켜져 있으면 곧 대기열에 추가됩니다.'
        : '스트리머 승인 후 대기열에 들어갑니다. 이 화면을 유지하면 결과가 갱신됩니다.'
      : done.status === 'rejected'
        ? '다른 닉네임으로 다시 신청하거나 스트리머에게 문의해 주세요.'
        : done.status === 'cancelled'
          ? '명단에서 찾을 수 없어 요청이 취소되었습니다.'
          : '이미 참가 중입니다. 보드에서 빠진 뒤에만 다시 신청할 수 있습니다.';

    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-val-line bg-val-panel/80 p-6 text-center shadow-xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-teal">
            {waiting ? 'Waiting' : 'Done'}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-val-cream">{title}</h1>
          <p className="mt-3 text-sm text-val-muted">
            <span className="font-semibold text-val-cream">{done.name}</span>
            {' · '}
            순번 <span className="font-semibold text-val-teal">#{done.queueNo}</span>
          </p>
          <p className="mt-2 text-xs text-val-muted">{detail}</p>
          {waiting ? <p className="mt-3 text-xs text-val-teal/80">상태 확인 중…</p> : null}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {!waiting ? (
              <button
                type="button"
                onClick={resetToForm}
                className="rounded-lg border border-val-line px-4 py-2.5 text-sm font-semibold text-val-cream hover:bg-white/5"
              >
                다시 신청
              </button>
            ) : null}
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-val-line px-4 py-2.5 text-sm font-semibold text-val-cream hover:bg-white/5"
            >
              처음으로
            </button>
          </div>
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
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-val-muted">
          <p>
            재미로 하는 내전입니다. 독선적인 플레이·태도는 피해 주세요. 성인(만 19세 이상)·마이크는
            필수입니다.
          </p>
          <p>
            치지직 닉네임과 발로란트 닉네임#태그를 적어 주세요. 티어는 API로 자동 반영되며, 보정이
            필요하면 스트리머에게 말해 주세요.
          </p>
          <ul className="space-y-1.5 rounded-lg border border-val-line/80 bg-val-bg/60 px-3.5 py-2.5 text-val-cream/85">
            <li>승인되어도 밸런스에 따라 이번 판에 못 들어갈 수 있습니다.</li>
            <li>밸런스 추첨 때 치지직 채팅에 없으면 제외될 수 있습니다.</li>
            <li>최근 24시간 참여 횟수가 적을수록 다음 판에 뽑힐 확률이 높아집니다.</li>
            <li>2만 5천 치즈 후원 시 고정 멤버로 참가할 수 있습니다.</li>
          </ul>
        </div>

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

        <label htmlFor="join-riot-id" className="mt-4 block text-xs font-semibold text-val-muted">
          발로란트 닉네임#태그
        </label>
        <input
          id="join-riot-id"
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          required
          placeholder="닉네임#KR1"
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2.5 text-val-cream outline-none focus:border-val-teal"
        />

        <p className="mt-4 text-xs font-semibold text-val-muted">오더</p>
        <button
          type="button"
          aria-pressed={canOrder}
          onClick={() => setCanOrder((value) => !value)}
          className={
            canOrder
              ? 'mt-1.5 rounded-md border border-val-teal/50 px-3 py-2 text-sm font-semibold text-val-cream transition-colors'
              : 'mt-1.5 rounded-md border border-val-teal/15 px-3 py-2 text-sm text-val-teal/50 transition-colors'
          }
          style={{
            backgroundColor: canOrder ? 'rgba(15, 223, 195, 0.6)' : 'rgba(15, 223, 195, 0.08)',
          }}
        >
          {canOrder ? '오더 가능' : '오더 불가능'}
        </button>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-val-warn/40 bg-val-warn/10 px-3 py-2 text-sm text-val-warn">
            신청 실패: {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !name.trim() || !hasCompleteRiotId(riotId)}
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
