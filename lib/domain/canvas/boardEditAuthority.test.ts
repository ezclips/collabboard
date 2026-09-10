import { describe, expect, it } from 'vitest';
import { canEditBoard, isBoardOwner } from './boardEditAuthority';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_1.
 *
 * The exact authority CanvasClient resolves, exercised directly. The
 * controller passes `user?.id`, the loaded board row and the resolved
 * workspace role into this function and derives every board-edit gate --
 * including the PDF selection's Save as Note -- from its answer, so these
 * cases are the controller's cases.
 */
const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('who may edit this board', () => {
  it('A: the owner, with an editable workspace role', () => {
    for (const workspaceRole of ['owner', 'admin', 'member'] as const) {
      expect(canEditBoard({ userId: U, board: { user_id: U }, workspaceRole })).toBe(true);
    }
  });

  it('B: the owner, with a READONLY workspace role -- the accepted defect', () => {
    // The board row says this user owns it, and the live write policy
    // authorises `boards.user_id = auth.uid()` without consulting workspace
    // membership at all. A UI that refused here contradicted the database.
    expect(isBoardOwner(U, { user_id: U })).toBe(true);
    expect(canEditBoard({ userId: U, board: { user_id: U }, workspaceRole: 'readonly' })).toBe(true);
  });

  it('C: a non-owner keeps exactly the workspace authority they already had', () => {
    for (const workspaceRole of ['owner', 'admin', 'member'] as const) {
      expect(canEditBoard({ userId: U, board: { user_id: OTHER }, workspaceRole })).toBe(true);
    }
    // Ownership only ever grants: nobody who could edit before can edit less.
    expect(canEditBoard({ userId: U, board: null, workspaceRole: 'member' })).toBe(true);
  });

  it('D: a non-owner with a readonly workspace role may not edit', () => {
    expect(canEditBoard({ userId: U, board: { user_id: OTHER }, workspaceRole: 'readonly' })).toBe(false);
  });

  it('E: nothing unresolved is ever mistaken for ownership', () => {
    // A board that has not loaded, a session that has not resolved, a row
    // with no owner column, and the empty string -- each would compare equal
    // to the other under a naive `===`, and each must fail closed.
    expect(isBoardOwner(undefined, undefined)).toBe(false);
    expect(isBoardOwner(null, null)).toBe(false);
    expect(isBoardOwner(U, null)).toBe(false);
    expect(isBoardOwner(U, {})).toBe(false);
    expect(isBoardOwner(U, { user_id: null })).toBe(false);
    expect(isBoardOwner(undefined, { user_id: U })).toBe(false);
    expect(isBoardOwner('', { user_id: '' })).toBe(false);
    expect(isBoardOwner(undefined, { user_id: undefined })).toBe(false);

    for (const board of [null, undefined, {}, { user_id: null }] as const) {
      expect(canEditBoard({ userId: U, board, workspaceRole: 'readonly' })).toBe(false);
      expect(canEditBoard({ userId: null, board, workspaceRole: 'readonly' })).toBe(false);
    }
  });

  it('F: a different signed-in user gets no ownership override', () => {
    expect(isBoardOwner(OTHER, { user_id: U })).toBe(false);
    expect(canEditBoard({ userId: OTHER, board: { user_id: U }, workspaceRole: 'readonly' })).toBe(false);
    expect(canEditBoard({ userId: OTHER, board: { user_id: U }, workspaceRole: null })).toBe(false);
  });

  it('the two halves are independent: neither can revoke the other', () => {
    // Ownership does not depend on workspace role...
    expect(canEditBoard({ userId: U, board: { user_id: U }, workspaceRole: null })).toBe(true);
    expect(canEditBoard({ userId: U, board: { user_id: U }, workspaceRole: undefined })).toBe(true);
    // ...and workspace edit rights do not depend on ownership.
    expect(canEditBoard({ userId: OTHER, board: { user_id: U }, workspaceRole: 'admin' })).toBe(true);
  });
});

// ============================================================================
// PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_2 -- an unresolved identity denies
// ============================================================================

describe('nobody edits a board without an identity', () => {
  it('E: a null user with a still-editable workspace role may not edit', () => {
    // The role is cached client state. It survives a logout by a render or
    // two, and on its own it used to be enough.
    for (const workspaceRole of ['owner', 'admin', 'member'] as const) {
      expect(canEditBoard({ userId: null, board: null, workspaceRole })).toBe(false);
      expect(canEditBoard({ userId: undefined, board: null, workspaceRole })).toBe(false);
      expect(canEditBoard({ userId: '', board: null, workspaceRole })).toBe(false);
    }
  });

  it('F: a null user with a readonly workspace role may not edit', () => {
    expect(canEditBoard({ userId: null, board: null, workspaceRole: 'readonly' })).toBe(false);
    expect(canEditBoard({ userId: null, board: null, workspaceRole: null })).toBe(false);
  });

  it('G: a null user with the previous owner\'s board still loaded may not edit', () => {
    // The signed-out session's board row is still in state, and it names the
    // person who just left. Neither half may answer for them.
    expect(canEditBoard({ userId: null, board: { user_id: U }, workspaceRole: 'member' })).toBe(false);
    expect(canEditBoard({ userId: null, board: { user_id: U }, workspaceRole: 'readonly' })).toBe(false);
    expect(canEditBoard({ userId: undefined, board: { user_id: U }, workspaceRole: 'admin' })).toBe(false);
  });

  it('the whole logout transition, in order', () => {
    // Signed in, owner of this board, workspace membership downgraded to
    // readonly: still an editor, because the database still says so.
    const board = { user_id: U };
    expect(canEditBoard({ userId: U, board, workspaceRole: 'member' })).toBe(true);
    expect(canEditBoard({ userId: U, board, workspaceRole: 'readonly' })).toBe(true);
    // Signs out. The role and the board row linger for a render; the identity
    // does not. Every board mutation capability goes with it.
    expect(canEditBoard({ userId: null, board, workspaceRole: 'readonly' })).toBe(false);
    expect(canEditBoard({ userId: null, board, workspaceRole: 'member' })).toBe(false);
    // A different account signs in before the board row is refetched.
    expect(canEditBoard({ userId: OTHER, board, workspaceRole: 'readonly' })).toBe(false);
    // ...and that account's own workspace rights still work normally.
    expect(canEditBoard({ userId: OTHER, board, workspaceRole: 'member' })).toBe(true);
  });

  it('H: an authenticated non-owner with a readonly role is denied', () => {
    expect(canEditBoard({ userId: OTHER, board: { user_id: U }, workspaceRole: 'readonly' })).toBe(false);
  });
});
