import { PointerEvent, useEffect, useRef, useState } from 'react';
import { ClipboardCopy, HelpCircle, Map, RefreshCw, RotateCcw, Scale, Swords } from 'lucide-react';
import { BalanceFocus } from '../types';
import { useAppStore } from '../store/useAppStore';
import { copyText } from '../utils/copyText';
import { formatMatchResultText } from '../utils/formatMatchResult';
import AdminUnlockOverlay from './AdminUnlockOverlay';

const FOCUS_BUTTONS: { focus: BalanceFocus; label: string; title: string }[] = [
  { focus: 'high', label: '고티어', title: '고티어 위주 선발·고티어 분산 강화' },
  { focus: 'mid', label: '중티어', title: '중티어 위주 선발·평균 맞춤 강화' },
  { focus: 'low', label: '저티어', title: '저티어 위주 선발·분포 맞춤 강화' },
];

const ADMIN_HOLD_MS = 5000;

interface HeaderProps {
  onNotice: (message: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'ok' | 'offline';
  boardSyncStatus?: 'idle' | 'syncing' | 'ok' | 'offline';
  onMatchSync?: (options?: { force?: boolean }) => void;
  matchSyncing?: boolean;
  onAdminEnter?: () => void;
}

export default function Header({
  onNotice,
  syncStatus = 'idle',
  boardSyncStatus = 'idle',
  onMatchSync,
  matchSyncing = false,
  onAdminEnter,
}: HeaderProps) {
  const matchCount = useAppStore((state) => state.waitlist.length + state.team1.length + state.team2.length);
  const assignedCount = useAppStore((state) => state.team1.length + state.team2.length);
  const resetTeams = useAppStore((state) => state.resetTeams);
  const autoBalance = useAppStore((state) => state.autoBalance);
  const drawRandomMap = useAppStore((state) => state.drawRandomMap);
  const drawAttackSide = useAppStore((state) => state.drawAttackSide);
  const canBalance = matchCount >= 2;

  const [adminUnlockOpen, setAdminUnlockOpen] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => () => clearHoldTimer(), []);

  const runTeamReset = () => {
    if (matchCount === 0) return;
    resetTeams();
    onNotice('팀 인원을 대기열로 옮겼습니다.');
  };

  const handleResetPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    holdTriggeredRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      holdTimerRef.current = null;
      setAdminUnlockOpen(true);
    }, ADMIN_HOLD_MS);
  };

  const handleResetPointerUp = () => {
    const wasHold = holdTriggeredRef.current;
    clearHoldTimer();
    if (wasHold) return;
    runTeamReset();
  };

  const handleCopyResult = async () => {
    const state = useAppStore.getState();
    const text = formatMatchResultText({
      team1: state.team1,
      team2: state.team2,
      matchMapId: state.matchMapId,
      attackSide: state.attackSide,
    });
    const copied = await copyText(text);
    onNotice(copied ? '결과 텍스트를 복사했습니다.' : '결과 텍스트 복사에 실패했습니다.');
  };

  return (
    <header className="border-b border-val-line bg-val-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-5">
        <h1 className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img
            src="/valorant-logo.webp"
            alt="VALORANT"
            className="h-12 w-auto mix-blend-lighten sm:h-16"
            draggable={false}
          />
          <span className="font-display text-lg font-bold uppercase tracking-[0.18em] text-val-red sm:text-2xl sm:tracking-[0.24em]">
            5v5 Scrim Manager
          </span>
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
          {syncStatus !== 'idle' && (
            <span
              className={`hidden text-sm sm:inline ${
                syncStatus === 'ok'
                  ? 'text-val-teal'
                  : syncStatus === 'syncing'
                    ? 'text-val-teal/80'
                    : 'text-val-warn'
              }`}
              title="기존 플레이어 명단 서버 동기화"
            >
              {syncStatus === 'ok' ? '명단 동기화됨' : syncStatus === 'syncing' ? '명단 동기화 중' : '명단 오프라인'}
            </span>
          )}
          {boardSyncStatus !== 'idle' && (
            <span
              className={`hidden text-sm sm:inline ${
                boardSyncStatus === 'ok'
                  ? 'text-val-teal'
                  : boardSyncStatus === 'syncing'
                    ? 'text-val-teal/80'
                    : 'text-val-warn'
              }`}
              title="대기열·팀 보드 서버 동기화"
            >
              {boardSyncStatus === 'ok'
                ? '보드 동기화됨'
                : boardSyncStatus === 'syncing'
                  ? '보드 동기화 중'
                  : '보드 오프라인'}
            </span>
          )}
          <button
            type="button"
            aria-label="전적 동기화"
            disabled={matchSyncing}
            onClick={() => onMatchSync?.({ force: true })}
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.6)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw size={17} className={matchSyncing ? 'animate-spin' : undefined} />
            {matchSyncing ? '동기화 중' : '전적 동기화'}
          </button>
          <button
            type="button"
            aria-label="팀 초기화"
            onPointerDown={handleResetPointerDown}
            onPointerUp={handleResetPointerUp}
            onPointerLeave={clearHoldTimer}
            onPointerCancel={clearHoldTimer}
            onClick={(event) => {
              // 마우스/터치는 pointerup에서 처리. 키보드(Enter/Space)만 여기로.
              if (event.detail !== 0) {
                event.preventDefault();
                return;
              }
              if (!holdTriggeredRef.current) runTeamReset();
            }}
            style={{ backgroundColor: 'rgba(139, 151, 143, 0.45)' }}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 ${
              matchCount === 0 ? 'opacity-40' : ''
            }`}
          >
            <RotateCcw size={17} />
            팀 초기화
          </button>
          <button
            type="button"
            aria-label="결과 저장"
            onClick={() => {
              void handleCopyResult();
            }}
            disabled={assignedCount === 0}
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.88)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ClipboardCopy size={17} />
            결과 저장
          </button>
          <button
            type="button"
            aria-label="랜덤 맵"
            onClick={() => {
              const result = drawRandomMap();
              onNotice(`맵 · ${result.label}`);
            }}
            style={{ backgroundColor: 'rgba(56, 189, 248, 0.55)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110"
          >
            <Map size={17} />
            랜덤 맵
          </button>
          <button
            type="button"
            aria-label="공수 추첨"
            onClick={() => {
              const result = drawAttackSide();
              onNotice(`공수 · ${result.label}`);
            }}
            style={{ backgroundColor: 'rgba(251, 113, 133, 0.55)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110"
          >
            <Swords size={17} />
            공수 추첨
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="자동 밸런스"
              onClick={() => {
                const result = autoBalance('fair');
                if (!result.ok) onNotice(result.message);
              }}
              disabled={!canBalance}
              style={{ backgroundColor: 'rgba(15, 223, 195, 0.6)' }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Scale size={18} />
              자동 밸런스
            </button>
            <div className="flex overflow-hidden rounded-lg border border-val-line/80">
              {FOCUS_BUTTONS.map((item) => (
                <button
                  key={item.focus}
                  type="button"
                  title={item.title}
                  aria-label={`${item.label} 위주 밸런스`}
                  onClick={() => {
                    const result = autoBalance(item.focus);
                    if (!result.ok) onNotice(result.message);
                  }}
                  disabled={!canBalance}
                  className="whitespace-nowrap border-r border-val-line/80 bg-val-panel/80 px-2.5 py-2.5 text-sm font-semibold text-val-cream last:border-r-0 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="group relative">
              <button
                type="button"
                aria-label="밸런스 규칙 보기"
                className="rounded-full p-1.5 text-val-red hover:bg-val-red/10"
              >
                <HelpCircle size={18} />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-val-line bg-val-panel p-3.5 text-left opacity-0 shadow-2xl transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              >
                <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-val-red">밸런스 규칙</p>
                <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-val-cream/90 break-keep">
                  <li className="whitespace-normal">1. 팀 고정 · 고정 · 고정 듀오 · 라이벌을 먼저 지킵니다.</li>
                  <li className="whitespace-normal">2. 고티어일수록 점수 비중이 커집니다.</li>
                  <li className="whitespace-normal">3. 고티어는 양쪽에 나누고, 팀 점수 합을 맞춥니다.</li>
                  <li className="whitespace-normal">4. 최고 티어는 약한 가산만 합니다. 내전 티어가 있으면 무시합니다.</li>
                  <li className="whitespace-normal">5. 고·중·저 티어 위주는 선발·배정 가중치만 바꿉니다.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {adminUnlockOpen && onAdminEnter && (
        <AdminUnlockOverlay
          onClose={() => setAdminUnlockOpen(false)}
          onAdminEnter={() => {
            setAdminUnlockOpen(false);
            onAdminEnter();
          }}
        />
      )}
    </header>
  );
}
