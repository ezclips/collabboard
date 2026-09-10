import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_2 governance seam.
 *
 * One capability decides who may change this board, and every board-level
 * mutation surface is derived from it. This suite is the census: it pins the
 * consumers that were converted, and catches a future surface that goes back
 * to asking the workspace role directly.
 *
 * Line comments only, as the sibling suites do -- a block-comment strip would
 * swallow JSX and turn every "not found" assertion into a false pass.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const settingsModal = sourceOf('components/collabboard/canvas/ui/CanvasSettingsModal.tsx');
const authority = sourceOf('lib/domain/canvas/boardEditAuthority.ts');

/**
 * The board surface, as far as board-level mutation gating is concerned.
 * Workspace administration screens (members, collections, sharing) are a
 * different question and are deliberately not in this list.
 */
const BOARD_SURFACE = [
  'app/dashboard/canvas/[id]/CanvasClient.tsx',
  'components/collabboard/canvas/ui/CanvasSettingsModal.tsx',
  'components/collabboard/canvas/layouts/DrawingLayout.tsx',
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
] as const;

describe('one board-edit capability, wired everywhere it decides a mutation', () => {
  it('the shell resolves it once, and never per feature', () => {
    expect(canvasClient).toContain('const canEditCurrentBoard = canEditBoard({');
    expect(canvasClient).toContain('const canUseFreeformEditButton = canEditCurrentBoard;');
    expect(canvasClient).toContain('const canUseCanvasToolbar = canUseFreeformEditButton;');
    // Exactly one call: no surface recomputes `owner || workspaceEditable`.
    expect(canvasClient.match(/canEditBoard\(/g) ?? []).toHaveLength(1);
    expect(canvasClient.match(/isBoardOwner\(/g) ?? []).toHaveLength(0);
  });

  it('identity is required before either half is consulted', () => {
    expect(authority).toContain("if (typeof input.userId !== 'string' || input.userId.length === 0) return false;");
    const body = authority.slice(authority.indexOf('export function canEditBoard('));
    // The guard comes first, so no stale role can answer for a missing user.
    expect(body.indexOf('input.userId.length === 0'))
      .toBeLessThan(body.indexOf('canEditWorkspace(input.workspaceRole)'));
  });

  it('Drawing asks the board, not the workspace', () => {
    expect(canvasClient).toContain('readOnly={!canEditCurrentBoard}');
    expect(canvasClient).not.toContain("readOnly={currentWorkspaceRole === 'readonly'}");
  });

  it('Map section management and ordering ask the board', () => {
    expect(canvasClient).toContain('canManageSections={canEditCurrentBoard}');
    expect(canvasClient).toContain('canReorderPosts={canEditCurrentBoard}');
    // The Map mutations beside them were already on the same capability.
    expect(canvasClient).toContain('onDeletePinContainer={canUseFreeformEditButton ?');
  });

  it('Canvas Settings consumes the capability instead of deciding one', () => {
    expect(canvasClient).toContain('canEdit={canEditCurrentBoard}');
    expect(settingsModal).toContain('canEdit: boolean;');
    // It is handed no material to invent an answer from.
    for (const forbidden of ['canEditWorkspace', 'WorkspaceRole', 'currentWorkspaceRole', 'user_id', 'userId']) {
      expect(settingsModal, forbidden).not.toContain(forbidden);
    }
  });

  it('the PDF selection save is one consumer among the rest, not a special case', () => {
    expect(canvasClient).toContain('onSaveSelectionAsNote={canUseFreeformEditButton ? saveKnowledgeSelectionAsNote : undefined}');
    for (const forbidden of ['canSavePdfSelection', 'ownerException', 'isOwnerOverride']) {
      expect(canvasClient, forbidden).not.toContain(forbidden);
    }
  });

  it('census: no board-level mutation surface gates on workspace role directly', () => {
    for (const path of BOARD_SURFACE) {
      const source = sourceOf(path);
      // `canEditWorkspace` is the workspace EDIT predicate: legitimate for
      // workspace administration, never for a board mutation. Workspace
      // ADMIN checks (`canManageWorkspace`) are a different question and stay.
      expect(source, `${path} must not derive board edits from workspace role`)
        .not.toContain('canEditWorkspace(');
      expect(source, `${path} must not test the readonly role directly`)
        .not.toContain("currentWorkspaceRole === 'readonly'");
    }
  });

  it('census: workspace administration keeps its own authority', () => {
    // Deliberately unchanged -- sharing a canvas is a workspace act, not a
    // board mutation, and board ownership must not confer it.
    expect(canvasClient).toContain('const canManageCanvasShare = canManageWorkspace(currentWorkspaceRole);');
    // Comment access stays on its own resolved tier model (manage/comment/
    // read), which is not a board-edit boolean and is out of scope here.
    expect(canvasClient).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
  });

  it('the capability is UX only: it reaches for nothing the server owns', () => {
    for (const forbidden of ['supabase', 'fetch(', 'rpc(', 'service_role', 'process.env']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });
});
