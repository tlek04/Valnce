/** 채팅 명령 로컬 디듀프 — Workers 도달 전 연타·중복 메시지를 걸러낸다. */

const DEFAULT_COOLDOWN_MS = 3_000;
const recent = new Map<string, number>();

function prune(now: number) {
  if (recent.size < 500) return;
  for (const [key, at] of recent) {
    if (now - at > DEFAULT_COOLDOWN_MS * 2) recent.delete(key);
  }
}

export function allowChatCommand(input: {
  senderKey: string;
  commandType: string;
  riotId?: string;
  cooldownMs?: number;
}): boolean {
  const now = Date.now();
  prune(now);
  const cooldownMs = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const key = `${input.senderKey}|${input.commandType}|${(input.riotId ?? '').toLowerCase()}`;
  const last = recent.get(key);
  if (last != null && now - last < cooldownMs) return false;
  recent.set(key, now);
  return true;
}
