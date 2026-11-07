import { useCallback, useEffect, useRef, useState } from 'react';
import Board from '../components/Board';
import Header from '../components/Header';
import PlayerFormModal from '../components/PlayerFormModal';
import ToastNotice from '../components/ToastNotice';
import { useBoardSync } from '../hooks/useBoardSync';
import { useMatchSync } from '../hooks/useMatchSync';
import { useRosterSync } from '../hooks/useRosterSync';
import { useToastStack } from '../hooks/useToastStack';
import { useAppStore } from '../store/useAppStore';
import { clearAllAuthTokens, fetchTrustStatus } from '../utils/streamerAuth';
import { fetchSiteSettings } from '../utils/siteSettings';
import { Player } from '../types';

interface ManageAppProps {
  onLogout: () => void;
  onAdminEnter?: () => void;
}

const ACCESS_CLOSED_MESSAGE =
  '스트리머 입장이 닫혔습니다.\n토큰은 유지됩니다.\n관리자는 대문의 「관리자」 카드 또는 주소창 /admin 으로 들어가세요.';

function notifyAccessClosedAndCloseWindow() {
  window.alert(ACCESS_CLOSED_MESSAGE);
  window.close();
  window.location.replace('/');
}

export default function ManageApp({ onLogout, onAdminEnter }: ManageAppProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [accessReady, setAccessReady] = useState(false);
  const { items: notices, showNotice } = useToastStack();
  const setShowMatchRecord = useAppStore((state) => state.setShowMatchRecord);
  const closingRef = useRef(false);
  const knownOpenRef = useRef<boolean | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAllAuthTokens();
    showNotice('스트리머 인증이 만료되었습니다. 다시 로그인하세요.');
    onLogout();
  }, [onLogout, showNotice]);

  const syncStatus = useRosterSync(showNotice, handleUnauthorized);
  const boardSyncStatus = useBoardSync(showNotice, handleUnauthorized);
  const { runMatchSync, syncing: matchSyncing } = useMatchSync(showNotice);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const [settings, trusted] = await Promise.all([fetchSiteSettings(), fetchTrustStatus()]);
      if (cancelled || closingRef.current) return;
      setShowMatchRecord(settings.showMatchRecord);

      const open = settings.streamerAccessOpen || trusted;
      if (knownOpenRef.current === null) {
        knownOpenRef.current = open;
        if (!open) {
          closingRef.current = true;
          notifyAccessClosedAndCloseWindow();
          return;
        }
        setAccessReady(true);
        return;
      }
      if (knownOpenRef.current && !open) {
        closingRef.current = true;
        notifyAccessClosedAndCloseWindow();
        return;
      }
      knownOpenRef.current = open;
      setAccessReady(true);
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [setShowMatchRecord]);

  const openCreate = () => {
    setEditingPlayer(null);
    setFormKey((value) => value + 1);
    setFormOpen(true);
  };

  const openEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingPlayer(null);
  };

  if (!accessReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-val-bg text-sm text-val-muted">
        확인 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-val-bg text-val-cream">
      <Header
        onNotice={showNotice}
        syncStatus={syncStatus}
        boardSyncStatus={boardSyncStatus}
        onMatchSync={(options) => {
          void runMatchSync(options);
        }}
        matchSyncing={matchSyncing}
        onAdminEnter={onAdminEnter}
      />
      <ToastNotice items={notices} />
      <Board
        onAdd={openCreate}
        onEdit={openEdit}
        onNotice={showNotice}
        onUnauthorized={handleUnauthorized}
      />
      {formOpen && (
        <PlayerFormModal
          key={editingPlayer?.id ?? `new-${formKey}`}
          open={formOpen}
          player={editingPlayer}
          onClose={closeForm}
          onNotice={showNotice}
        />
      )}
    </div>
  );
}
