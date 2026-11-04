import { FormEvent, useState } from 'react';
import { Camera, HelpCircle, RefreshCw, RotateCcw, Scale, Shield } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useAppStore } from '../store/useAppStore';
import { saveResultImage } from '../utils/saveResultImage';
import {
  AccessLogEntry,
  fetchAccessLog,
  revokeAllStreamerSessions,
} from '../utils/streamerAuth';

interface HeaderProps {
  onNotice: (message: string) => void;
  syncStatus?: 'idle' | 'syncing' | 'ok' | 'offline';
  onMatchSync?: (options?: { force?: boolean; soft?: boolean }) => void;
  matchSyncing?: boolean;
  onUnauthorized?: () => void;
}

function formatAccessTime(at: number) {
  try {
    return new Date(at).toLocaleString('ko-KR');
  } catch {
    return String(at);
  }
}

export default function Header({
  onNotice,
  syncStatus = 'idle',
  onMatchSync,
  matchSyncing = false,
  onUnauthorized,
}: HeaderProps) {
  const matchCount = useAppStore((state) => state.waitlist.length + state.team1.length + state.team2.length);
  const assignedCount = useAppStore((state) => state.team1.length + state.team2.length);
  const resetTeams = useAppStore((state) => state.resetTeams);
  const autoBalance = useAppStore((state) => state.autoBalance);
  const canBalance = matchCount >= 2;

  const [securityOpen, setSecurityOpen] = useState(false);
  const [accessItems, setAccessItems] = useState<AccessLogEntry[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);

  const loadAccessLog = async () => {
    setAccessLoading(true);
    const result = await fetchAccessLog();
    setAccessLoading(false);
    if (result.unauthorized) {
      onUnauthorized?.();
      return;
    }
    if (!result.ok) {
      onNotice(result.error || '접속 기록을 불러오지 못했습니다.');
      return;
    }
    setAccessItems(result.items ?? []);
  };

  const openSecurity = () => {
    setSecurityOpen((open) => {
      const next = !open;
      if (next) void loadAccessLog();
      return next;
    });
  };

  const handleRevoke = async (event: FormEvent) => {
    event.preventDefault();
    if (!revokePassword.trim()) return;
    setRevokeBusy(true);
    const result = await revokeAllStreamerSessions(revokePassword);
    setRevokeBusy(false);
    if (!result.ok) {
      onNotice(result.error || '세션 회수에 실패했습니다.');
      return;
    }
    setRevokePassword('');
    onNotice('모든 세션을 끊었습니다. 다시 로그인하세요.');
    onUnauthorized?.();
  };

  const handleExportImage = async () => {
    const node = document.getElementById('match-board');
    if (!node) return;
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: '#0F1923',
        pixelRatio: 2,
      });
      const { fileName } = await saveResultImage(dataUrl);
      window.alert(`${fileName.replace(/\.png$/i, '')}\n다운로드 폴더에 저장되었습니다.`);
    } catch {
      window.alert('이미지 저장에 실패했습니다.');
    }
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
          <button
            type="button"
            aria-label="접속·세션"
            aria-pressed={securityOpen}
            onClick={openSecurity}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-val-line px-3.5 py-2.5 text-base font-semibold text-val-muted hover:text-val-cream"
          >
            <Shield size={17} />
            접속 IP
          </button>
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
            onClick={() => {
              resetTeams();
              onNotice('팀 인원을 대기열로 옮겼습니다.');
            }}
            disabled={matchCount === 0}
            style={{ backgroundColor: 'rgba(139, 151, 143, 0.45)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={17} />
            팀 초기화
          </button>
          <button
            type="button"
            aria-label="결과 저장"
            onClick={handleExportImage}
            disabled={assignedCount === 0}
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.88)' }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Camera size={17} />
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
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-base font-semibold text-val-cream hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Scale size={18} />
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
                  <li className="whitespace-normal">1. 팀 고정 · 고정 듀오 · 라이벌을 먼저 지킵니다.</li>
                  <li className="whitespace-normal">2. 고티어일수록 점수 비중이 커집니다.</li>
                  <li className="whitespace-normal">3. 고티어는 양쪽에 나누고, 팀 점수 합을 맞춥니다.</li>
                  <li className="whitespace-normal">4. 최고 티어는 약한 가산만 합니다. 내전 티어가 있으면 무시합니다.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {securityOpen && (
        <div className="mx-auto max-w-[1600px] px-4 pb-4">
          <div className="rounded-xl border border-val-line bg-val-panel/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-val-red">
                  접속 · 세션
                </h2>
                <p className="mt-1 text-xs text-val-muted">최근 로그인/API 접속 IP (최대 50건)</p>
              </div>
              <button
                type="button"
                onClick={() => void loadAccessLog()}
                disabled={accessLoading}
                className="rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream disabled:opacity-40"
              >
                {accessLoading ? '불러오는 중…' : '새로고침'}
              </button>
            </div>

            <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {accessItems.length === 0 ? (
                <li className="text-val-muted">기록이 없습니다.</li>
              ) : (
                accessItems.map((item) => (
                  <li
                    key={`${item.ip}-${item.at}-${item.ok}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-val-line/70 bg-val-bg/50 px-3 py-2"
                  >
                    <span className="font-mono text-val-cream">{item.ip}</span>
                    <span className="text-xs text-val-muted">
                      {formatAccessTime(item.at)}
                      <span className={`ml-2 font-semibold ${item.ok ? 'text-val-teal' : 'text-val-warn'}`}>
                        {item.ok ? '성공' : '실패'}
                      </span>
                    </span>
                  </li>
                ))
              )}
            </ul>

            <form onSubmit={handleRevoke} className="mt-4 border-t border-val-line pt-4">
              <p className="text-xs text-val-muted">
                모든 기기 세션을 끊습니다. 비번 확인 후 기존 토큰은 전부 무효가 되며, `/manage`에서 다시 로그인해야
                합니다.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 text-xs font-semibold text-val-muted">
                  스트리머 비밀번호
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={revokePassword}
                    onChange={(event) => setRevokePassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2 text-sm text-val-cream outline-none focus:border-val-red"
                  />
                </label>
                <button
                  type="submit"
                  disabled={revokeBusy || !revokePassword.trim()}
                  className="rounded-lg bg-val-red px-3.5 py-2 text-sm font-semibold text-white hover:bg-val-red/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {revokeBusy ? '처리 중…' : '모든 세션 끊기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
