import { normalizeRiotPart as normalize } from '../utils/matchStats';

// Server contracts require strings; preserve the existing failure for malformed stored identities.
export function normalizeRiotPart(value: string): string {
  return normalize(value.trim());
}

export function riotKey(name: string, tag: string): string {
  const n = normalizeRiotPart(name);
  const t = normalizeRiotPart(tag);
  return n && t ? `${n}#${t}` : '';
}
