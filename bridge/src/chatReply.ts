/** 치지직 Open API 채팅 메시지 최대 길이 */
export const CHAT_MESSAGE_MAX = 100;

export function clipChat(message: string, max = CHAT_MESSAGE_MAX): string {
  const text = message.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  if (max <= 1) return '…';
  return `${text.slice(0, max - 1)}…`;
}

type BridgeBody = Record<string, unknown>;

function asQueueNo(body: BridgeBody): number | null {
  const app = body.application;
  if (app && typeof app === 'object' && typeof (app as { queueNo?: unknown }).queueNo === 'number') {
    return (app as { queueNo: number }).queueNo;
  }
  if (typeof body.queueNo === 'number') return body.queueNo;
  return null;
}

/** API 결과·안내를 채팅 한 줄로 만든다 (전송 전 clipChat 권장). */
export function formatCommandReply(input: {
  name: string;
  kind: 'help' | 'cooldown' | 'send_failed' | 'result';
  helpText?: string;
  ready?: boolean;
  result?: { ok: boolean; status: number; body: BridgeBody };
}): string {
  const who = (input.name || '시청자').trim().slice(0, 20) || '시청자';

  if (input.kind === 'help') {
    return input.helpText ?? '';
  }
  if (input.kind === 'cooldown') {
    return `${who} 잠시만요. 같은 명령을 너무 빠르게 보냈어요.`;
  }
  if (input.kind === 'send_failed') {
    return `${who} 처리에 실패했어요. 잠시 후 다시 시도해 주세요.`;
  }

  const result = input.result;
  if (!result) return `${who} 처리 결과를 받지 못했어요.`;

  const body = result.body ?? {};
  const code = typeof body.code === 'string' ? body.code : '';
  const action = typeof body.action === 'string' ? body.action : '';
  const error = typeof body.error === 'string' ? body.error.trim() : '';

  if (result.ok) {
    if (action === 'check_in') {
      const checkIn = body.checkIn === 'away' || input.ready === false ? 'away' : 'ready';
      return checkIn === 'away'
        ? `${who} 이번 판 불참 처리했어요.`
        : `${who} 다음 판 참가 확인했어요.`;
    }
    if (action === 'join') {
      const queueNo = asQueueNo(body);
      const auto = Boolean(body.autoJoined);
      const ticket = queueNo != null ? ` #${queueNo}` : '';
      return auto
        ? `${who} 합류 요청${ticket} · 곧 대기열에 올라가요.`
        : `${who} 신청 접수${ticket} · 승인 대기 중이에요.`;
    }
    return `${who} 처리됐어요.`;
  }

  if (code === 'need_riot') {
    return `${who} 처음이면 !참가 닉#태그 로 신청해 주세요.`;
  }
  if (code === 'not_on_board') {
    return `${who} 보드에 없어요. !참가 닉#태그 후 출석해 주세요.`;
  }
  if (code === 'already_on_board') {
    return `${who} 이미 대기열·경기에 있어요.`;
  }
  if (code === 'join_closed') {
    return `${who} 지금은 시청자 참가 신청이 닫혀 있어요.`;
  }
  if (code === 'bridge_closed') {
    return `${who} 지금은 채팅 연동이 꺼져 있어요.`;
  }
  if (code === 'duplicate_name') {
    return `${who} ${error || '같은 치지직 닉네임이 이미 있어요.'}`;
  }
  if (code === 'duplicate_riot') {
    return `${who} ${error || '같은 발로란트 닉#태그가 이미 있어요.'}`;
  }
  if (
    code === 'join_rate_ip' ||
    code === 'join_rate_global' ||
    code === 'join_rate_identity' ||
    code === 'checkin_rate' ||
    code === 'duplicate_pending' ||
    code === 'queue_full'
  ) {
    return `${who} ${error || '신청이 너무 많거나 이미 대기 중이에요.'}`;
  }
  if (result.status === 503) {
    return `${who} 서버 연동이 잠깐 끊겼어요. 관리자에게 알려 주세요.`;
  }
  if (result.status === 401) {
    return `${who} 브릿지 인증 오류예요. 관리자에게 알려 주세요.`;
  }

  return `${who} ${error || '요청에 실패했어요.'}`;
}

/** 채팅 전송 간격 제한 (슬로우모드·폭주 방지) */
export class ChatReplyQueue {
  private chain: Promise<void> = Promise.resolve();
  private lastAt = 0;

  constructor(
    private readonly sendRaw: (message: string) => Promise<unknown>,
    private readonly gapMs = 1_100,
    private readonly onError?: (error: unknown, message: string) => void
  ) {}

  enqueue(message: string): void {
    const text = clipChat(message);
    if (!text) return;
    this.chain = this.chain.then(async () => {
      const wait = this.gapMs - (Date.now() - this.lastAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      try {
        await this.sendRaw(text);
        this.lastAt = Date.now();
      } catch (error) {
        this.onError?.(error, text);
      }
    });
  }
}
