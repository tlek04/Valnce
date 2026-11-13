export interface ValnceClientOptions {
  baseUrl: string;
  bridgeSecret: string;
}

export class ValnceClient {
  constructor(private readonly options: ValnceClientOptions) {}

  private url(path: string): string {
    return `${this.options.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  private headers(): HeadersInit {
    return {
      'content-type': 'application/json',
      'X-Valnce-Bridge': this.options.bridgeSecret,
    };
  }

  async heartbeat(channelId?: string): Promise<void> {
    const response = await fetch(this.url('/api/bridge/heartbeat'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(channelId ? { channelId } : {}),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`heartbeat ${response.status}: ${text.slice(0, 200)}`);
    }
  }

  /** 정본 경로: 신청·합류·출석·불참을 Workers가 구분 */
  async participate(input: {
    name: string;
    senderChannelId?: string;
    riotId?: string;
    canOrder?: boolean;
    ready?: boolean;
  }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const response = await fetch(this.url('/api/bridge/participate'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: input.name,
        senderChannelId: input.senderChannelId,
        riotId: input.riotId,
        canOrder: input.canOrder,
        ready: input.ready,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
  }
}
