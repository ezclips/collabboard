import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF_SELECTION_TO_NOTE_BOARD_AUTHORITY_FIX_2 governance seam.
 *
 * One capability decides who may change this board, and every board-level
 * mutation surface is derived from it. This suite is the census: it pins the
 * consumers that were converted, catches a future surface that goes back to
 * asking the workspace role directly, and -- the part that matters most --
 * checks the frontend rule against the BACKEND POLICY TEXT it is supposed to
 * mirror, so the two cannot drift apart silently again.
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

// ============================================================================
// The backend contract this frontend rule exists to mirror
// ============================================================================

describe('the frontend rule encodes the backend rule, not a looser one', () => {
  const padletPolicy = policyOf('supabase/migrations/20260706_fix_blanket_permissive_policies.sql');
  const sectionPolicy = policyOf('supabase/migrations/120260710_fix_board_sections_wrong_table_rls.sql');

  it('the backend board-content write rule is ownership OR an editor collaborator', () => {
    // Read straight out of the migrations the reviewer cited. If either of
    // these stops matching, the frontend rule below is mirroring something
    // that no longer exists and this suite must be revisited deliberately.
    for (const policy of [padletPolicy, sectionPolicy]) {
      expect(policy).toContain('SELECT id FROM boards WHERE user_id = auth.uid()');
      expect(policy).toMatch(
        /SELECT board_id FROM board_collaborators WHERE user_id = auth\.uid\(\) AND role = 'editor'/,
      );
    }
  });

  it('the backend write rule has NO workspace-membership branch', () => {
    // The substitution the accepted MEDIUM finding was about. There is no
    // workspace term in these policies to justify a workspace term in the UI.
    for (const policy of [padletPolicy, sectionPolicy]) {
      for (const forbidden of ['workspace_members', 'workspace_id', 'workspaces']) {
        expect(policy, forbidden).not.toContain(forbidden);
      }
    }
  });

  it('the frontend authority names those same two terms and nothing else', () => {
    // Ownership half: the board row's own owner column.
    expect(authority).toContain('board.user_id === userId');
    // Collaborator half: role 'editor', matching the policy exactly. Neither
    // 'viewer' nor 'commenter' -- the other two values the CHECK allows --
    // may grant.
    expect(authority).toContain("authority.role === 'editor'");
    expect(authority).toContain("export type BoardCollaboratorRole = 'editor' | 'viewer' | 'commenter';");
    // ...and no workspace term is even in scope to be reached for.
    for (const forbidden of ['canEditWorkspace', 'WorkspaceRole', 'workspaceRole', '@/lib/workspace/context']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });

  it('the collaborator read is scoped to THIS user and THIS board', () => {
    // One boolean's worth of authority, read as one row -- the roster is not
    // fetched to answer it.
    expect(viewReads).toContain("from('board_collaborators')");
    expect(viewReads).toContain(".eq('board_id', boardId)");
    expect(viewReads).toContain(".eq('user_id', userId)");
    expect(viewReads).toContain('.maybeSingle()');
  });

  it('the frontend is a mirror, not a second boundary: it writes nothing', () => {
    for (const forbidden of ['supabase', 'fetch(', 'rpc(', 'service_role', 'process.env']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });
});

// ============================================================================
// Fail-closed on identity and on board
// ============================================================================

describe('cached authority never outlives the identity or board it names', () => {
  it('identity is required before either half is consulted', () => {
    expect(authority).toContain('if (!isId(input.userId) || !isId(input.boardId)) return false;');
    const body = authority.slice(authority.indexOf('export function canEditBoard('));
    // The guard comes first, so no stale answer can speak for a missing user.
    expect(body.indexOf('isId(input.userId)')).toBeLessThan(body.indexOf('isBoardOwner('));
  });

  it('every board-scoped fact is stamped with whose and which board it is', () => {
    // This -- not the effect's timing -- is what makes an account or board
    // switch fail closed. The render after a switch happens BEFORE the effect
    // reruns, and on that render the previous answer no longer matches.
    expect(authority).toContain('readonly userId: string | null | undefined;');
    expect(authority).toContain('readonly boardId: string | null | undefined;');
    expect(authority).toContain('if (authority.userId !== userId || authority.boardId !== boardId) return false;');
    // The board row is checked against the current board id too, so the
    // previous board's ownership cannot answer for this one.
    expect(authority).toContain('if (!isId(board?.id) || board.id !== boardId) return false;');
    // No timing hack stands in for any of it.
    for (const forbidden of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
      expect(authority, forbidden).not.toContain(forbidden);
    }
  });

  it('the resolution re-runs on identity AND on board, dropping the old answer', () => {
    // Both are dependencies, so neither switch can leave the previous answer
    // in place once the effect has run; the stamp covers the render before it.
    expect(collaboratorHook).toContain('}, [boardId, userId]);');
    expect(collaboratorHook).toContain('setAuthority(null);');
    // A failed read stays UNRESOLVED rather than resolving to "no role" -- it
    // must not read as a denial for an owner nor a grant for anyone.
    expect(collaboratorHook).toContain('if (!result.ok) {');
    expect(collaboratorHook).not.toContain('setAuthority({ userId, boardId, role: null })');
    // The controller consumes it; it does not run a second resolution.
    expect(canvasClient).toContain('const boardCollaboratorAuthority = useBoardCollaboratorAuthority(canvasId, user?.id);');
    expect(canvasClient.match(/useBoardCollaboratorAuthority\(/g) ?? []).toHaveLength(1);
  });
});

// ============================================================================
// One capability, wired everywhere it decides a mutation
// ============================================================================

describe('one board-edit capability, wired everywhere it decides a mutation', () => {
  it('the shell resolves it once, and never per feature', () => {
    expect(canvasClient).toContain('const canEditCurrentBoard = canEditBoard({');
    expect(canvasClient).toContain('const canUseFreeformEditButton = canEditCurrentBoard;');
    expect(canvasClient).toContain('const canUseCanvasToolbar = canUseFreeformEditButton;');
    // Exactly one call: no surface recomputes the rule for itself.
    expect(canvasClient.match(/canEditBoard\(/g) ?? []).toHaveLength(1);
    expect(canvasClient.match(/isBoardOwner\(/g) ?? []).toHaveLength(0);
    // It is fed board-scoped facts only.
    expect(canvasClient).toContain('boardId: canvasId,');
    expect(canvasClient).toContain('collaboratorAuthority: boardCollaboratorAuthority,');
    expect(canvasClient).not.toContain('workspaceRole: currentWorkspaceRole,');
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
});
