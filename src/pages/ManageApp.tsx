import { useState } from 'react';
import Board from '../components/Board';
import Header from '../components/Header';
import PlayerFormModal from '../components/PlayerFormModal';
import ToastNotice from '../components/ToastNotice';
import { useMatchSync } from '../hooks/useMatchSync';
import { useRosterSync } from '../hooks/useRosterSync';
import { useToastStack } from '../hooks/useToastStack';
import { Player } from '../types';
interface ManageAppProps {
  onLogout: () => void;
  onAdminEnter?: () => void;
}

export default function ManageApp({ onLogout, onAdminEnter }: ManageAppProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { items: notices, showNotice } = useToastStack();

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

  return (
    <div className="min-h-screen bg-val-bg text-val-cream">
      <Header
        onNotice={showNotice}
        syncStatus={syncStatus}
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
        onUnauthorized={() => {
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
