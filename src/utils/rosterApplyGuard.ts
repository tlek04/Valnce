/** applyRemoteRoster 등 서버→로컬 반영 중 useRosterSync auto-push를 막는다. */
let depth = 0;

export function beginRemoteRosterApply(): void {
  depth += 1;
}

export function endRemoteRosterApply(): void {
  depth = Math.max(0, depth - 1);
}

export function isApplyingRemoteRoster(): boolean {
  return depth > 0;
}

export function withRemoteRosterApply<T>(fn: () => T): T {
  beginRemoteRosterApply();
  try {
    return fn();
  } finally {
    endRemoteRosterApply();
  }
}
