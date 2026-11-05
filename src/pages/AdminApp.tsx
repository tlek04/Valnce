import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import ToastNotice from '../components/ToastNotice';
import { useToastStack } from '../hooks/useToastStack';
import { useAppStore } from '../store/useAppStore';
import { formatRating } from '../constants/valorant';
import { formatRecord, formatRiotId, formatStreak } from '../utils/matchStats';
import {
  AccessLogEntry,
  clearAccessLog,
  fetchAccessLog,
  revokeAllStreamerSessions,
} from '../utils/streamerAuth';
import { fetchRemoteRoster, pushRemoteRoster } from '../utils/rosterSync';
import { downloadRosterFile, readRosterFromFile } from '../utils/rosterShare';

interface AdminAppProps {
  onLogout: () => void;
}

function formatAccessTime(at: number) {
  try {
    return new Date(at).toLocaleString('ko-KR');
  } catch {
    return String(at);
  }
}

export default function AdminApp({ onLogout }: AdminAppProps) {
  const players = useAppStore((state) => state.players);
  const rosterUpdatedAt = useAppStore((state) => state.rosterUpdatedAt);
  const adjustPlayerRecord = useAppStore((state) => state.adjustPlayerRecord);
  const removePlayer = useAppStore((state) => state.removePlayer);
  const clearRoster = useAppStore((state) => state.clearRoster);
  const importSavedPlayers = useAppStore((state) => state.importSavedPlayers);
  const applyRemoteRoster = useAppStore((state) => state.applyRemoteRoster);
  const setRosterUpdatedAt = useAppStore((state) => state.setRosterUpdatedAt);
  const [query, setQuery] = useState('');
  const { items: notices, showNotice } = useToastStack();
  const [accessItems, setAccessItems] = useState<AccessLogEntry[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [clearLogBusy, setClearLogBusy] = useState(false);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pulledRef = useRef(false);

  const loadAccessLog = useCallback(async () => {
    setAccessLoading(true);
    const result = await fetchAccessLog();
    setAccessLoading(false);
    if (result.unauthorized) {
      showNotice(result.error || '관리자 인증이 필요합니다.');
      onLogout();
      return;
    }
    if (!result.ok) {
      showNotice(result.error || '접속 기록을 불러오지 못했습니다.');
      return;
    }
    setAccessItems(result.items ?? []);
  }, [onLogout, showNotice]);

  useEffect(() => {
    void loadAccessLog();
  }, [loadAccessLog]);

  useEffect(() => {
    if (pulledRef.current) return;
    pulledRef.current = true;
    let cancelled = false;
    (async () => {
      setSyncBusy(true);
      const remote = await fetchRemoteRoster();
      if (cancelled) return;
      setSyncBusy(false);
      if (!remote) {
        showNotice('서버 명단을 불러오지 못했습니다.');
        return;
      }
      applyRemoteRoster(remote.players, remote.updatedAt);
      showNotice(`서버 명단 ${remote.players.length}명을 불러왔습니다.`);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRemoteRoster, showNotice]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return players;
    return players.filter((player) => {
      const riot = formatRiotId(player.riotName, player.riotTag).toLowerCase();
      return player.name.toLowerCase().includes(needle) || riot.includes(needle);
    });
  }, [players, query]);

  const pushRoster = async () => {
    setSyncBusy(true);
    const state = useAppStore.getState();
    const result = await pushRemoteRoster(state.players, state.rosterUpdatedAt || Date.now());
    setSyncBusy(false);
    if (!result.ok) {
      showNotice(result.conflict ? '서버 명단과 충돌했습니다. 다시 불러오세요.' : '명단 업로드에 실패했습니다.');
      return;
    }
    showNotice('서버 명단에 반영했습니다.');
  };

  const handleAdjust = async (id: string, field: 'wins' | 'losses', delta: number) => {
    adjustPlayerRecord(id, field, delta);
    await pushRoster();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`「${name}」을(를) 명단에서 삭제할까요?`)) return;
    removePlayer(id);
    await pushRoster();
    showNotice(`${name} 삭제됨`);
  };

  const handleClearRoster = async () => {
    if (clearConfirm.trim() !== '명단전체삭제') {
      showNotice('확인 문구에 명단전체삭제 를 정확히 입력하세요.');
      return;
    }
    if (!window.confirm('정말로 전체 명단을 비울까요? 이 작업은 서버에도 반영됩니다.')) {
      return;
    }
    clearRoster();
    setRosterUpdatedAt(Date.now());
    setClearConfirm('');
    await pushRoster();
    showNotice('명단을 비웠습니다.');
  };

  const handlePullRoster = async () => {
    setSyncBusy(true);
    const remote = await fetchRemoteRoster();
    setSyncBusy(false);
    if (!remote) {
      showNotice('서버 명단을 불러오지 못했습니다.');
      return;
    }
    applyRemoteRoster(remote.players, remote.updatedAt);
    showNotice(`서버 명단 ${remote.players.length}명을 불러왔습니다.`);
  };

  const handleImportFile = async (file: File) => {
    try {
      const incoming = await readRosterFromFile(file);
      const added = importSavedPlayers(incoming);
      await pushRoster();
      showNotice(`명단 ${incoming.length}명 병합 (신규 ${added}명)`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '가져오기에 실패했습니다.');
    }
  };

  const handleClearAccessLog = async () => {
    if (!window.confirm('접속 IP 기록을 모두 비울까요?')) return;
    setClearLogBusy(true);
    const result = await clearAccessLog();
    setClearLogBusy(false);
    if (result.unauthorized) {
      showNotice(result.error || '관리자 인증이 필요합니다.');
      onLogout();
      return;
    }
    if (!result.ok) {
      showNotice(result.error || '접속 기록을 비우지 못했습니다.');
      return;
    }
    setAccessItems([]);
    showNotice('접속 기록을 비웠습니다.');
  };

  const handleRevoke = async (event: FormEvent) => {
    event.preventDefault();
    if (!revokePassword.trim()) return;
    setRevokeBusy(true);
    const result = await revokeAllStreamerSessions(revokePassword);
    setRevokeBusy(false);
    if (!result.ok) {
      showNotice(result.error || '세션 회수에 실패했습니다.');
      return;
    }
    showNotice('모든 세션을 끊었습니다.');
    onLogout();
  };

  return (
    <div className="min-h-screen bg-val-bg text-val-cream">
      <header className="border-b border-val-line bg-val-bg/90">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-val-red">Admin</p>
            <h1 className="font-display text-2xl font-bold">관리자</h1>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-val-line px-3.5 py-2 text-sm font-semibold text-val-muted hover:text-val-cream"
          >
            나가기
          </button>
        </div>
      </header>

      <ToastNotice items={notices} />

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <section className="rounded-2xl border border-val-line bg-val-panel/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">세션 · 접속</h2>
              <p className="mt-1 text-xs text-val-muted">최근 로그인/API 접속 IP (최대 50건)</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadAccessLog()}
                disabled={accessLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream disabled:opacity-40"
              >
                <RefreshCw size={14} className={accessLoading ? 'animate-spin' : undefined} />
                새로고침
              </button>
              <button
                type="button"
                onClick={() => void handleClearAccessLog()}
                disabled={clearLogBusy || accessItems.length === 0}
                className="rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clearLogBusy ? '비우는 중…' : '로그 비우기'}
              </button>
            </div>
          </div>
          <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto text-sm">
            {accessItems.length === 0 ? (
              <li className="text-val-muted">기록이 없습니다.</li>
            ) : (
              accessItems.map((item) => (
                <li
                  key={`${item.ip}-${item.at}-${item.ok}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-val-line/70 bg-val-bg/50 px-3 py-2"
                >
                  <span className="font-mono">{item.ip}</span>
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
              모든 기기 세션을 끊습니다. 관리자 비밀번호로만 확인할 수 있습니다.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 text-xs font-semibold text-val-muted">
                관리자 비밀번호
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
        </section>

        <section className="rounded-2xl border border-val-line bg-val-panel/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">명단 · 승패</h2>
              <p className="mt-1 text-xs text-val-muted">
                저장된 플레이어 {players.length}명 · 로컬 갱신 후 서버에 푸시합니다
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncBusy}
                onClick={() => void handlePullRoster()}
                className="rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream disabled:opacity-40"
              >
                서버에서 불러오기
              </button>
              <button
                type="button"
                disabled={syncBusy}
                onClick={() => void pushRoster()}
                className="rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream disabled:opacity-40"
              >
                서버에 올리기
              </button>
              <button
                type="button"
                onClick={() => downloadRosterFile(players)}
                className="rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream"
              >
                JSON 내보내기
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-val-line px-3 py-1.5 text-xs font-semibold text-val-muted hover:text-val-cream"
              >
                JSON 가져오기
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void handleImportFile(file);
                }}
              />
            </div>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="닉 · 발로닉 검색"
            className="mt-4 w-full rounded-lg border border-val-line bg-val-bg px-3 py-2 text-sm outline-none focus:border-val-red"
          />

          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="text-sm text-val-muted">플레이어가 없습니다.</li>
            ) : (
              filtered.map((player) => {
                const streak = formatStreak(player.streak);
                return (
                  <li
                    key={player.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-val-line bg-val-bg/60 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{player.name}</p>
                      <p className="truncate text-xs text-val-muted">
                        {formatRiotId(player.riotName, player.riotTag) || '발로닉 없음'} ·{' '}
                        {formatRating(player.currentTier)}
                      </p>
                      <p className="mt-1 text-sm text-val-muted">
                        {formatRecord(player)}
                        {streak ? (
                          <span className={`ml-1 ${player.streak > 0 ? 'text-val-teal' : 'text-val-red'}`}>
                            {streak}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-val-muted">승</span>
                      <button
                        type="button"
                        aria-label={`${player.name} 승 -1`}
                        className="rounded-md border border-val-line p-1.5 text-val-muted hover:text-val-cream"
                        onClick={() => void handleAdjust(player.id, 'wins', -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${player.name} 승 +1`}
                        className="rounded-md border border-val-line p-1.5 text-val-muted hover:text-val-cream"
                        onClick={() => void handleAdjust(player.id, 'wins', 1)}
                      >
                        <Plus size={14} />
                      </button>
                      <span className="ml-2 mr-1 text-xs text-val-muted">패</span>
                      <button
                        type="button"
                        aria-label={`${player.name} 패 -1`}
                        className="rounded-md border border-val-line p-1.5 text-val-muted hover:text-val-cream"
                        onClick={() => void handleAdjust(player.id, 'losses', -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${player.name} 패 +1`}
                        className="rounded-md border border-val-line p-1.5 text-val-muted hover:text-val-cream"
                        onClick={() => void handleAdjust(player.id, 'losses', 1)}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${player.name} 삭제`}
                        className="ml-2 rounded-md p-1.5 text-val-muted hover:bg-val-red/10 hover:text-val-red"
                        onClick={() => void handleDelete(player.id, player.name)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          <div className="mt-4 border-t border-val-line pt-4">
            <p className="text-xs text-val-muted">
              전체 명단 삭제. 확인 칸에 <span className="font-semibold text-val-warn">명단전체삭제</span> 를
              입력하세요. (로컬 갱신 {rosterUpdatedAt ? new Date(rosterUpdatedAt).toLocaleString('ko-KR') : '-'})
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={clearConfirm}
                onChange={(event) => setClearConfirm(event.target.value)}
                placeholder="명단전체삭제"
                className="min-w-[12rem] flex-1 rounded-lg border border-val-line bg-val-bg px-3 py-2 text-sm outline-none focus:border-val-red"
              />
              <button
                type="button"
                onClick={() => void handleClearRoster()}
                className="rounded-lg bg-val-red/80 px-3.5 py-2 text-sm font-semibold text-white hover:bg-val-red disabled:opacity-40"
              >
                명단 전체 삭제
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
