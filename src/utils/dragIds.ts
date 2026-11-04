export const SAVED_DRAG_PREFIX = 'saved:';

export function savedDragId(id: string) {
  return `${SAVED_DRAG_PREFIX}${id}`;
}

export function parseSavedDragId(id: string) {
  return id.startsWith(SAVED_DRAG_PREFIX) ? id.slice(SAVED_DRAG_PREFIX.length) : null;
}

