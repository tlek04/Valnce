import { useSharedSync, SyncAdapter } from './useSharedSync';
import { useAppStore } from '../store/useAppStore';
import { isApplyingRemoteRoster } from '../utils/rosterApplyGuard';
import { RemoteRoster, fetchRemoteRoster, pushRemoteRoster, isRosterSyncConfigured } from '../utils/rosterSync';
const adapter: SyncAdapter<RemoteRoster> = {
  configured: isRosterSyncConfigured,
  fetch: fetchRemoteRoster,
  applying: isApplyingRemoteRoster,
  timestamp: state => state.rosterUpdatedAt,
  changed: (state, previous) => state.players !== previous.players,
  apply: remote => useAppStore.getState().applyRemoteRoster(remote.players, remote.updatedAt),
  push: async (state, base) => {
    const result = await pushRemoteRoster(state.players, state.rosterUpdatedAt, base);
    if (result.ok) return result;
    return { ok: false, ...('unauthorized' in result ? { unauthorized: result.unauthorized } : {}), ...(result.conflict ? { remote: result.roster } : {}) };
  },
};
export function useRosterSync(onNotice?: (message: string) => void, onUnauthorized?: () => void) {
  return useSharedSync(adapter, onNotice, onUnauthorized);
}
