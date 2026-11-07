import { useSharedSync, SyncAdapter } from './useSharedSync';
import { useAppStore } from '../store/useAppStore';
import { isApplyingRemoteBoard } from '../utils/boardApplyGuard';
import { RemoteBoard, fetchRemoteBoard, pushRemoteBoard, isBoardSyncConfigured, boardSnapshotFromState } from '../utils/boardSync';
const adapter: SyncAdapter<RemoteBoard> = {
  configured: isBoardSyncConfigured,
  fetch: fetchRemoteBoard,
  applying: isApplyingRemoteBoard,
  timestamp: state => state.boardUpdatedAt,
  changed: (state, previous) => state.boardUpdatedAt !== previous.boardUpdatedAt,
  apply: remote => useAppStore.getState().applyRemoteBoard(remote, remote.updatedAt),
  push: async (state, base) => {
    const result = await pushRemoteBoard(boardSnapshotFromState(state), state.boardUpdatedAt, base);
    if (result.ok) return result;
    return { ok: false, ...('unauthorized' in result ? { unauthorized: result.unauthorized } : {}), ...(result.conflict ? { remote: result.board } : {}) };
  },
};
export function useBoardSync(onNotice?: (message: string) => void, onUnauthorized?: () => void) {
  return useSharedSync(adapter, onNotice, onUnauthorized);
}
