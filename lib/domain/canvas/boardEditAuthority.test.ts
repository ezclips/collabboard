import { describe, expect, it } from 'vitest';
import {
  canEditBoard,
  isBoardEditorCollaborator,
  isBoardOwner,
  type BoardCollaboratorAuthority,
} from './boardEditAuthority';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_SCOPE_FIX_1.
 *
 * The exact authority CanvasClient resolves, exercised directly. The
 * controller passes `user?.id`, the route's board id, the loaded board row and
 * the stamped collaborator answer into this function to derive
 * `canSavePdfSelectionAsNote` -- the PDF selection save gate, and the only
 * consumer of this rule -- so these cases are that gate's cases.
 *
 * The matrix below IS the backend rule for padlets / board_sections /
 * source references:
 *
 *   boards.user_id = auth.uid()
 *   OR board_collaborators(user_id = auth.uid(), role = 'editor')
 *
 * Workspace role is not a parameter here because it is not a term there.
 */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const BOARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_BOARD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A resolved collaborator answer for this user on this board. */
function authority(
  userId: string,
  boardId: string,
  role: BoardCollaboratorAuthority['role'],
): BoardCollaboratorAuthority {
  return { userId, boardId, role };
}

/** The board row as the canvas read returns it. */
function boardOwnedBy(ownerId: string, id = BOARD) {
  return { id, user_id: ownerId };
}

describe('backend parity matrix: who may edit this board', () => {
  it('A: the board owner -- regardless of any workspace standing', () => {
    // The live write policy authorises `boards.user_id = auth.uid()` without
    // consulting workspace membership at all. An owner whose workspace role
    // is later downgraded to readonly still owns the board, and the database
    // still accepts their writes: a UI that refused here contradicted it.
    expect(isBoardOwner(A, BOARD, boardOwnedBy(A))).toBe(true);
    expect(canEditBoard({
      userId: A,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: null,
    })).toBe(true);
    // ...and still true once their (irrelevant) collaborator answer arrives.
    expect(canEditBoard({
      userId: A,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: authority(A, BOARD, null),
    })).toBe(true);
  });

  it('B: a non-owner with NO collaborator row may not edit', () => {
    // The accepted MEDIUM finding. This user may be a perfectly ordinary
    // editable workspace member -- an admin, even. The board-content write
    // policies do not have a workspace-membership branch, so neither does
    // this. There is no input here that could express one.
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: authority(B, BOARD, null),
    })).toBe(false);
  });

  it('C: a non-owner with an editor collaborator row MAY edit', () => {
    expect(isBoardEditorCollaborator(B, BOARD, authority(B, BOARD, 'editor'))).toBe(true);
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: authority(B, BOARD, 'editor'),
    })).toBe(true);
  });

  it('D: a viewer or commenter collaborator may not edit', () => {
    // `board_collaborators.role` is 'editor' | 'viewer' | 'commenter'; the
    // write policies name 'editor' alone.
    for (const role of ['viewer', 'commenter'] as const) {
      expect(canEditBoard({
        userId: B,
        boardId: BOARD,
        board: boardOwnedBy(A),
        collaboratorAuthority: authority(B, BOARD, role),
      })).toBe(false);
    }
  });

  it('E: an unauthenticated visitor may not edit', () => {
    for (const userId of [null, undefined, ''] as const) {
      expect(canEditBoard({
        userId,
        boardId: BOARD,
        board: boardOwnedBy(A),
        collaboratorAuthority: authority(A, BOARD, 'editor'),
      })).toBe(false);
    }
  });

  it('F: an unresolved identity may not edit', () => {
    // The whole previous session is still in state -- their board, their
    // resolved editor role. Neither may answer for a user who is not there.
    expect(canEditBoard({
      userId: undefined,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: authority(A, BOARD, 'editor'),
    })).toBe(false);
    expect(isBoardOwner(undefined, BOARD, boardOwnedBy(A))).toBe(false);
    expect(isBoardEditorCollaborator(undefined, BOARD, authority(A, BOARD, 'editor'))).toBe(false);
  });

  it('G: an unresolved board authority may not edit', () => {
    // Non-owner, collaborator answer not yet back. Fail closed until it is:
    // `null` authority is a not-yet, and a not-yet is not a grant.
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: null,
    })).toBe(false);
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: undefined,
    })).toBe(false);
    // An unresolved BOARD ROW denies the ownership half just as firmly.
    for (const board of [null, undefined, {}, { id: BOARD }, { id: BOARD, user_id: null }] as const) {
      expect(canEditBoard({ userId: A, boardId: BOARD, board, collaboratorAuthority: null })).toBe(false);
    }
    // ...and an unresolved board id denies everything.
    for (const boardId of [null, undefined, ''] as const) {
      expect(canEditBoard({
        userId: A,
        boardId,
        board: boardOwnedBy(A),
        collaboratorAuthority: authority(A, BOARD, 'editor'),
      })).toBe(false);
    }
  });

  it("H: user A's cached authority does not answer for user B", () => {
    // The account switched. Until B's own answer lands, A's editor role and
    // A's ownership are facts about A, and are ignored.
    const aWasEditor = authority(A, BOARD, 'editor');
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: aWasEditor,
    })).toBe(false);
    expect(isBoardEditorCollaborator(B, BOARD, aWasEditor)).toBe(false);
    // A owning the board grants B nothing either.
    expect(isBoardOwner(B, BOARD, boardOwnedBy(A))).toBe(false);
  });

  it("I: board A's cached authority does not answer for board B", () => {
    // Navigated to another board. The previous board's editor role and the
    // previous board's row both still sit in state.
    const editorOnOtherBoard = authority(B, OTHER_BOARD, 'editor');
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(B, OTHER_BOARD),
      collaboratorAuthority: editorOnOtherBoard,
    })).toBe(false);
    expect(isBoardEditorCollaborator(B, BOARD, editorOnOtherBoard)).toBe(false);
    // Owning the PREVIOUS board is not owning this one.
    expect(isBoardOwner(B, BOARD, boardOwnedBy(B, OTHER_BOARD))).toBe(false);
  });

  it('J: once B resolves as an editor on this board, B may edit', () => {
    expect(canEditBoard({
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: authority(B, BOARD, 'editor'),
    })).toBe(true);
  });
});

describe('workspace role is not an input to this decision', () => {
  it('the signature admits no workspace term at all', () => {
    // Structural, not incidental: there is no key to pass a workspace role
    // through, so no future caller can reintroduce the substitution without
    // changing the contract deliberately.
    const editorOnThisBoard = {
      userId: B,
      boardId: BOARD,
      board: boardOwnedBy(A),
      collaboratorAuthority: authority(B, BOARD, 'editor'),
    };
    expect(Object.keys(editorOnThisBoard).sort())
      .toEqual(['board', 'boardId', 'collaboratorAuthority', 'userId']);
    expect(canEditBoard(editorOnThisBoard)).toBe(true);
  });

  it('the two halves are independent: neither can revoke the other', () => {
    // Ownership does not need a collaborator row...
    expect(canEditBoard({
      userId: A, boardId: BOARD, board: boardOwnedBy(A),
      collaboratorAuthority: authority(A, BOARD, 'viewer'),
    })).toBe(true);
    // ...and an editor collaborator does not need ownership.
    expect(canEditBoard({
      userId: B, boardId: BOARD, board: boardOwnedBy(A),
      collaboratorAuthority: authority(B, BOARD, 'editor'),
    })).toBe(true);
  });
});

describe('the account-switch transition, in order', () => {
  it('A owns the board, B takes over the session, B resolves as an editor', () => {
    const board = boardOwnedBy(A);
    const step = (userId: string | null, collaboratorAuthority: BoardCollaboratorAuthority | null) =>
      canEditBoard({ userId, boardId: BOARD, board, collaboratorAuthority });

    // A is signed in and owns this board.
    expect(step(A, null)).toBe(true);
    expect(step(A, authority(A, BOARD, null))).toBe(true);
    // A signs out. The board row and A's answer linger for a render; the
    // identity does not, and every board mutation capability goes with it.
    expect(step(null, authority(A, BOARD, null))).toBe(false);
    // B signs in. Before B's board authority resolves -- and while A's is
    // still the value sitting in state -- B may not edit.
    expect(step(B, authority(A, BOARD, 'editor'))).toBe(false);
    expect(step(B, null)).toBe(false);
    // B resolves with no collaborator row: still denied.
    expect(step(B, authority(B, BOARD, null))).toBe(false);
    // B resolves as a viewer: still denied.
    expect(step(B, authority(B, BOARD, 'viewer'))).toBe(false);
    // B resolves as an editor: now, and only now, granted.
    expect(step(B, authority(B, BOARD, 'editor'))).toBe(true);
  });
});
