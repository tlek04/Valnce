import { useCallback, useEffect, useState } from 'react';
import { Player } from './types';
import Board from './components/Board';
import Header from './components/Header';
import PlayerFormModal from './components/PlayerFormModal';
import { useMatchAutoSync } from './hooks/useMatchAutoSync';
import { useRosterSync } from './hooks/useRosterSync';

export default function App() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);

  const showNotice = useCallback((text: string) => {
    setNotice({ text, id: Date.now() });
  }, []);

  const syncStatus = useRosterSync(showNotice);
  const { runMatchSync, syncing: matchSyncing } = useMatchAutoSync(showNotice);

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
      <Board onAdd={openCreate} onEdit={openEdit} onNotice={showNotice} />
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
