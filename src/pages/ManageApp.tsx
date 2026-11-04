import { useCallback, useEffect, useState } from 'react';
import Board from '../components/Board';
import Header from '../components/Header';
import PlayerFormModal from '../components/PlayerFormModal';
import { useMatchSync } from '../hooks/useMatchSync';
import { useRosterSync } from '../hooks/useRosterSync';
import { Player } from '../types';
import { clearStreamerToken } from '../utils/streamerAuth';

interface ManageAppProps {
  onLogout: () => void;
}

export default function ManageApp({ onLogout }: ManageAppProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);

  const showNotice = useCallback((text: string) => {
    setNotice({ text, id: Date.now() });
  }, []);

  const syncStatus = useRosterSync(showNotice);
  const { runMatchSync, syncing: matchSyncing } = useMatchSync(showNotice);

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

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <div className="min-h-screen bg-val-bg text-val-cream">
      <Header
        onNotice={showNotice}
        syncStatus={syncStatus}
        onMatchSync={(options) => {
          void runMatchSync(options);
        }}
        matchSyncing={matchSyncing}
        onUnauthorized={() => {
          clearStreamerToken();
          onLogout();
        }}
      />
      {notice && (
        <div className="mx-auto max-w-[1600px] px-4 pt-3">
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-val-line bg-val-panel px-4 py-2 text-sm text-val-cream"
          >
            {notice.text}
          </p>
        </div>
      )}
      <Board
        onAdd={openCreate}
        onEdit={openEdit}
        onNotice={showNotice}
        onUnauthorized={() => {
          clearStreamerToken();
          showNotice('스트리머 인증이 만료되었습니다. 다시 로그인하세요.');
          onLogout();
        }}
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
