export type ParsedCommand =
  | { type: 'help' }
  | { type: 'away' }
  | { type: 'join'; riotId?: string; canOrder: boolean };

const COMMAND_RE = /^!(신청|참가|불참|도움|help|오더)(?:\s+(.+))?$/i;

/**
 * 채팅 한 줄을 Valnce 브릿지 명령으로 파싱. 명령이 아니면 null.
 * `!신청`은 하위 호환으로 `!참가`와 동일 처리(도움말·문서에는 미노출).
 */
export function parseChatCommand(content: string): ParsedCommand | null {
  const trimmed = content.trim();
  const match = trimmed.match(COMMAND_RE);
  if (!match) return null;

  const verb = match[1].toLowerCase();
  const rest = (match[2] ?? '').trim();

  if (verb === '도움' || verb === 'help') return { type: 'help' };
  if (verb === '불참') return { type: 'away' };

  if (verb === '오더') {
    if (!rest) return { type: 'join', canOrder: true };
    return { type: 'join', riotId: stripOrderFlag(rest).riotId || undefined, canOrder: true };
  }

  // 신청·참가: Riot 없으면 출석/재합류, 있으면 신청·합류
  const { riotId, canOrder } = stripOrderFlag(rest);
  return { type: 'join', riotId: riotId || undefined, canOrder };
}

function stripOrderFlag(rest: string): { riotId: string; canOrder: boolean } {
  if (!rest) return { riotId: '', canOrder: false };
  const tokens = rest.split(/\s+/).filter(Boolean);
  let canOrder = false;
  const kept: string[] = [];
  for (const token of tokens) {
    if (/^오더$/i.test(token)) {
      canOrder = true;
      continue;
    }
    kept.push(token);
  }
  return { riotId: kept.join(' ').trim(), canOrder };
}

/** 채팅 전송 한도(100자) 안에 들어가게 짧게 유지 */
export const HELP_TEXT =
  '!참가 닉#태그 [오더] · !참가 · !불참 · !도움 (!참가=신청/재합류/출석)';
