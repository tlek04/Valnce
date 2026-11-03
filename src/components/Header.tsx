import { Camera, HelpCircle, RefreshCw, RotateCcw, Scale } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useAppStore } from '../store/useAppStore';

interface HeaderProps {
  onNotice: (message: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'ok' | 'offline';
  onMatchSync?: (options?: { force?: boolean; soft?: boolean }) => void;
  matchSyncing?: boolean;
}

export default function Header({
  onNotice,
  syncStatus = 'idle',
  onMatchSync,
  matchSyncing = false,
}: HeaderProps) {
  const matchCount = useAppStore((state) => state.waitlist.length + state.team1.length + state.team2.length);
  const assignedCount = useAppStore((state) => state.team1.length + state.team2.length);
  const resetTeams = useAppStore((state) => state.resetTeams);
  const autoBalance = useAppStore((state) => state.autoBalance);
  const canBalance = matchCount >= 2;

  const handleExportImage = async () => {
    const node = document.getElementById('match-board');
    if (!node) return;
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: '#0F1923',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `valnce-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      onNotice('팀 구성 이미지를 저장했습니다.');
    } catch {
      onNotice('이미지 저장에 실패했습니다.');
    }
  };

  return (
    <header className="border-b border-val-line bg-val-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4">
        <h1 className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img
            src="/valorant-logo.webp"
            alt="VALORANT"
            className="h-11 w-auto mix-blend-lighten sm:h-14"
            draggable={false}
          />
          <span className="font-display text-base font-bold uppercase tracking-[0.18em] text-val-red sm:text-xl sm:tracking-[0.24em]">
            5v5 Scrim Manager
          </span>
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {syncStatus !== 'idle' && (
            <span
              className={`hidden text-xs sm:inline ${
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
          <button
            type="button"
            aria-label="전적 동기화"
            disabled={matchSyncing}
            onClick={() => onMatchSync?.({ force: true })}
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.6)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw size={15} className={matchSyncing ? 'animate-spin' : undefined} />
            {matchSyncing ? '동기화 중' : '전적 동기화'}
          </button>
          <button
            type="button"
            aria-label="팀 초기화"
            onClick={() => {
              resetTeams();
              onNotice('오늘 명단을 비웠습니다. 저장된 플레이어는 그대로입니다.');
            }}
            disabled={matchCount === 0}
            style={{ backgroundColor: 'rgba(139, 151, 143, 0.45)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={15} />
            팀 초기화
          </button>
          <button
            type="button"
            aria-label="결과 저장"
            onClick={handleExportImage}
            disabled={assignedCount === 0}
            style={{ backgroundColor: 'rgba(196, 168, 130, 0.55)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Camera size={15} />
            결과 저장
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="자동 밸런스"
              onClick={() => {
                const result = autoBalance();
                if (!result.ok) onNotice(result.message);
              }}
              disabled={!canBalance}
              style={{ backgroundColor: 'rgba(15, 223, 195, 0.6)' }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Scale size={16} />
              자동 밸런스
            </button>
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
                  <li className="whitespace-normal">1. 팀 고정 · 같은 팀 묶기 · 라이벌을 먼저 지킵니다.</li>
                  <li className="whitespace-normal">2. 인원을 최대한 비슷하게 나눕니다.</li>
                  <li className="whitespace-normal">3. 고티어일수록 점수 비중이 커집니다.</li>
                  <li className="whitespace-normal">4. 고티어는 양쪽에 나누고, 팀 점수 합을 맞춥니다.</li>
                  <li className="whitespace-normal">5. 최고 티어는 약한 가산만 합니다. 내전 티어가 있으면 무시합니다.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
