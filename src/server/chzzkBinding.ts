import { riotKey } from './identity';

type Row = {
  id?: unknown;
  name?: unknown;
  riotName?: unknown;
  riotTag?: unknown;
  chzzkChannelId?: unknown;
};

function rowChannel(item: Row): string {
  return typeof item.chzzkChannelId === 'string' ? item.chzzkChannelId.trim() : '';
}

function rowTagKey(item: Row): string {
  if (typeof item.riotName !== 'string' || typeof item.riotTag !== 'string') return '';
  if (!item.riotName || !item.riotTag) return '';
  return riotKey(item.riotName, item.riotTag);
}

/**
 * channelId ↔ Riot 1:1.
 * - channel이 다른 Riot에 묶여 있으면 channel_bound_other
 * - Riot이 다른 channel에 묶여 있으면 riot_bound_other
 */
export function checkChannelRiotBinding(
  rows: Row[],
  channelId: string,
  tagKey: string
): { ok: true } | { ok: false; code: 'channel_bound_other' | 'riot_bound_other' } {
  const channel = channelId.trim();
  if (!channel) return { ok: true };

  if (tagKey) {
    const byChannel = rows.find((item) => rowChannel(item) === channel);
    if (byChannel) {
      const bound = rowTagKey(byChannel);
      if (bound && bound !== tagKey) {
        return { ok: false, code: 'channel_bound_other' };
      }
    }
    const byRiot = rows.find((item) => rowTagKey(item) === tagKey);
    if (byRiot) {
      const boundCh = rowChannel(byRiot);
      if (boundCh && boundCh !== channel) {
        return { ok: false, code: 'riot_bound_other' };
      }
    }
  } else {
    // Riot 없이 channel만 쓸 때는 충돌 없음(조회용)
  }
  return { ok: true };
}

/** 기존 바인딩을 덮어쓰지 않고 channelId·닉만 안전하게 병합 */
export function mergeChannelBinding(
  prev: Row & Record<string, unknown>,
  input: { channelId?: string; name?: string }
): { next: Record<string, unknown>; changed: boolean; refused?: 'channel_bound_other' } {
  const channelId = input.channelId?.trim().slice(0, 100) || '';
  const name = input.name?.trim() || '';
  const prevCh = rowChannel(prev);

  if (channelId && prevCh && prevCh !== channelId) {
    return { next: prev, changed: false, refused: 'channel_bound_other' };
  }

  const next: Record<string, unknown> = { ...prev };
  if (name) next.name = name;
  if (channelId && !prevCh) next.chzzkChannelId = channelId;
  const changed = next.name !== prev.name || next.chzzkChannelId !== prev.chzzkChannelId;
  return { next, changed };
}

export function seatChannelId(seat: Row): string {
  return rowChannel(seat);
}

export function seatRiotTagKey(seat: Row): string {
  return rowTagKey(seat);
}
