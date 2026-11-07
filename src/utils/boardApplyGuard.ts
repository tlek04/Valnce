/** applyRemoteBoard 등 서버→로컬 반영 중 useBoardSync auto-push를 막는다. */
let depth = 0;

export function beginRemoteBoardApply(): void {
  depth += 1;
}

export function endRemoteBoardApply(): void {
  depth = Math.max(0, depth - 1);
}

export function isApplyingRemoteBoard(): boolean {
  return depth > 0;
}

export function withRemoteBoardApply<T>(fn: () => T): T {
  beginRemoteBoardApply();
  try {
    return fn();
  } finally {
    endRemoteBoardApply();
  }
}
