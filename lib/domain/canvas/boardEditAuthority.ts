import { canEditWorkspace, type WorkspaceRole } from '@/lib/workspace/context';

/**
 * Who may edit THIS board, as the frontend is entitled to believe.
 *
 * The board's own row is the first authority, not the last resort. Live board
 * write policy authorises `boards.user_id = auth.uid()` (or a
 * `board_collaborators` row with role 'editor'); workspace role is a separate
 * axis that appears in a different branch of that policy entirely. A UI that
 * derived edit rights from workspace role ALONE therefore told the owner of a
 * board they could not edit it the moment their workspace membership was
 * changed to readonly -- while the database went on accepting their writes.
 *
 * So ownership is a floor, never a ceiling: it can only ever grant. The
 * existing workspace-derived capability is kept exactly as it was for
 * non-owners, and nothing here can take an edit right away from anyone who
 * had one before.
 *
 * This is UX only. RLS and the source-reference authorization remain the
 * boundary, and they are unchanged: this decides what to OFFER, never what is
 * permitted.
 */

/** The minimum of a loaded board row this decision reads. */
export interface BoardOwnershipRow {
  readonly user_id?: string | null;
}

/**
 * Is the signed-in user the owner of the loaded board?
 *
 * Fails closed in every unresolved case. Both ids must be present, non-empty
 * strings before they are compared -- otherwise a board that has not loaded
 * yet, or a session that has not resolved, would compare `undefined` with
 * `undefined` and hand out ownership of a board nobody has read.
 */
export function isBoardOwner(
  userId: string | null | undefined,
  board: BoardOwnershipRow | null | undefined,
): boolean {
  const ownerId = board?.user_id;
  if (typeof userId !== 'string' || userId.length === 0) return false;
  if (typeof ownerId !== 'string' || ownerId.length === 0) return false;
  return ownerId === userId;
}

/**
 * The board's canonical edit capability: the one answer every board-edit
 * control in the canvas UI is derived from.
 *
 * `isBoardOwner(...) || canEditWorkspace(...)` -- the second half is the
 * pre-existing live non-owner authority, preserved verbatim. No collaborator
 * lookup is invented here: `board_collaborators` has no live writers and no
 * resolved client state, so wiring one would be dead weight rather than a
 * permission.
 */
export function canEditBoard(input: {
  readonly userId: string | null | undefined;
  readonly board: BoardOwnershipRow | null | undefined;
  readonly workspaceRole: WorkspaceRole | null | undefined;
}): boolean {
  return isBoardOwner(input.userId, input.board) || canEditWorkspace(input.workspaceRole);
}
