import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF_SELECTION_TO_NOTE_PERMISSION_SPLIT_3 governance seam.
 *
 * `canEditBoardContent` answers ONE question -- may this user write a `padlets`
 * row on this board -- and this suite is the fence around it:
 *
 *   1. the capability really is derived from the board (ownership OR an
 *      editor collaborator row), matching the padlets/source-reference write
 *      policies the save actually goes through; and
 *
 *   2. it reaches the padlets surfaces and stops. The shared canvas aliases
 *      beside it carry surfaces with entirely different backends -- Map style,
 *      the freeform background and Set as cover write `boards`, whose policy is
 *      owner-only, and Graph Line writes the freeform graph tables, which have
 *      their own `can_edit_board`. A previous pass gave those aliases this
 *      capability, which handed a board_collaborators editor four controls
 *      their backends refuse. These assertions are what stops that recurring.
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

describe('the padlets capability is wired to padlets surfaces only', () => {
  it('it is resolved once, named for the policy it answers for', () => {
    expect(canvasClient).toContain('const canEditBoardContent = canEditBoard({');
    expect(canvasClient).toContain('boardId: canvasId,');
    expect(canvasClient).toContain('collaboratorAuthority: boardCollaboratorAuthority,');
    expect(canvasClient.match(/canEditBoard\(/g) ?? []).toHaveLength(1);
    // The previous, over-broad name is gone.
    expect(canvasClient).not.toContain('canEditCurrentBoard');
  });

  it('the PDF selection save reads it', () => {
    expect(canvasClient).toContain('const canSavePdfSelectionAsNote = canEditBoardContent;');
    expect(canvasClient).toContain('onSaveSelectionAsNote={canSavePdfSelectionAsNote ? saveKnowledgeSelectionAsNote : undefined}');
    expect(canvasClient).toContain("if (!canvasId || !canSavePdfSelectionAsNote) throw new Error('note_save_not_allowed');");
  });

  it('ordinary Note edit/delete read it', () => {
    expect(canvasClient).toContain('isEditable={canEditBoardContent}');
    expect(canvasClient).toContain('canEditPosts={canEditBoardContent}');
    expect(canvasClient).toContain('selectDocumentModalDestination(post, canEditBoardContent)');
  });

  it('the SHARED aliases do NOT read it -- this is the SPLIT_3 regression', () => {
    // Giving these the padlets capability handed a collaborator editor Map
    // style, the freeform background and Graph Line, none of which their
    // backend authorises. They stay on the workspace role. (Set as cover is
    // NOT among them -- it never went through these aliases at all; it has
    // its own owner authority, pinned in its own test below.)
    expect(canvasClient).toContain('const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);');
    expect(canvasClient).toContain('const canUseCanvasToolbar = canUseFreeformEditButton;');
    expect(canvasClient).not.toContain('const canUseFreeformEditButton = canEditBoardContent;');
    expect(canvasClient).not.toContain('const canUseCanvasToolbar = canEditBoardContent;');
  });

  it('the alias-carried surfaces are gated exactly as they were before the defect', () => {
    // `canvasClient` already has line comments stripped. A block-comment strip
    // is NOT applied: an unbalanced `/*` inside JSX swallows ~90k characters of
    // this file, which silently empties every slice taken after it.
    const code = canvasClient;

    // Freeform background -> writes boards.background_type/background_value,
    // so `boards_update`, so owner-only. Its guard stays on the alias.
    const background = code.slice(
      code.indexOf('const persistFreeformBoardAppearance = useCallback('),
      code.indexOf('const setFreeformGridPreference = useCallback('),
    );
    expect(background.length).toBeGreaterThan(200);
    expect(background).toContain('if (!canUseFreeformEditButton) {');
    expect(background).not.toContain('canEditBoardContent');

    // Map style and Graph Line are toolbar entries; the toolbar as a whole is
    // what decides whether they are reachable.
    expect(code).toContain('{canUseCanvasToolbar && !effectiveToolbarCollapsed && (');
    const toolbarRegistry = sourceOf('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
    expect(toolbarRegistry).toContain("type: \"map-style\"");
    expect(toolbarRegistry).toContain("type: \"graph-line\"");
    expect(toolbarRegistry).not.toContain('canEditBoardContent');

  });

  /**
   * CORRECTION_3. Set as cover was the one surface this fence got wrong.
   *
   * The earlier model said it was toolbar-gated, and it is not: the structured
   * layouts pass their own `onSetAsCover`, so it arrived through
   * `isEditable={canEditBoardContent}` -- board CONTENT authority for a
   * mutation that writes the BOARD row. A non-owner collaborator editor was
   * therefore offered an enabled owner-only action.
   *
   * It has its own authority now, and that authority is ownership.
   */
  it('Set as cover is board OWNER authority -- not content, not the toolbar alias', () => {
    // Reuses the existing canonical ownership predicate. No second ownership
    // model: this is the same stamped fact `canEditBoard` is built from.
    expect(canvasClient).toContain(
      "import { canEditBoard, isBoardOwner } from '@/lib/domain/canvas/boardEditAuthority';",
    );
    expect(canvasClient).toContain(
      'const canManageBoardSettings = isBoardOwner(user?.id, canvasId, canvas);',
    );

    // Both structured layouts withhold the callback entirely, rather than
    // passing one that fails on click.
    expect(canvasClient).toContain(
      'onSetAsCover={canManageBoardSettings ? ((post: Padlet) => setAsPadletCover(post)) : undefined}',
    );
    expect(canvasClient).toContain('onSetAsCover={canManageBoardSettings ? setAsPadletCover : undefined}');
    // No remaining unconditional supply anywhere.
    expect(canvasClient).not.toContain('onSetAsCover={setAsPadletCover}');
    expect(canvasClient).not.toContain('onSetAsCover={(post: Padlet) => setAsPadletCover(post)}');
    expect(canvasClient).not.toContain('onSetAsCover={canEditBoardContent');

    // And the mutation itself fails closed, so hiding the control is not the
    // only thing standing between a non-owner and the call.
    const cover = canvasClient.slice(
      canvasClient.indexOf('const setAsPadletCover = async (post: Padlet) => {'),
      canvasClient.indexOf('const pinPost = async (post: Padlet) => {'),
    );
    expect(cover.length).toBeGreaterThan(200);
    expect(cover).toContain('if (!canManageBoardSettings) {');
    expect(cover.indexOf('if (!canManageBoardSettings) {')).toBeLessThan(cover.indexOf('createSetBoardCoverCommand'));
    // Never the workspace role, and never board-content authority.
    for (const forbidden of ['canEditBoardContent', 'canEditWorkspace', 'currentWorkspaceRole', 'canUseCanvasToolbar']) {
      expect(cover, forbidden).not.toContain(forbidden);
    }
  });

  it('the structured layouts make cover availability independent of isEditable', () => {
    // `isEditable` keeps meaning ordinary board-content editing. If it still
    // gated the cover action, a collaborator editor would get it back.
    for (const path of [
      'components/collabboard/row/RowLane.tsx',
      'components/canvas/layouts/ColumnsCanvasRow.tsx',
    ]) {
      const layout = sourceOf(path);
      expect(layout, path).not.toContain('isEditable && onSetAsCover');
      expect(layout, path).toContain('onSetAsCover ?');
      // Content actions beside it are untouched -- this is a narrowing of one
      // action, not a downgrade of collaborator editing.
      expect(layout, path).toContain('isEditable && onDeletePost');
      expect(layout, path).toContain('isEditable && onDuplicate');
    }
    // The row controller's prop became optional so that "not authorised" is
    // expressible at all.
    expect(sourceOf('components/collabboard/row/RowCanvasDnD.tsx'))
      .toContain('onSetAsCover?: (post: Padlet) => void;');
  });

  it('census: the padlets capability has a small, enumerable set of consumers', () => {
    // A future edit that quietly routes a boards-backed or graph surface
    // through canEditBoardContent re-introduces exactly the defect this suite
    // exists for, and moves this count.
    const uses = canvasClient.match(/canEditBoardContent/g) ?? [];
    expect(uses.length).toBe(15);
    // Non-vacuity: the matcher does find the thing it is counting.
    expect(uses.length).toBeGreaterThan(0);
  });
});

describe('every unrelated mutation authority is untouched by this slice', () => {
  it('the toolbar keeps the workspace authority it has always had', () => {
    // It hosts Map style, the freeform background, Set as cover and Graph
    // Line alongside Note creation. Those write `boards` and the graph tables,
    // so the toolbar cannot follow the padlets capability.
    expect(canvasClient).toContain('const canUseCanvasToolbar = canUseFreeformEditButton;');
    expect(canvasClient).toContain('const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);');
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
