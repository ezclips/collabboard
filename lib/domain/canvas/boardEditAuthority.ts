/**
 * Who may edit THIS board, as the frontend is entitled to believe.
 *
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_2.
 *
 * The backend rule for shared board content -- padlets, board_sections, and
 * the source references that hang off them -- is board-scoped and reads
 * exactly two facts:
 *
 *   board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
 *   OR board_id IN (SELECT board_id FROM board_collaborators
 *                   WHERE user_id = auth.uid() AND role = 'editor')
 *
 * (20260706_fix_blanket_permissive_policies.sql for padlets,
 * 120260710_fix_board_sections_wrong_table_rls.sql for board_sections.)
 *
 * Workspace role appears nowhere in it. A UI that granted board edits because
 * the signed-in user's WORKSPACE role happened to be editable therefore
 * offered mutation controls to workspace members the database goes on to
 * reject -- and the same substitution made a stale workspace role from a
 * previous account briefly answer for the current one. Both are the same
 * defect: an answer to a different question standing in for this one.
 *
 * So this module consumes board-scoped facts only, and every fact it consumes
 * is stamped with WHOSE it is and WHICH BOARD it describes. A fact that does
 * not name the current user and the current board is not a weaker fact, it is
 * a fact about somebody else -- it is ignored, and the answer fails closed
 * until the real one resolves.
 *
 * This is UX only. RLS and the source-reference authorization remain the
 * boundary, and they are unchanged: this decides what to OFFER, never what is
 * permitted. Its job is to stop the UI offering what the server will refuse.
 */

/** `board_collaborators.role` -- the CHECK constraint's full domain. */
export type BoardCollaboratorRole = 'editor' | 'viewer' | 'commenter';

/** The minimum of a loaded board row this decision reads. */
export interface BoardOwnershipRow {
  readonly id?: string | null;
  readonly user_id?: string | null;
}

/**
 * A RESOLVED `board_collaborators` answer, stamped with the identity and the
 * board it was resolved for.
 *
 * `role: null` means resolved-and-absent: this user has no collaborator row on
 * this board. The unresolved state is the absence of the whole object, never a
 * null role -- the two must stay distinguishable, because one is a denial and
 * the other is a not-yet.
 */
export interface BoardCollaboratorAuthority {
  readonly userId: string | null | undefined;
  readonly boardId: string | null | undefined;
  readonly role: BoardCollaboratorRole | null;
}

/** A present, non-empty string -- the only shape any id here may take. */
function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Is the signed-in user the owner of the board currently being viewed?
 *
 * The board row is checked against `boardId` before its owner is read. A board
 * row outlives the navigation that fetched it: without this, walking from a
 * board you own to one you do not would hand you the previous board's
 * ownership for as long as the new row took to arrive.
 */
export function isBoardOwner(
  userId: string | null | undefined,
  boardId: string | null | undefined,
  board: BoardOwnershipRow | null | undefined,
): boolean {
  if (!isId(userId) || !isId(boardId)) return false;
  if (!isId(board?.id) || board.id !== boardId) return false;
  return isId(board?.user_id) && board.user_id === userId;
}

/**
 * Does the signed-in user hold an `editor` collaborator role on the board
 * currently being viewed?
 *
 * The stamp is the whole point: an authority resolved for user A, or for board
 * A, answers for A. Here it is not consulted at all.
 */
export function isBoardEditorCollaborator(
  userId: string | null | undefined,
  boardId: string | null | undefined,
  authority: BoardCollaboratorAuthority | null | undefined,
): boolean {
  if (!isId(userId) || !isId(boardId)) return false;
  if (!authority) return false;
  if (authority.userId !== userId || authority.boardId !== boardId) return false;
  return authority.role === 'editor';
}

/**
 * The board's canonical edit capability: the one answer every board-edit
 * control in the canvas UI is derived from.
 *
 * Ownership OR an editor collaborator role, for THIS user on THIS board --
 * the backend rule, and nothing else. Workspace role is not an input, because
 * it is not an input to the policy this mirrors.
 */
export function canEditBoard(input: {
  readonly userId: string | null | undefined;
  readonly boardId: string | null | undefined;
  readonly board: BoardOwnershipRow | null | undefined;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null | undefined;
}): boolean {
  // Authenticated FIRST, and unconditionally. Everything below is cached
  // client state that outlives a session: on logout or an account switch the
  // id goes null while the previous account's board row and collaborator
  // answer are both still sitting in state.
  if (!isId(input.userId) || !isId(input.boardId)) return false;

  return (
    isBoardOwner(input.userId, input.boardId, input.board) ||
    isBoardEditorCollaborator(input.userId, input.boardId, input.collaboratorAuthority)
  );
}
