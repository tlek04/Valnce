import { streamerAuthHeaders } from './streamerAuth';

export interface BridgeStatus {
  connected: boolean;
  lastSeenAt: number | null;
  channelId: string | null;
  chatBridgeOpen: boolean;
}

export async function fetchBridgeStatus(): Promise<BridgeStatus | null> {
  try {
    const response = await fetch('/api/bridge/status', {
      method: 'GET',
      cache: 'no-store',
      headers: streamerAuthHeaders(),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      connected?: unknown;
      lastSeenAt?: unknown;
      channelId?: unknown;
      chatBridgeOpen?: unknown;
    };
    return {
      connected: data.connected === true,
      lastSeenAt: typeof data.lastSeenAt === 'number' ? data.lastSeenAt : null,
      channelId: typeof data.channelId === 'string' ? data.channelId : null,
      chatBridgeOpen: data.chatBridgeOpen !== false,
    };
  } catch {
    return null;
  }
}
