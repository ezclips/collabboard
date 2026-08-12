// PATCH 8B -- shared comment domain foundation.
//
// Shape and field names are authoritative from COMMENT_UI_CONTRACT_V1.md /
// FreeformPadletCards.tsx (`components/collabboard/canvas/ui/FreeformPadletCards.tsx`),
// not invented. `color` is a legacy field some sites still mirror alongside
// `textColor` on every write (sites A, C) while others (site B) write
// `textColor` only -- that drift is real and frozen, so it is NOT collapsed
// into one policy here (see `mirrorLegacyColor` below).
import type { BoardPermission } from '@/types/permissions';
import type { WorkspaceRole } from '@/lib/workspace/context';

export interface Comment {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: number;
  /** Legacy text-color field, still read as a fallback (`textColor || color`) everywhere. */
  color?: string;
  textColor?: string;
  backgroundColor?: string;
  isStrikethrough?: boolean;
}

export function editCommentText(comments: readonly Comment[], commentId: string, text: string): Comment[] {
  return comments.map((comment) => (comment.id === commentId ? { ...comment, text } : comment));
}

export function removeComment(comments: readonly Comment[], commentId: string): Comment[] {
  return comments.filter((comment) => comment.id !== commentId);
}

export function toggleCommentStrikethrough(comments: readonly Comment[], commentId: string): Comment[] {
  return comments.map((comment) =>
    comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
  );
}

export interface SetCommentTextColorOptions {
  /** Mirrors `textColor` into the legacy `color` field too -- matches sites A/C, not site B. */
  mirrorLegacyColor?: boolean;
}

export function setCommentTextColor(
  comments: readonly Comment[],
  commentId: string,
  textColor: string,
  options: SetCommentTextColorOptions = {}
): Comment[] {
  return comments.map((comment) =>
    comment.id === commentId
      ? { ...comment, textColor, ...(options.mirrorLegacyColor ? { color: textColor } : {}) }
      : comment
  );
}

export function setCommentBackgroundColor(
  comments: readonly Comment[],
  commentId: string,
  backgroundColor: string | undefined
): Comment[] {
  return comments.map((comment) => (comment.id === commentId ? { ...comment, backgroundColor } : comment));
}

// PATCH 8O.1 -- canonical comment permission contract.
//
// 'read'   -- view-only canonical Comments: see the panel, read comments,
//             select/copy text, open existing safe links. Zero mutation.
// 'manage' -- the current frozen canonical Comment UI v1 capabilities
//             (composer, Edit, Color/Highlight, Link authoring,
//             Strikethrough, Delete, title editing/styling).
//
// Deliberately NOT modeled as a boolean (`readOnly`): callers that reuse
// this type keep the door open for a future third mode (e.g. 'comment', once
// commenter-level persistence is authorized -- see COMMENTER PERSISTENCE
// below) without renaming a boolean's polarity at every call site.
export type CommentAccessMode = 'read' | 'manage';

// Resolves the caller-facing access mode from the SAME role/permission types
// already defined in types/permissions.ts and lib/workspace/context.ts -- no
// parallel role system. Read-only wins if either signal says so.
//
// `boardPermission` is accepted for completeness with the product's stated
// permission model (BoardPermission === 'reader' is read-only) but is not
// wired from any caller today: no client component in this canvas view
// currently resolves board-level permission (only WorkspaceRole is loaded
// client-side, in CanvasClient.tsx's currentWorkspaceRole state). Passing it
// costs nothing when unavailable (undefined simply falls through) and this
// function needs no changes the day a caller starts resolving it.
//
// COMMENTER PERSISTENCE -- SEPARATE FOLLOW-UP REQUIRED: BoardPermission
// 'commenter' is product-intended to permit commenting, but the padlets
// UPDATE RLS policy requires editor-level access -- a commenter's comment
// writes would be accepted by this function (mapped to 'manage', since
// commenter ranks above reader) yet rejected by the database. This function
// does not attempt to paper over that mismatch by downgrading commenter to
// 'read' (that would be product-incorrect -- commenter is supposed to write)
// or by weakening RLS (out of scope, and would risk granting post-edit
// capability). The gap is real and stays visible until a dedicated patch
// either grants commenter-scoped RLS for comment-only metadata writes or
// introduces a distinct persistence path. Until then, a commenter attempting
// to comment will see 'manage' UI and have writes rejected at the database --
// no worse than before this patch, and explicitly not this patch's problem
// to solve (see COMMENT_UI_CONTRACT_V1.md).
export function resolveCommentAccessMode(
  workspaceRole: WorkspaceRole | null | undefined,
  boardPermission?: BoardPermission | null
): CommentAccessMode {
  if (workspaceRole === 'readonly') return 'read';
  if (boardPermission === 'reader') return 'read';
  return 'manage';
}

// Wraps a mutation callback so it is a true no-op in read mode -- the guard
// sits at the CALL BOUNDARY, before the wrapped handler's body ever runs, so
// a caller's optimistic local-state update (e.g. setCardCommentList) and its
// persistence call (e.g. updatePadletMetadata) both simply never execute for
// a read-only caller. This is the defense-in-depth layer for canonical
// comment callers: CommentPopup itself independently refuses to invoke these
// props in read mode, but a caller must not rely on that alone (Step 6,
// PATCH 8O.1) -- wrapping every comment mutation prop with this at the JSX
// boundary means the caller's own handler body is provably unreachable in
// read mode, not merely conditionally skipped inside it.
export function guardCommentMutation<Args extends unknown[]>(
  accessMode: CommentAccessMode,
  handler: (...args: Args) => void | Promise<void>
): (...args: Args) => void {
  if (accessMode !== 'manage') {
    return () => {};
  }
  return (...args: Args) => {
    void handler(...args);
  };
}
