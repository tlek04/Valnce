import { useRef } from 'react';
import { Camera, Download, HelpCircle, RotateCcw, Scale, Upload } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useAppStore } from '../store/useAppStore';
import { downloadRosterFile, readRosterFromFile } from '../utils/rosterShare';

interface HeaderProps {
  onNotice: (message: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'ok' | 'offline';
}

export default function Header({ onNotice, syncStatus = 'idle' }: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const players = useAppStore((state) => state.players);
  const playerCount = players.length;
  const matchCount = useAppStore((state) => state.waitlist.length + state.team1.length + state.team2.length);
  const assignedCount = useAppStore((state) => state.team1.length + state.team2.length);
  const clearRoster = useAppStore((state) => state.clearRoster);
  const resetTeams = useAppStore((state) => state.resetTeams);
  const autoBalance = useAppStore((state) => state.autoBalance);
  const importSavedPlayers = useAppStore((state) => state.importSavedPlayers);
  const canBalance = matchCount >= 2;

  const handleExportImage = async () => {
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

  const handleExportRoster = () => {
    if (players.length === 0) {
      onNotice('내보낼 기존 플레이어가 없습니다.');
      return;
    }
    downloadRosterFile(players);
    onNotice(`기존 플레이어 ${players.length}명을 파일로 저장했습니다.`);
  };

  const handleImportRoster = async (file: File | undefined) => {
    if (!file) return;
    try {
      const incoming = await readRosterFromFile(file);
      if (incoming.length === 0) {
        onNotice('파일에 플레이어가 없습니다.');
        return;
      }
      const before = useAppStore.getState().players.length;
      importSavedPlayers(incoming);
      const after = useAppStore.getState().players.length;
      const added = after - before;
      onNotice(
        added > 0
          ? `명단 ${incoming.length}명을 반영했습니다. 새로 ${added}명 추가.`
          : `명단 ${incoming.length}명을 반영했습니다. (기존 이름·티어 갱신)`
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '명단 가져오기에 실패했습니다.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header className="border-b border-val-line bg-val-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-val-red sm:text-sm">Valnce</p>
            <div className="group relative">
              <button
                type="button"
                aria-label="밸런스 규칙 보기"
                className="rounded-full p-1 text-val-muted hover:bg-white/5 hover:text-val-cream"
              >
                <HelpCircle size={15} />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-val-line bg-val-panel p-3.5 text-left opacity-0 shadow-2xl transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              >
                <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-val-red">밸런스 규칙</p>
                <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-val-cream/90">
                  <li>1. 팀 고정 · 같은 팀 묶기 · 라이벌을 먼저 지킵니다.</li>
                  <li>2. 인원을 최대한 비슷하게 나눕니다.</li>
                  <li>3. 고티어일수록 점수 비중이 커집니다.</li>
                  <li>4. 고티어는 양쪽에 나누고, 팀 점수 합을 맞춥니다.</li>
                  <li>5. 최고 티어는 약한 가산만 합니다. 내전 티어가 있으면 무시합니다.</li>
                </ol>
              </div>
            </div>
          </div>
          <h1 className="font-display text-xl font-bold tracking-wide text-val-cream sm:text-3xl">
            발로란트 5v5 내전 밸런서
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <span className="hidden text-sm text-val-muted sm:inline">저장 {playerCount}명</span>
          {syncStatus !== 'idle' && (
            <span
              className={`hidden text-xs sm:inline ${
                syncStatus === 'ok'
                  ? 'text-emerald-300'
                  : syncStatus === 'syncing'
                    ? 'text-sky-300'
                    : 'text-yellow-300'
              }`}
              title="기존 플레이어 명단 서버 동기화"
            >
              {syncStatus === 'ok' ? '명단 동기화됨' : syncStatus === 'syncing' ? '명단 동기화 중' : '명단 오프라인'}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => handleImportRoster(event.target.files?.[0])}
          />
          <button
            type="button"
            aria-label="명단 내보내기"
            onClick={handleExportRoster}
            disabled={playerCount === 0}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-val-muted hover:bg-white/5 hover:text-val-cream disabled:opacity-40"
          >
            <Download size={15} />
            <span className="hidden sm:inline">명단 내보내기</span>
          </button>
          <button
            type="button"
            aria-label="명단 가져오기"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-val-muted hover:bg-white/5 hover:text-val-cream"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">명단 가져오기</span>
          </button>
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
            onClick={handleExportImage}
            disabled={assignedCount === 0}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-val-muted hover:bg-white/5 hover:text-val-cream disabled:opacity-40"
          >
            <Camera size={15} />
            <span className="hidden sm:inline">결과 저장</span>
          </button>
          <div className="group relative">
            <button
              type="button"
              aria-label="자동 밸런스"
              aria-describedby="balance-rules-tip"
              onClick={() => {
                const result = autoBalance();
                if (!result.ok) onNotice(result.message);
              }}
              disabled={!canBalance}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-500/90 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Scale size={16} />
              자동 밸런스
            </button>
            <div
              id="balance-rules-tip"
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-val-line bg-val-panel p-3.5 text-left opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <p className="text-xs font-semibold text-val-cream">자동 밸런스가 하는 일</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-val-muted">
                <li>· 대기열 + 팀 인원을 함께 나눕니다.</li>
                <li>· 팀 고정은 그대로 둡니다.</li>
                <li>· 고티어 비중을 키워 양쪽에 나눕니다.</li>
                <li>· 결과는 티어 차이로 보여 줍니다.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
