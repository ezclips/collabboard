/**
 * PATCH-366. Freeze board: the pure rules and the two banner strings.
 *
 * A board is frozen when `boards.frozen_at` is set. While frozen only the owner
 * (or a board admin) may change anything; everyone else may look. The database
 * is the guard (restrictive policies + a frozen_at trigger); this only decides
 * what the UI offers.
 */

/** The one field this module reads from a `boards` row. */
export interface BoardFreezeRow {
  readonly frozen_at?: string | null;
}

/** True when the board row carries a `frozen_at` timestamp. */
export function isBoardFrozen(row: BoardFreezeRow | null | undefined): boolean {
  return typeof row?.frozen_at === 'string' && row.frozen_at.length > 0;
}

/** May this user change the board's content? Open boards: yes; frozen: owner/admin only. */
export function mayEditFrozenBoard(input: {
  readonly frozen: boolean;
  readonly isOwnerOrAdmin: boolean;
}): boolean {
  if (!input.frozen) return true;
  return input.isOwnerOrAdmin;
}

export const FROZEN_BANNER_VISITOR = 'This board is frozen. You can look, but not change anything.';
export const FROZEN_BANNER_OWNER = 'Board frozen. Only you can change it.';
