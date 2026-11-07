export interface MatchStats {
  wins: number;
  losses: number;
  streak: number;
}

export function emptyMatchStats(): MatchStats {
  return { wins: 0, losses: 0, streak: 0 };
}

export function normalizeMatchStats(raw: unknown): MatchStats {
  const data = (raw ?? {}) as Record<string, unknown>;
  const wins = typeof data.wins === 'number' && data.wins >= 0 ? Math.floor(data.wins) : 0;
  const losses = typeof data.losses === 'number' && data.losses >= 0 ? Math.floor(data.losses) : 0;
  const streak = typeof data.streak === 'number' ? Math.trunc(data.streak) : 0;
  return { wins, losses, streak };
}

export function applyMatchResult(stats: MatchStats, result: 'win' | 'loss'): MatchStats {
  if (result === 'win') {
    return {
      wins: stats.wins + 1,
      losses: stats.losses,
      streak: stats.streak > 0 ? stats.streak + 1 : 1,
    };
  }
  return {
    wins: stats.wins,
    losses: stats.losses + 1,
    streak: stats.streak < 0 ? stats.streak - 1 : -1,
  };
}

/** 승·패를 각각 ±1. 0 미만으로 내려가지 않으며, 수동 조정 시 연승/연패는 초기화. */
export function adjustMatchStat(
  stats: MatchStats,
  field: 'wins' | 'losses',
  delta: number
): MatchStats {
  if (delta === 0) return stats;
  const wins = field === 'wins' ? Math.max(0, stats.wins + delta) : stats.wins;
  const losses = field === 'losses' ? Math.max(0, stats.losses + delta) : stats.losses;
  if (wins === stats.wins && losses === stats.losses) return stats;
  return { wins, losses, streak: 0 };
}

export function formatRecord(stats: Pick<MatchStats, 'wins' | 'losses'>): string {
  return `${stats.wins}승 ${stats.losses}패`;
}

export function formatStreak(streak: number): string {
  if (streak > 0) return `${streak}연승`;
  if (streak < 0) return `${Math.abs(streak)}연패`;
  return '';
}

export function formatRiotId(riotName?: string, riotTag?: string): string {
  const name = riotName?.trim() ?? '';
  const tag = riotTag?.trim() ?? '';
  if (!name) return '';
  return tag ? `${name}#${tag}` : name;
}

/** `닉네임#태그` 한 줄을 분리. 마지막 `#` 기준. */
export function parseRiotId(raw: string): { riotName: string; riotTag: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { riotName: '', riotTag: '' };
  const hash = trimmed.lastIndexOf('#');
  if (hash <= 0) {
    return { riotName: trimmed.replace(/^#+/, ''), riotTag: '' };
  }
  return {
    riotName: trimmed.slice(0, hash).trim(),
    riotTag: trimmed.slice(hash + 1).trim().replace(/^#+/, ''),
  };
}

export function hasCompleteRiotId(raw: string): boolean {
  const { riotName, riotTag } = parseRiotId(raw);
  return Boolean(riotName && riotTag);
}

export function normalizeRiotPart(value?: string): string {
  return (value ?? '')
    .trim()
    .normalize('NFC')
    .replace(/^#+/, '')
    .toLowerCase();
}

export function riotIdentityKey(riotName?: string, riotTag?: string): string {
  const name = normalizeRiotPart(riotName);
  const tag = normalizeRiotPart(riotTag);
  if (!name || !tag) return '';
  return `${name}#${tag}`;
}

/** 시간순 매치로 플레이어별 승패·연승패를 다시 계산한다. */
export function recomputeStatsFromMatches(
  taggedPlayerIds: string[],
  matches: { playedAt: number; results: { playerId: string; result: 'win' | 'loss' }[] }[]
): Map<string, MatchStats> {
  const stats = new Map<string, MatchStats>();
  for (const id of taggedPlayerIds) {
    stats.set(id, emptyMatchStats());
  }

  const ordered = [...matches].sort((a, b) => a.playedAt - b.playedAt);
  for (const match of ordered) {
    for (const entry of match.results) {
      const current = stats.get(entry.playerId);
      if (!current) continue;
      stats.set(entry.playerId, applyMatchResult(current, entry.result));
    }
  }
  return stats;
}
