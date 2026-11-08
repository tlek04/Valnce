import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  fetchJoinPresence,
  fetchJoinStatus,
  JoinCheckIn,
  JoinStatus,
  submitJoinApplication,
  submitJoinCheckIn,
} from '../utils/joinApi';
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

/** 신청 상태 API 없이 보드 탑승만으로 복구한 세션 */
const ON_BOARD_SESSION_ID = 'on-board';

function isTrackableSessionId(id: string) {
  return Boolean(id) && id !== ON_BOARD_SESSION_ID;
}

export default function JoinPage({ onBack }: JoinPageProps) {
  const saved = loadJoinProfile();
  const [name, setName] = useState(saved.name);
  const [riotId, setRiotId] = useState(formatRiotId(saved.riotName, saved.riotTag));
  const [canOrder, setCanOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [done, setDone] = useState<DoneState | null>(() => loadJoinSession());
  const [joinOpen, setJoinOpen] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [presence, setPresence] = useState<{
    onBoard: boolean;
    checkIn: JoinCheckIn;
    checkInOpen: boolean;
  } | null>(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const enterOnBoardSession = (
    info: { name?: string; queueNo?: number; checkIn?: JoinCheckIn; checkInOpen?: boolean },
    base?: DoneState | null
  ) => {
    const next: DoneState = {
      id: base && isTrackableSessionId(base.id) ? base.id : ON_BOARD_SESSION_ID,
      queueNo: info.queueNo ?? base?.queueNo ?? 0,
      name: info.name || base?.name || loadJoinProfile().name || '참가자',
      autoJoined: true,
      status: 'joined',
    };
    saveJoinSession(next);
    setDone(next);
    setPresence({
      onBoard: true,
      checkIn: info.checkIn ?? null,
      checkInOpen: Boolean(info.checkInOpen),
    });
  };

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
    let cancelled = false;
    (async () => {
      const session = loadJoinSession();
      const presenceResult = await fetchJoinPresence();
      if (cancelled) return;

      // 승인 후 나가도, 같은 브라우저 쿠키로 보드에 있으면 출석 화면 복구
      if (presenceResult.ok && presenceResult.onBoard) {
        enterOnBoardSession(
          {
            name: presenceResult.name,
            checkIn: presenceResult.checkIn ?? null,
            checkInOpen: presenceResult.checkInOpen,
            queueNo: session?.queueNo,
          },
          session
        );
        setRestoring(false);
        return;
      }

      if (!session || !isTrackableSessionId(session.id)) {
        if (session && !isTrackableSessionId(session.id)) clearJoinSession();
        setDone(null);
        setRestoring(false);
        return;
      }

      const result = await fetchJoinStatus(session.id);
      if (cancelled) return;
      if (!result.ok || !result.status) {
        if (result.notFound) {
          clearJoinSession();
          setDone(null);
        }
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
    if (!done || done.status !== 'pending' || !isTrackableSessionId(done.id)) return;
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

  const joinedDone =
    done &&
    (done.status === 'approved' || done.status === 'joined');

  useEffect(() => {
    if (!joinedDone) {
      setPresence(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const result = await fetchJoinPresence();
      if (cancelled || !result.ok) return;
      setPresence({
        onBoard: Boolean(result.onBoard),
        checkIn: result.checkIn ?? null,
        checkInOpen: Boolean(result.checkInOpen),
      });
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [joinedDone]);

  const handleCheckIn = async (ready: boolean) => {
    if (checkInBusy) return;
    setCheckInBusy(true);
    setCheckInError(null);
    const result = await submitJoinCheckIn(ready);
    setCheckInBusy(false);
    if (!result.ok) {
      setCheckInError(result.error || '출석 반영에 실패했습니다.');
      return;
    }
    setPresence({
      onBoard: Boolean(result.onBoard),
      checkIn: result.checkIn ?? (ready ? 'ready' : 'away'),
      checkInOpen: presence?.checkInOpen ?? false,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const parsed = parseRiotId(riotId);
    if (!parsed.riotName || !parsed.riotTag) {
      submitting.current = false;
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
    submitting.current = false;
    setBusy(false);
    if (!result.ok) {
      setError(result.error || '알 수 없는 오류입니다.');
      return;
    }
    saveJoinProfile(profile);
    if (result.alreadyOnBoard) {
      enterOnBoardSession({
        name: result.name || profile.name,
        queueNo: result.queueNo,
        checkIn: result.checkIn ?? null,
      });
      return;
    }
    if (!result.application) {
      setError(result.error || '알 수 없는 오류입니다.');
      return;
    }
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
          {!waiting && presence?.onBoard ? (
            <div className="mt-5 rounded-xl border border-val-teal/30 bg-val-teal/[0.08] px-4 py-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-val-teal">다음 판 출석</p>
              <p className="mt-2 text-sm text-val-cream/90">
                팀 초기화 후에는 여기서 다음 판 참가·불참을 눌러 주세요.
              </p>
              <p className="mt-1.5 text-xs text-val-muted">
                현재:{' '}
                {presence.checkIn === 'ready'
                  ? '참가'
                  : presence.checkIn === 'away'
                    ? '불참'
                    : presence.checkInOpen
                      ? '미응답'
                      : '참가(기본)'}
              </p>
              {checkInError ? (
                <p className="mt-2 text-xs text-val-red" role="alert">
                  {checkInError}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={checkInBusy || presence.checkIn === 'ready'}
                  onClick={() => void handleCheckIn(true)}
                  className="flex-1 rounded-lg bg-val-teal/80 px-3 py-2.5 text-sm font-semibold text-val-bg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  다음 판 참가
                </button>
                <button
                  type="button"
                  disabled={checkInBusy || presence.checkIn === 'away'}
                  onClick={() => void handleCheckIn(false)}
                  className="flex-1 rounded-lg border border-val-line px-3 py-2.5 text-sm font-semibold text-val-cream hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  이번 판 불참
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {!waiting && !presence?.onBoard ? (
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

  const fieldLabel = 'mt-5 block text-sm font-semibold text-val-cream';
  const fieldInput =
    'mt-2 w-full rounded-lg border border-val-line bg-val-bg px-3.5 py-3 text-base text-val-cream placeholder:text-val-muted/50 outline-none transition focus:border-val-teal focus:ring-1 focus:ring-val-teal/40';

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-3 py-6 sm:px-4 sm:py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-val-line bg-val-panel/90 p-4 shadow-xl sm:p-7"
      >
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-teal">Viewer</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-val-cream sm:text-3xl">참가 신청</h1>
        <p className="mt-3 text-sm leading-relaxed text-val-cream/80">
          성인(만 19세 이상)·마이크 필수. 재미로 하는 내전이니 독선적인 플레이는 피해 주세요.
        </p>

        <div className="mt-5 rounded-xl border border-val-teal/25 bg-val-teal/[0.07] px-4 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-val-teal">안내</p>
          <ul className="mt-2.5 space-y-2 text-sm leading-snug text-val-cream/90">
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-val-teal" aria-hidden>
                ·
              </span>
              <span>승인되어도 밸런스에 따라 이번 판에 못 들어갈 수 있습니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-val-teal" aria-hidden>
                ·
              </span>
              <span>밸런스 추첨 때 치지직 채팅에 없으면 제외될 수 있습니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-val-teal" aria-hidden>
                ·
              </span>
              <span>최근 24시간 참여가 적을수록 다음 판에 뽑힐 확률이 높아집니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-val-teal" aria-hidden>
                ·
              </span>
              <span>2만 5천 치즈 후원 시 고정 멤버로 참가할 수 있습니다.</span>
            </li>
          </ul>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-val-muted">
          닉네임#태그는 정확히 적어 주세요. 티어는 API로 자동 반영되며, 보정은 스트리머에게 말해 주세요. 신청은
          한 번만 눌러 주세요.
        </p>

        <label htmlFor="join-name" className={fieldLabel}>
          치지직 닉네임
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className={fieldInput}
        />

        <label htmlFor="join-riot-id" className={fieldLabel}>
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
          className={fieldInput}
        />

        <p className={fieldLabel}>오더</p>
        <button
          type="button"
          aria-pressed={canOrder}
          onClick={() => setCanOrder((value) => !value)}
          className={
            canOrder
              ? 'mt-2 rounded-lg border border-val-teal/60 px-4 py-2.5 text-sm font-semibold text-val-cream transition-colors'
              : 'mt-2 rounded-lg border border-val-line px-4 py-2.5 text-sm font-medium text-val-muted transition-colors hover:border-val-teal/40 hover:text-val-cream'
          }
          style={{
            backgroundColor: canOrder ? 'rgba(15, 223, 195, 0.55)' : 'rgba(15, 223, 195, 0.06)',
          }}
        >
          {canOrder ? '오더 가능' : '오더 불가능'}
        </button>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-val-warn/50 bg-val-warn/15 px-3.5 py-2.5 text-sm font-medium text-val-warn"
          >
            신청 실패: {error}
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-2.5">
          <button
            type="submit"
            disabled={busy || !name.trim() || !hasCompleteRiotId(riotId)}
            className="rounded-lg bg-val-teal px-5 py-3 text-sm font-bold text-val-bg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '신청 중…' : '신청하기'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-val-line px-5 py-3 text-sm font-semibold text-val-muted hover:border-val-cream/30 hover:text-val-cream"
          >
            뒤로
          </button>
        </div>
      </form>
    </div>
  );
}
