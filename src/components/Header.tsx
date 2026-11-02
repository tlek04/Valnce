import { Camera, RotateCcw, Scale } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useAppStore } from '../store/useAppStore';

interface HeaderProps {
  onNotice: (message: string) => void;
}

export default function Header({ onNotice }: HeaderProps) {
  const playerCount = useAppStore((state) => state.players.length);
  const matchCount = useAppStore((state) => state.waitlist.length + state.team1.length + state.team2.length);
  const assignedCount = useAppStore((state) => state.team1.length + state.team2.length);
  const clearRoster = useAppStore((state) => state.clearRoster);
  const resetTeams = useAppStore((state) => state.resetTeams);
  const autoBalance = useAppStore((state) => state.autoBalance);
  const canBalance = matchCount >= 10;

  const handleExport = async () => {
    const node = document.getElementById('match-board');
    if (!node) return;
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: '#0b0f14',
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
        <div className="min-w-0">
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-val-red sm:text-sm">Valnce</p>
          <h1 className="font-display text-xl font-bold tracking-wide text-val-cream sm:text-3xl">
            발로란트 5v5 내전 밸런서
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <span className="hidden text-sm text-val-muted sm:inline">저장 {playerCount}명</span>
          {playerCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('저장된 플레이어를 모두 삭제할까요?')) {
                  clearRoster();
                }
              }}
              className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm text-val-muted hover:bg-white/5 hover:text-val-cream sm:inline"
            >
              저장 삭제
            </button>
          )}
          <button
            type="button"
            aria-label="팀 초기화"
            onClick={() => {
              resetTeams();
              onNotice('오늘 명단을 비웠습니다. 저장된 플레이어는 그대로입니다.');
            }}
            disabled={matchCount === 0}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-val-muted hover:bg-white/5 hover:text-val-cream disabled:opacity-40"
          >
            <RotateCcw size={15} />
            <span className="hidden sm:inline">팀 초기화</span>
          </button>
          <button
            type="button"
            aria-label="결과 저장"
            onClick={handleExport}
            disabled={assignedCount === 0}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-val-muted hover:bg-white/5 hover:text-val-cream disabled:opacity-40"
          >
            <Camera size={15} />
            <span className="hidden sm:inline">결과 저장</span>
          </button>
          <button
            type="button"
            aria-label="자동 밸런스"
            title={canBalance ? '10명을 5대5로 나눕니다' : '자동 밸런스는 10명이 필요합니다'}
            onClick={() => {
              const result = autoBalance();
              onNotice(result.message);
            }}
            disabled={!canBalance}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-500/90 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Scale size={16} />
            자동 밸런스
          </button>
        </div>
      </div>
    </header>
  );
}
