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
  fetchTrustStatus,
  revokeAllStreamerSessions,
  clearAllAuthTokens,
  trustThisDevice,
  untrustThisDevice,
} from '../utils/streamerAuth';
import { fetchRemoteRoster, pushRemoteRoster } from '../utils/rosterSync';
import { downloadRosterFile, readRosterFromFile } from '../utils/rosterShare';
import { fetchSiteSettings, pushSiteSettings } from '../utils/siteSettings';
import { getOrCreateDeviceId } from '../utils/deviceId';

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
  const showMatchRecord = useAppStore((state) => state.showMatchRecord);
  const setShowMatchRecord = useAppStore((state) => state.setShowMatchRecord);
  const [query, setQuery] = useState('');
  const { items: notices, showNotice } = useToastStack();
  const [accessItems, setAccessItems] = useState<AccessLogEntry[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [clearLogBusy, setClearLogBusy] = useState(false);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [showViewerCard, setShowViewerCard] = useState(true);
  const [showStreamerCard, setShowStreamerCard] = useState(true);
  const [streamerAccessOpen, setStreamerAccessOpen] = useState(true);
  const [viewerAccessOpen, setViewerAccessOpen] = useState(true);
  const [chatBridgeOpen, setChatBridgeOpen] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [thisPcTrusted, setThisPcTrusted] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustReady, setTrustReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const serverRevision = useRef(0);
  const pushQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

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
    let cancelled = false;
    (async () => {
      const [settings, trusted] = await Promise.all([fetchSiteSettings(), fetchTrustStatus()]);
      if (cancelled) return;
      setShowViewerCard(settings.showViewerCard);
      setShowStreamerCard(settings.showStreamerCard);
      setShowMatchRecord(settings.showMatchRecord);
      setStreamerAccessOpen(settings.streamerAccessOpen);
      setViewerAccessOpen(settings.viewerAccessOpen);
      setChatBridgeOpen(settings.chatBridgeOpen);
      let isTrusted = trusted;
      if (!trusted) {
        const registered = await trustThisDevice('이 PC');
        if (cancelled) return;
        isTrusted = Boolean(registered.ok);
      }
      setThisPcTrusted(isTrusted);
      setTrustReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setShowMatchRecord]);

  useEffect(() => {
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
      serverRevision.current = remote.updatedAt;
    const localUpdatedAt = useAppStore.getState().rosterUpdatedAt ?? 0;
      if (remote.updatedAt >= localUpdatedAt) {
        applyRemoteRoster(remote.players, remote.updatedAt);
        showNotice(`서버 명단 ${remote.players.length}명을 불러왔습니다.`);
        return;
      }
      showNotice(
        `로컬 명단이 더 최신입니다(로컬 ${localUpdatedAt} · 서버 ${remote.updatedAt}). 필요하면 서버에 올리세요.`
      );
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

  const pushRoster = () => {
    setSyncBusy(true);
    const next = pushQueue.current.then(async () => {
      const state = useAppStore.getState();
      const result = await pushRemoteRoster(state.players, state.rosterUpdatedAt || Date.now(), serverRevision.current);
      if (result.ok) {
        serverRevision.current = result.updatedAt ?? serverRevision.current;
        showNotice('서버 명단에 반영했습니다.');
        return true;
      }
      if (result.conflict) {
        if (useAppStore.getState().players === state.players) {
          applyRemoteRoster(result.roster.players, result.roster.updatedAt);
          serverRevision.current = result.roster.updatedAt;
        }
        showNotice('다른 기기의 변경과 겹쳤습니다. 서버 명단을 불러온 뒤 다시 확인해 주세요.');
      } else showNotice('명단 업로드에 실패했습니다. 다시 서버에 올려 주세요.');
      return false;
    });
    pushQueue.current = next;
    void next.finally(() => { if (pushQueue.current === next) setSyncBusy(false); });
    return next;
  };

  const handleAdjust = async (id: string, field: 'wins' | 'losses', delta: number) => {
    adjustPlayerRecord(id, field, delta);
    await pushRoster();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`「${name}」을(를) 명단에서 삭제할까요?`)) return;
    removePlayer(id);
    if (await pushRoster()) showNotice(`${name} 삭제됨`);
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
    if (await pushRoster()) showNotice('명단을 비웠습니다.');
  };

  const handlePullRoster = async () => {
    setSyncBusy(true);
    const remote = await fetchRemoteRoster();
    setSyncBusy(false);
    if (!remote) {
      showNotice('서버 명단을 불러오지 못했습니다.');
      return;
    }
    serverRevision.current = remote.updatedAt;
    const localUpdatedAt = useAppStore.getState().rosterUpdatedAt ?? 0;
    if (remote.updatedAt < localUpdatedAt) {
      if (
        !window.confirm(
          `로컬 명단이 더 최신입니다. 그래도 서버 명단(${remote.players.length}명)으로 덮을까요?`
        )
      ) {
        return;
      }
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
    if (!trustReady) {
      showNotice('이 PC 예외 상태를 확인하는 중입니다. 잠시 후 다시 시도하세요.');
      return;
    }
    setRevokeBusy(true);
    const trustedNow = await fetchTrustStatus();
    setThisPcTrusted(trustedNow);
    const result = await revokeAllStreamerSessions(revokePassword);
    setRevokeBusy(false);
    if (!result.ok) {
      showNotice(result.error || '세션 회수에 실패했습니다.');
      return;
    }
    setRevokePassword('');
    showNotice(
      trustedNow
        ? '다른 기기 세션을 끊었습니다. 이 PC는 예외로 그대로 유지됩니다.'
        : '세션을 끊었습니다. 이 PC가 예외 등록되어 있지 않아 다시 로그인하세요.'
    );
    if (!trustedNow) {
      clearAllAuthTokens();
      onLogout();
    }
  };

  const handleTrustThisPc = async () => {
    setTrustBusy(true);
    const result = await trustThisDevice('이 PC');
    setTrustBusy(false);
    if (result.unauthorized) {
      showNotice(result.error || '관리자 인증이 필요합니다.');
      onLogout();
      return;
    }
    if (!result.ok) {
      showNotice(result.error || '이 PC 등록에 실패했습니다.');
      return;
    }
    setThisPcTrusted(true);
    showNotice('이 PC를 예외로 등록했습니다.');
  };

  const handleUntrustThisPc = async () => {
    setTrustBusy(true);
    const result = await untrustThisDevice();
    setTrustBusy(false);
    if (result.unauthorized) {
      showNotice(result.error || '관리자 인증이 필요합니다.');
      onLogout();
      return;
    }
    if (!result.ok) {
      showNotice(result.error || '이 PC 해제에 실패했습니다.');
      return;
    }
    setThisPcTrusted(false);
    showNotice('이 PC 예외를 해제했습니다.');
  };

  const saveSiteSetting = async (
    patch: Partial<{
      showViewerCard: boolean;
      showStreamerCard: boolean;
      showMatchRecord: boolean;
      streamerAccessOpen: boolean;
      viewerAccessOpen: boolean;
      chatBridgeOpen: boolean;
    }>,
    revert: () => void,
    successMessage: string
  ) => {
    setSettingsBusy(true);
    const result = await pushSiteSettings(patch);
    setSettingsBusy(false);
    if (result.unauthorized) {
      revert();
      showNotice(result.error || '관리자 인증이 필요합니다.');
      onLogout();
      return;
    }
    if (!result.ok) {
      revert();
      showNotice(result.error || '설정을 저장하지 못했습니다.');
      return;
    }
    if (result.settings) {
      setShowViewerCard(result.settings.showViewerCard);
      setShowStreamerCard(result.settings.showStreamerCard);
      setShowMatchRecord(result.settings.showMatchRecord);
      setStreamerAccessOpen(result.settings.streamerAccessOpen);
      setViewerAccessOpen(result.settings.viewerAccessOpen);
      setChatBridgeOpen(result.settings.chatBridgeOpen);
    }
    showNotice(successMessage);
  };

  const handleMatchRecordToggle = (checked: boolean) => {
    const previous = showMatchRecord;
    setShowMatchRecord(checked);
    void saveSiteSetting(
      { showMatchRecord: checked },
      () => setShowMatchRecord(previous),
      checked ? '카드에 승패를 표시합니다.' : '카드에서 승패를 숨깁니다.'
    );
  };

  const handleStreamerAccessToggle = (checked: boolean) => {
    const previous = streamerAccessOpen;
    setStreamerAccessOpen(checked);
    void saveSiteSetting(
      { streamerAccessOpen: checked },
      () => setStreamerAccessOpen(previous),
      checked
        ? '스트리머 세션을 열었습니다. 기존 토큰으로 바로 사용할 수 있습니다.'
        : '스트리머 세션을 닫았습니다. 다른 기기는 막히고, 이 PC(예외)는 그대로입니다.'
    );
  };

  const handleViewerAccessToggle = (checked: boolean) => {
    const previous = viewerAccessOpen;
    setViewerAccessOpen(checked);
    void saveSiteSetting(
      { viewerAccessOpen: checked },
      () => setViewerAccessOpen(previous),
      checked ? '시청자 참가 신청을 열었습니다.' : '시청자 참가 신청을 닫았습니다.'
    );
  };

  const handleChatBridgeToggle = (checked: boolean) => {
    const previous = chatBridgeOpen;
    setChatBridgeOpen(checked);
    void saveSiteSetting(
      { chatBridgeOpen: checked },
      () => setChatBridgeOpen(previous),
      checked ? '치지직 채팅 연동을 켰습니다.' : '치지직 채팅 연동을 껐습니다.'
    );
  };

  const handleViewerCardToggle = (checked: boolean) => {
    const previous = showViewerCard;
    setShowViewerCard(checked);
    void saveSiteSetting(
      { showViewerCard: checked },
      () => setShowViewerCard(previous),
      checked ? '대문에 시청자 카드를 표시합니다.' : '대문에서 시청자 카드를 숨깁니다.'
    );
  };

  const handleStreamerCardToggle = (checked: boolean) => {
    const previous = showStreamerCard;
    setShowStreamerCard(checked);
    void saveSiteSetting(
      { showStreamerCard: checked },
      () => setShowStreamerCard(previous),
      checked ? '대문에 스트리머 카드를 표시합니다.' : '대문에서 스트리머 카드를 숨깁니다.'
    );
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

          <div className="mt-4 border-t border-val-line pt-4">
            <p className="text-xs text-val-muted">
              이 PC 예외 — 세션 끊기·스트리머 OFF가 이 브라우저에는 적용되지 않습니다. (기기 ID{' '}
              <span className="font-mono">{deviceId.slice(0, 8)}…</span>)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  thisPcTrusted
                    ? 'border-val-teal/40 bg-val-teal/10 text-val-teal'
                    : 'border-val-line bg-val-bg/50 text-val-muted'
                }`}
              >
                {thisPcTrusted ? '예외 등록됨' : '예외 아님'}
              </span>
              {thisPcTrusted ? (
                <button
                  type="button"
                  disabled={trustBusy}
                  onClick={() => void handleUntrustThisPc()}
                  className="rounded-lg border border-val-line px-3 py-2 text-sm font-semibold text-val-muted hover:text-val-cream disabled:opacity-40"
                >
                  {trustBusy ? '처리 중…' : '이 PC 예외 해제'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={trustBusy}
                  onClick={() => void handleTrustThisPc()}
                  className="rounded-lg border border-val-line px-3 py-2 text-sm font-semibold text-val-muted hover:text-val-cream disabled:opacity-40"
                >
                  {trustBusy ? '처리 중…' : '이 PC 예외 등록'}
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleRevoke} className="mt-4 border-t border-val-line pt-4">
            <p className="text-xs text-val-muted">
              다른 기기 세션을 끊습니다. 신뢰된 이 PC는 제외됩니다. 관리자 비밀번호로 확인합니다.
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
          <div>
            <h2 className="text-lg font-semibold">세션 · 카드</h2>
            <p className="mt-1 text-xs text-val-muted">
              서버에 저장됩니다. 세션은 입장/신청, 카드는 대문 표시입니다
            </p>
          </div>
          <div className="mt-4 flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1">
            {(
              [
                {
                  key: 'streamer-session',
                  label: '스트리머 세션',
                  checked: streamerAccessOpen,
                  onChange: handleStreamerAccessToggle,
                  onText: '열림',
                  offText: '닫힘',
                },
                {
                  key: 'viewer-session',
                  label: '시청자 세션',
                  checked: viewerAccessOpen,
                  onChange: handleViewerAccessToggle,
                  onText: '열림',
                  offText: '닫힘',
                },
                {
                  key: 'chat-bridge',
                  label: '채팅 연동',
                  checked: chatBridgeOpen,
                  onChange: handleChatBridgeToggle,
                  onText: '켜짐',
                  offText: '꺼짐',
                },
                {
                  key: 'viewer-card',
                  label: '시청자 카드',
                  checked: showViewerCard,
                  onChange: handleViewerCardToggle,
                  onText: '켜짐',
                  offText: '꺼짐',
                },
                {
                  key: 'streamer-card',
                  label: '스트리머 카드',
                  checked: showStreamerCard,
                  onChange: handleStreamerCardToggle,
                  onText: '켜짐',
                  offText: '꺼짐',
                },
              ] as const
            ).map((item) => (
              <label
                key={item.key}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-val-line bg-val-bg/50 px-3 py-2.5 text-sm font-semibold text-val-cream ${
                  settingsBusy ? 'cursor-wait opacity-60' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={settingsBusy}
                  onChange={(event) => item.onChange(event.target.checked)}
                  className="h-4 w-4 accent-val-teal"
                />
                {item.label}
                <span className="text-xs font-medium text-val-muted">
                  {item.checked ? item.onText : item.offText}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <label
              className={`inline-flex items-center gap-2 rounded-lg border border-val-line bg-val-bg/50 px-3 py-2.5 text-sm font-semibold text-val-cream ${
                settingsBusy ? 'cursor-wait opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={showMatchRecord}
                disabled={settingsBusy}
                onChange={(event) => handleMatchRecordToggle(event.target.checked)}
                className="h-4 w-4 accent-val-red"
              />
              승패 표시
              <span className="text-xs font-medium text-val-muted">{showMatchRecord ? '켜짐' : '꺼짐'}</span>
            </label>
          </div>
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
            placeholder="닉네임 · 발로란트 닉네임 검색"
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
                        {formatRiotId(player.riotName, player.riotTag) || '발로란트 닉네임 없음'} ·{' '}
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
