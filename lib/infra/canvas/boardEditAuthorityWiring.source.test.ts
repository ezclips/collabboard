import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_SCOPE_FIX_1 governance seam.
 *
 * The board-scoped authority exists for ONE feature: saving a PDF selection as
 * a Note. This suite is the fence around it, and it has two halves:
 *
 *   1. the capability really is derived from the board (ownership OR an
 *      editor collaborator row), matching the padlets/source-reference write
 *      policies that the save actually goes through; and
 *
 *   2. it reaches every padlets-backed board CONTENT mutation -- ordinary Note
 *      create/edit/delete and the PDF selection save -- and nothing beyond
 *      them. Canvas Settings, Map, Drawing and the graph write through other
 *      tables with other policies (`boards_update` is owner-only; the graph
 *      tables have their own `can_edit_board`), so each keeps the authority it
 *      already had. An earlier pass propagated this capability to those too
 *      and offered writes their backends refuse; half 2b is what stops that.
 *
 * Half 2 pins the pre-existing wiring verbatim. It is NOT a claim that those
 * authorities are correct -- only that this slice did not change them.
 *
 * Line comments only, as the sibling suites do -- a block-comment strip would
 * swallow JSX and turn every "not found" assertion into a false pass.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** SQL, with its own `--` comments stripped, whitespace-collapsed. */
function policyOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .replace(/\s+/g, ' ');
}

const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
const settingsModal = sourceOf('components/collabboard/canvas/ui/CanvasSettingsModal.tsx');
const authority = sourceOf('lib/domain/canvas/boardEditAuthority.ts');
const viewReads = sourceOf('lib/infra/canvas/canvasViewReads.ts');
const collaboratorHook = sourceOf('components/collabboard/canvas/hooks/useBoardCollaboratorAuthority.ts');

// ============================================================================
// Half 1 -- the capability mirrors the policy the PDF save writes through
// ============================================================================

describe('the PDF save capability encodes the rule its own write is judged by', () => {
  const padletPolicy = policyOf('supabase/migrations/20260706_fix_blanket_permissive_policies.sql');

  it('the padlets write rule is ownership OR an editor collaborator', () => {
    // The save inserts a padlet. This is the policy that decides whether the
    // insert is accepted, read straight out of the migration.
    expect(padletPolicy).toContain('SELECT id FROM boards WHERE user_id = auth.uid()');
    expect(padletPolicy).toMatch(
      /SELECT board_id FROM board_collaborators WHERE user_id = auth\.uid\(\) AND role = 'editor'/,
    );
  });

  it('that write rule has NO workspace-membership branch', () => {
    for (const forbidden of ['workspace_members', 'workspace_id', 'workspaces']) {
      expect(padletPolicy, forbidden).not.toContain(forbidden);
    }
  });

  it('the frontend capability names those same two terms and nothing else', () => {
    expect(authority).toContain('board.user_id === userId');
    // 'editor' exactly -- neither 'viewer' nor 'commenter', the other two
    // values the CHECK constraint allows, may grant.
    expect(authority).toContain("authority.role === 'editor'");
    expect(authority).toContain("export type BoardCollaboratorRole = 'editor' | 'viewer' | 'commenter';");
    for (const forbidden of ['canEditWorkspace', 'WorkspaceRole', 'workspaceRole', '@/lib/workspace/context']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });

  it('the collaborator read is scoped to THIS user and THIS board', () => {
    expect(viewReads).toContain("from('board_collaborators')");
    expect(viewReads).toContain(".eq('board_id', boardId)");
    expect(viewReads).toContain(".eq('user_id', userId)");
    expect(viewReads).toContain('.maybeSingle()');
  });

  it('the capability is UX only: it reaches for nothing the server owns', () => {
    for (const forbidden of ['supabase', 'fetch(', 'rpc(', 'service_role', 'process.env']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });
});

// ============================================================================
// Half 1b -- fail closed on identity and on board
// ============================================================================

describe('cached authority never outlives the identity or board it names', () => {
  it('identity is required before either half is consulted', () => {
    expect(authority).toContain('if (!isId(input.userId) || !isId(input.boardId)) return false;');
    const body = authority.slice(authority.indexOf('export function canEditBoard('));
    expect(body.indexOf('isId(input.userId)')).toBeLessThan(body.indexOf('isBoardOwner('));
  });

  it('every board-scoped fact is stamped with whose and which board it is', () => {
    // This -- not the effect's timing -- is what makes an account or board
    // switch fail closed, including when a request from the previous scope
    // completes LATE, after the switch.
    expect(authority).toContain('readonly userId: string | null | undefined;');
    expect(authority).toContain('readonly boardId: string | null | undefined;');
    expect(authority).toContain('if (authority.userId !== userId || authority.boardId !== boardId) return false;');
    expect(authority).toContain('if (!isId(board?.id) || board.id !== boardId) return false;');
    for (const forbidden of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });

  it('the resolution re-runs on identity AND on board, and drops the old answer', () => {
    expect(collaboratorHook).toContain('}, [boardId, userId]);');
    expect(collaboratorHook).toContain('setAuthority(null);');
    // A late completion from a superseded scope is discarded by the cleanup
    // flag, before it can reach state at all.
    expect(collaboratorHook).toContain('if (cancelled) return;');
    expect(collaboratorHook).toContain('cancelled = true;');
    // A failed read stays UNRESOLVED rather than resolving to "no role".
    expect(collaboratorHook).toContain('if (!result.ok) {');
  });
});

// ============================================================================
// Half 2 -- the fence: this capability gates the PDF save and nothing else
// ============================================================================

describe('ONE capability governs every board Note mutation', () => {
  it('it is resolved once, under a name that says what it governs', () => {
    expect(canvasClient).toContain('const canEditCurrentBoard = canEditBoard({');
    expect(canvasClient).toContain('boardId: canvasId,');
    expect(canvasClient).toContain('collaboratorAuthority: boardCollaboratorAuthority,');
    // Exactly one derivation. The earlier PDF-only alias is gone, not aliased.
    expect(canvasClient.match(/canEditBoard\(/g) ?? []).toHaveLength(1);
    expect(canvasClient).not.toContain('canSavePdfSelectionAsNote');
    expect(canvasClient.match(/isBoardOwner\(/g) ?? []).toHaveLength(0);
  });

  it('ordinary post/Note mutation reads it -- not the workspace role', () => {
    // The defect this closes: these two answered the same question differently,
    // so a board owner with a readonly workspace role could save a PDF
    // selection as a Note while the ordinary Note controls vanished.
    expect(canvasClient).toContain('const canUseFreeformEditButton = canEditCurrentBoard;');
    expect(canvasClient).toContain('const canUseCanvasToolbar = canUseFreeformEditButton;');
    expect(canvasClient).not.toContain('const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);');
  });

  it('the PDF selection save reads the SAME capability', () => {
    expect(canvasClient).toContain('onSaveSelectionAsNote={canEditCurrentBoard ? saveKnowledgeSelectionAsNote : undefined}');
    expect(canvasClient).toContain("if (!canvasId || !canEditCurrentBoard) throw new Error('note_save_not_allowed');");
  });

  it('ordinary Note create / edit / delete all hang off that one answer', () => {
    // Create (the toolbar), edit (the mutation-capable editor route) and the
    // editable surfaces that own delete.
    expect(canvasClient).toContain('isEditable={canUseFreeformEditButton}');
    expect(canvasClient).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    expect(canvasClient).toContain('canEditPosts={canUseFreeformEditButton}');
  });
});

describe('every unrelated mutation authority is untouched by this slice', () => {
  it('the toolbar follows Note creation, because it IS Note creation', () => {
    // It moved with the post mutations deliberately: a user who may write a
    // Note must be able to reach the control that creates one.
    expect(canvasClient).toContain('const canUseCanvasToolbar = canUseFreeformEditButton;');
  });

  it('Canvas Settings keeps its own workspace-role authority', () => {
    // MEDIUM 1: `boards_update` is owner-only, so a collaborator editor must
    // not be offered board title / layout / wallpaper / comment settings.
    expect(canvasClient).toContain('currentWorkspaceRole={currentWorkspaceRole}');
    expect(canvasClient).not.toContain('canEdit={canSavePdfSelectionAsNote}');
    expect(settingsModal).toContain('currentWorkspaceRole: WorkspaceRole | null;');
    expect(settingsModal).toContain('const canEdit = canEditWorkspace(currentWorkspaceRole);');
    expect(settingsModal).not.toContain('canEdit: boolean;');
  });

  it('Map section management and ordering keep theirs', () => {
    expect(canvasClient).toContain('canManageSections={canEditWorkspace(currentWorkspaceRole)}');
    expect(canvasClient).toContain('canReorderPosts={canEditWorkspace(currentWorkspaceRole)}');
  });

  it('Drawing keeps its readonly-role test', () => {
    expect(canvasClient).toContain("readOnly={currentWorkspaceRole === 'readonly'}");
    expect(canvasClient).not.toContain('readOnly={!canSavePdfSelectionAsNote}');
  });

  it('Freeform Graph keeps its own authority', () => {
    // MEDIUM 2: the graph tables authorise through their own
    // `can_edit_board`, which does not recognise this boards /
    // board_collaborators model. The capability must not appear near them.
    const graphUse = canvasClient.match(/canSavePdfSelectionAsNote[^\n]*graph/gi) ?? [];
    expect(graphUse).toHaveLength(0);
  });

  it('Share / admin keeps workspace administration authority', () => {
    expect(canvasClient).toContain('const canManageCanvasShare = canManageWorkspace(currentWorkspaceRole);');
  });

  it('the comment model is untouched', () => {
    expect(canvasClient).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
  });
});
