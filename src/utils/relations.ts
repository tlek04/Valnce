import { Player } from '../types';

export function areRivals(a: Player, b: Player): boolean {
  return (a.rivalIds ?? []).includes(b.id) || (b.rivalIds ?? []).includes(a.id);
}

export function hasRivalConflict(team: Player[]): boolean {
  for (let i = 0; i < team.length; i += 1) {
    for (let j = i + 1; j < team.length; j += 1) {
      if (areRivals(team[i], team[j])) return true;
    }
  }
  return false;
}

function findRoot(parent: Map<string, string>, id: string): string {
  const current = parent.get(id) ?? id;
  if (current !== id) {
    const root = findRoot(parent, current);
    parent.set(id, root);
    return root;
  }
  return id;
}

export function allyGroups(players: Player[]): Player[][] {
  const parent = new Map(players.map((player) => [player.id, player.id]));
  const byId = new Map(players.map((player) => [player.id, player]));

  for (const player of players) {
    for (const allyId of player.allyIds ?? []) {
      if (!byId.has(allyId)) continue;
      const a = findRoot(parent, player.id);
      const b = findRoot(parent, allyId);
      if (a !== b) parent.set(a, b);
    }
  }

  const grouped = new Map<string, Player[]>();
  for (const player of players) {
    const root = findRoot(parent, player.id);
    const list = grouped.get(root) ?? [];
    list.push(player);
    grouped.set(root, list);
  }
  return [...grouped.values()];
}

export function allyGroupOf(players: Player[], id: string): Player[] {
  return allyGroups(players).find((group) => group.some((player) => player.id === id)) ?? [];
}

export function orderGroup(group: Player[], leadId: string): Player[] {
  const lead = group.find((player) => player.id === leadId);
  if (!lead) return group;
  return [lead, ...group.filter((player) => player.id !== leadId)];
}
