import { describe, expect, it, vi } from 'vitest';
import { canEditBoard, isBoardOwner, type BoardCollaboratorAuthority } from './boardEditAuthority';
import { canEditWorkspace, type WorkspaceRole } from '@/lib/workspace/context';

/**
 * PDF_SELECTION_TO_NOTE_PERMISSION_SPLIT_3 -- one authority per POLICY.
 *
 * The defect this closes: two frontend authorities answered the same question.
 * Ordinary Note create/edit/delete asked `canEditWorkspace(role)`, while the
 * PDF selection's Save as Note asked the board itself. A board owner whose
 * workspace membership became readonly could therefore save a PDF selection as
 * a Note while the ordinary Note controls disappeared around it -- one user,
 * one board, two answers, and only one of them matching the database.
 *
 * Both mutations write a `padlets` row under the same policy, so both are
 * modelled here against the SAME capability, with the workspace role varied
 * independently to prove it is not a term.
 */
const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
const VIEWER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';
const BOARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const board = { id: BOARD, user_id: OWNER };

const collaborator = (
  userId: string,
  role: BoardCollaboratorAuthority['role'],
): BoardCollaboratorAuthority => ({ userId, boardId: BOARD, role });

/**
 * CanvasClient's real derivation, in one place.
 *
 * `canEditBoardContent` is the padlets capability the component computes;
 * ordinary Note mutation and the PDF save both read it. The shared canvas
 * aliases are modelled alongside it deliberately -- they answer a DIFFERENT
 * question, for surfaces backed by `boards` and by the graph tables, and the
 * suite below exists to keep the two from collapsing into one again.
 */
function canvasClientAuthority(input: {
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
  readonly workspaceRole: WorkspaceRole | null;
}) {
  // The padlets capability.
  const canEditBoardContent = canEditBoard({
    userId: input.userId,
    boardId: BOARD,
    board,
    collaboratorAuthority: input.collaboratorAuthority,
  });
  // The shared canvas aliases, which carry surfaces backed by `boards`
  // (owner-only) and by the graph tables (their own can_edit_board).
  const canUseFreeformEditButton = canEditWorkspace(input.workspaceRole);
  const canUseCanvasToolbar = canUseFreeformEditButton;

  // The board ROW's own authority. `boards_update` names ownership and nothing
  // else -- an editor collaborator row authorises padlets, never the board.
  const canManageBoardSettings = isBoardOwner(input.userId, BOARD, board);

  return {
    // padlets writes
    ordinaryNoteMutation: canEditBoardContent,
    selectionSaveAsNote: canEditBoardContent,
    // boards writes
    setAsCover: canManageBoardSettings,
    // NOT padlets: each reached only through the toolbar alias. Set as cover
    // is deliberately NOT here -- CORRECTION_3 found that it never went
    // through the toolbar at all, and it has its own owner authority above.
    mapStyle: canUseCanvasToolbar,
    freeformBackground: canUseCanvasToolbar,
    graphLine: canUseCanvasToolbar,
    workspaceEdit: canEditWorkspace(input.workspaceRole),
  };
}

const MATRIX: ReadonlyArray<{
  readonly name: string;
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
  readonly workspaceRole: WorkspaceRole | null;
  readonly expected: boolean;
}> = [
  { name: 'A. board owner + workspace edit', userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'member', expected: true },
  { name: 'B. board owner + workspace READONLY', userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'readonly', expected: true },
  { name: 'C. board editor collaborator + workspace edit', userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor'), workspaceRole: 'member', expected: true },
  { name: 'D. board editor collaborator + workspace READONLY', userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor'), workspaceRole: 'readonly', expected: true },
  { name: 'E. board viewer + workspace EDIT', userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'member', expected: false },
  { name: 'F. board viewer + workspace readonly', userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'readonly', expected: false },
  { name: 'G. unrelated user', userId: STRANGER, collaboratorAuthority: collaborator(STRANGER, null), workspaceRole: 'member', expected: false },
];

describe('one authority governs every board Note mutation', () => {
  for (const row of MATRIX) {
    it(`${row.name} -> ${row.expected ? 'may edit' : 'may not edit'}`, () => {
      const authority = canvasClientAuthority(row);
      // The padlets surfaces share one answer, and it is the board's.
      expect(authority.ordinaryNoteMutation, 'ordinary Note mutation').toBe(row.expected);
      expect(authority.selectionSaveAsNote, 'selection -> Note').toBe(row.expected);
      expect(authority.ordinaryNoteMutation).toBe(authority.selectionSaveAsNote);
    });
  }

  it('the two surfaces can never disagree, across the whole matrix', () => {
    for (const row of MATRIX) {
      const a = canvasClientAuthority(row);
      expect(a.ordinaryNoteMutation, row.name).toBe(a.selectionSaveAsNote);
    }
  });
});

describe('workspace role is not the board mutation authority', () => {
  it('a board owner keeps both Note surfaces when workspace goes readonly', () => {
    // The reviewer reproduction, as a transition.
    const editable = canvasClientAuthority({ userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'member' });
    expect(editable.ordinaryNoteMutation).toBe(true);
    expect(editable.selectionSaveAsNote).toBe(true);

    const readonly = canvasClientAuthority({ userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'readonly' });
    // Workspace says no...
    expect(readonly.workspaceEdit).toBe(false);
    // ...and the board still says yes, for BOTH surfaces, because the database
    // still accepts this owner's writes.
    expect(readonly.ordinaryNoteMutation).toBe(true);
    expect(readonly.selectionSaveAsNote).toBe(true);
  });

  it('workspace edit does not let a board VIEWER write either surface', () => {
    const viewer = canvasClientAuthority({ userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'member' });
    // Workspace says yes...
    expect(viewer.workspaceEdit).toBe(true);
    // ...and the board says no, which is the answer that counts.
    expect(viewer.ordinaryNoteMutation).toBe(false);
    expect(viewer.selectionSaveAsNote).toBe(false);
  });

  it('an unresolved identity or board authority denies both surfaces', () => {
    for (const unresolved of [
      { userId: null, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'member' as const },
      { userId: EDITOR, collaboratorAuthority: null, workspaceRole: 'member' as const },
    ]) {
      const authority = canvasClientAuthority(unresolved);
      expect(authority.ordinaryNoteMutation).toBe(false);
      expect(authority.selectionSaveAsNote).toBe(false);
    }
  });
});

// ============================================================================
// SPLIT_3 -- the padlets capability must not leak into other backends
// ============================================================================

/**
 * The regression this closes: giving the shared canvas aliases the padlets
 * capability handed a board_collaborators editor controls whose backends refuse
 * them -- Map style and the freeform background write `boards` (owner-only),
 * and Graph Line writes the freeform graph tables (their own
 * `can_edit_board`). Set as cover writes `boards` too, but reaches the
 * structured layouts by its own route; see the CORRECTION_3 suite below.
 */
describe('board-content authority does not reach other backends', () => {
  const collaboratorEditor = {
    userId: EDITOR,
    collaboratorAuthority: collaborator(EDITOR, 'editor'),
    workspaceRole: 'readonly' as const,
  };

  it('CASE 2: a collaborator editor may write padlets and NOTHING backed by boards', () => {
    const a = canvasClientAuthority(collaboratorEditor);
    // What their policy does authorise.
    expect(a.ordinaryNoteMutation, 'ordinary Note mutation').toBe(true);
    expect(a.selectionSaveAsNote, 'selection -> Note').toBe(true);
    // What it does not. `boards_update` is owner-only; this user is not the
    // owner, so offering these would promise a write the server refuses.
    expect(a.mapStyle, 'Map style').toBe(false);
    expect(a.freeformBackground, 'Freeform background').toBe(false);
    // Set as cover is the same policy but a different route -- it reaches the
    // structured layouts directly, so it has its own suite further down.
    expect(a.setAsCover, 'Set as cover').toBe(false);
    // The graph tables have their own can_edit_board, which does not read
    // board_collaborators.
    expect(a.graphLine, 'Graph Line').toBe(false);
  });

  it('the two capabilities are genuinely independent, not one renamed', () => {
    // A case where they disagree in each direction proves the split is real.
    const ownerReadonly = canvasClientAuthority({
      userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'readonly',
    });
    expect(ownerReadonly.ordinaryNoteMutation).toBe(true);
    expect(ownerReadonly.mapStyle).toBe(false);

    const viewerWithWorkspaceEdit = canvasClientAuthority({
      userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'member',
    });
    expect(viewerWithWorkspaceEdit.ordinaryNoteMutation).toBe(false);
    expect(viewerWithWorkspaceEdit.mapStyle).toBe(true);
  });

  it('CASE 5: unresolved authority fails closed on the padlets surfaces', () => {
    for (const unresolved of [
      { userId: null, collaboratorAuthority: collaborator(EDITOR, 'editor'), workspaceRole: 'member' as const },
      { userId: EDITOR, collaboratorAuthority: null, workspaceRole: 'member' as const },
    ]) {
      const a = canvasClientAuthority(unresolved);
      expect(a.ordinaryNoteMutation).toBe(false);
      expect(a.selectionSaveAsNote).toBe(false);
    }
  });
});

// ============================================================================
// CORRECTION_3 -- Set as cover is the board row's own, owner-only authority
// ============================================================================

/**
 * Set as cover writes `boards`, whose policy names ownership only. Offering it
 * from board-CONTENT authority put an enabled owner-only action in front of
 * every non-owner collaborator editor -- a control whose only possible outcome
 * is the server refusing it.
 *
 * The matrix below is the whole contract: content and cover answered
 * separately, for the same five viewers, with the workspace role varied
 * independently to prove it is a term in neither.
 */
const COVER_MATRIX: ReadonlyArray<{
  readonly name: string;
  readonly userId: string | null;
  readonly collaboratorAuthority: BoardCollaboratorAuthority | null;
  readonly workspaceRole: WorkspaceRole | null;
  readonly content: boolean;
  readonly cover: boolean;
}> = [
  { name: 'A. board OWNER + workspace readonly', userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'readonly', content: true, cover: true },
  { name: 'B. non-owner collaborator EDITOR + workspace readonly', userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor'), workspaceRole: 'readonly', content: true, cover: false },
  { name: 'C. non-owner collaborator EDITOR + workspace edit', userId: EDITOR, collaboratorAuthority: collaborator(EDITOR, 'editor'), workspaceRole: 'member', content: true, cover: false },
  { name: 'D. board VIEWER', userId: VIEWER, collaboratorAuthority: collaborator(VIEWER, 'viewer'), workspaceRole: 'member', content: false, cover: false },
  { name: 'E. board OWNER + workspace edit', userId: OWNER, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'member', content: true, cover: true },
];

describe('Set as cover answers to ownership, board content does not', () => {
  for (const row of COVER_MATRIX) {
    it(`${row.name} -> content ${row.content ? 'ALLOWED' : 'BLOCKED'}, cover ${row.cover ? 'ALLOWED' : 'BLOCKED'}`, () => {
      const a = canvasClientAuthority(row);
      expect(a.ordinaryNoteMutation, 'ordinary board-content edit').toBe(row.content);
      expect(a.selectionSaveAsNote, 'selection -> Note').toBe(row.content);
      expect(a.setAsCover, 'Set as cover').toBe(row.cover);
    });
  }

  it('cover is strictly narrower than content -- never the other way round', () => {
    // Every viewer who may set the cover may also edit content. The reverse
    // fails for exactly the reported case, which is the point of the split.
    for (const row of COVER_MATRIX) {
      const a = canvasClientAuthority(row);
      if (a.setAsCover) expect(a.ordinaryNoteMutation, row.name).toBe(true);
    }
    const editor = canvasClientAuthority(COVER_MATRIX[1]);
    expect(editor.ordinaryNoteMutation).toBe(true);
    expect(editor.setAsCover).toBe(false);
  });

  it('cover is not the toolbar/workspace authority either', () => {
    // A collaborator editor with workspace edit has BOTH content authority and
    // the workspace role, and still may not set the cover. Neither predicate
    // beside it is a stand-in for ownership.
    const a = canvasClientAuthority(COVER_MATRIX[2]);
    expect(a.workspaceEdit).toBe(true);
    expect(a.mapStyle).toBe(true);
    expect(a.ordinaryNoteMutation).toBe(true);
    expect(a.setAsCover).toBe(false);
  });

  it('an unresolved identity denies the cover, as it denies everything else', () => {
    for (const unresolved of [
      { userId: null, collaboratorAuthority: collaborator(OWNER, null), workspaceRole: 'member' as const },
      { userId: STRANGER, collaboratorAuthority: null, workspaceRole: 'member' as const },
    ]) {
      expect(canvasClientAuthority(unresolved).setAsCover).toBe(false);
    }
  });
});

describe('the cover callback fails closed, not only the affordance', () => {
  /**
   * CanvasClient's guard, modelled: the mutation refuses before it reaches the
   * command, so a stale closure or a second caller cannot route around the
   * missing menu item.
   */
  function setAsPadletCover(
    viewer: Parameters<typeof canvasClientAuthority>[0],
    issue: () => void,
  ): 'refused' | 'issued' {
    const { setAsCover: canManageBoardSettings } = canvasClientAuthority(viewer);
    if (!canManageBoardSettings) return 'refused';
    issue();
    return 'issued';
  }

  it('a non-owner collaborator editor cannot issue the write even when called directly', () => {
    const issue = vi.fn();
    expect(setAsPadletCover(COVER_MATRIX[1], issue)).toBe('refused');
    expect(setAsPadletCover(COVER_MATRIX[2], issue)).toBe('refused');
    expect(issue).not.toHaveBeenCalled();
  });

  it('a board viewer cannot either', () => {
    const issue = vi.fn();
    expect(setAsPadletCover(COVER_MATRIX[3], issue)).toBe('refused');
    expect(issue).not.toHaveBeenCalled();
  });

  it('the owner still can, including with a readonly workspace role', () => {
    const issue = vi.fn();
    expect(setAsPadletCover(COVER_MATRIX[0], issue)).toBe('issued');
    expect(setAsPadletCover(COVER_MATRIX[4], issue)).toBe('issued');
    expect(issue).toHaveBeenCalledTimes(2);
  });
});
