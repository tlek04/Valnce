import { AppState, Player } from '../types';
import { toSavedPlayer, toSessionPlayer } from '../utils/player';
import { syncRelations } from '../utils/relations';

type BoardState = Pick<AppState, 'waitlist' | 'team1' | 'team2'>;

export function findPlayer(state: BoardState, id: string) {
  return (
    state.waitlist.find((player) => player.id === id) ||
    state.team1.find((player) => player.id === id) ||
    state.team2.find((player) => player.id === id) ||
    null
  );
}

export function upsertSaved(list: AppState['players'], player: Player) {
  const saved = toSavedPlayer(player);
  return list.some((item) => item.id === player.id)
    ? list.map((item) => (item.id === player.id ? saved : item))
    : [...list, saved];
}

export function withRelations(
  state: Pick<AppState, 'players' | 'team1' | 'team2' | 'waitlist'>,
  player: Player
): Pick<AppState, 'players' | 'team1' | 'team2' | 'waitlist'> {
  const apply = (list: Player[]) =>
    syncRelations(
      list.map((item) => (item.id === player.id ? player : item)),
      player.id,
      player.rivalIds,
      player.allyIds
    );
  return {
    players: upsertSaved(state.players, player),
    team1: apply(state.team1),
    team2: apply(state.team2),
    waitlist: apply(state.waitlist),
  };
}

export function resolvePlayer(state: AppState, id: string): Player | null {
  const saved = state.players.find((item) => item.id === id);
  return findPlayer(state, id) ?? (saved ? toSessionPlayer(saved) : null);
}

export function mapBoard(state: BoardState, update: (player: Player) => Player) {
  return {
    team1: state.team1.map(update),
    team2: state.team2.map(update),
    waitlist: state.waitlist.map(update),
  };
}

export function replacePlayer(state: AppState, player: Player) {
  return {
    players: upsertSaved(state.players, player),
    ...mapBoard(state, (item) => item.id === player.id ? player : item),
  };
}
