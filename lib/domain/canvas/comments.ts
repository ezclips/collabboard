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

// PATCH 8O.1/8O.2 -- canonical comment permission contract.
//
// 'read'    -- view-only canonical Comments: see the panel, read comments,
//              select/copy text, open existing safe links. Zero mutation.
// 'comment' -- everything 'read' allows, PLUS: add a new comment, and edit,
//              style (color/highlight), link-author, strikethrough, or
//              delete comments the current user themselves authored. May NOT
//              touch another user's comment, nor rename/style the panel
//              title or Badge Color (those stay 'manage'-only). See
//              `canMutateComment` for the ownership rule.
// 'manage'  -- the current frozen canonical Comment UI v1 capabilities,
//              unchanged: full authoring rights over every comment
//              regardless of author, plus title/title-style/Badge Color.
//
// Deliberately NOT modeled as a boolean: three explicit, ordered modes let
// every call site express "what this user is allowed to do" without
// re-deriving it from ad hoc role checks.
export type CommentAccessMode = 'read' | 'comment' | 'manage';

// Resolves the caller-facing access mode from the SAME role/permission types
// already defined in types/permissions.ts and lib/workspace/context.ts -- no
// parallel role system. Workspace-level restriction is the OUTER bound: a
// workspace-readonly member never escalates past 'read' no matter what
// boardPermission says (a higher board permission is never allowed to
// override a stricter workspace role). When no boardPermission is supplied
// (or the workspace role is owner/admin/member with no explicit board-level
// signal), this resolves to 'manage' -- the pre-8O.1 default every existing
// caller already depends on.
//
// PATCH 8O.2 wires `boardPermission` for real: CanvasClient.tsx now resolves
// it client-side via the existing `get_board_permission` RPC
// (lib/auth/permissions.ts's server-side helper of the same name; the RPC
// itself is already GRANT EXECUTE TO authenticated and defaults its
// user_uuid argument to auth.uid(), so it is safe to call from the browser
// client with only board_uuid supplied).
export function resolveCommentAccessMode(
  workspaceRole: WorkspaceRole | null | undefined,
  boardPermission?: BoardPermission | null
): CommentAccessMode {
  if (workspaceRole === 'readonly') return 'read';
  if (boardPermission === 'reader') return 'read';
  if (boardPermission === 'commenter') return 'comment';
  return 'manage';
}

// Ownership rule (PATCH 8O.2): based on persisted `comment.userId` compared
// against the authenticated current user's id -- never on displayed name,
// avatar, comment index/position, or any other browser-observable state.
// A legacy comment with no reliable `userId` (falsy -- covers both missing
// and empty-string) can be READ by a 'comment'-mode user but never mutated,
// even if `currentUserId` also happens to be falsy: two absent ids must
// never be treated as "matching".
export function isOwnComment(
  comment: Pick<Comment, 'userId'> | null | undefined,
  currentUserId: string | null | undefined
): boolean {
  if (!comment?.userId || !currentUserId) return false;
  return comment.userId === currentUserId;
}

// Single authority for "can this caller mutate this specific comment" --
// 'manage' always can (frozen canonical management rights, unchanged from
// 8O.1); 'comment' can only for its own comment (see isOwnComment); 'read'
// never can. Every per-comment mutation guard, in CommentPopup itself and at
// every caller, should route through this function rather than re-deriving
// the ownership check inline.
export function canMutateComment(
  accessMode: CommentAccessMode,
  comment: Pick<Comment, 'userId'> | null | undefined,
  currentUserId: string | null | undefined
): boolean {
  if (accessMode === 'manage') return true;
  if (accessMode !== 'comment') return false;
  return isOwnComment(comment, currentUserId);
}

// Wraps a mutation callback so it is a true no-op outside 'manage' -- the
// guard sits at the CALL BOUNDARY, before the wrapped handler's body ever
// runs, so a caller's optimistic local-state update (e.g. setCardCommentList)
// and its persistence call (e.g. updatePadletMetadata) both simply never
// execute for a non-manage caller. This is the defense-in-depth layer for
// canonical comment callers: CommentPopup itself independently refuses to
// invoke these props outside 'manage', but a caller must not rely on that
// alone (Step 6, PATCH 8O.1) -- wrapping every manage-only comment mutation
// prop with this at the JSX boundary means the caller's own handler body is
// provably unreachable otherwise, not merely conditionally skipped inside it.
//
// PATCH 8O.2 scope note: 'comment' mode is intentionally NOT admitted here.
// This guard is now reserved for the mutation props that stay 'manage'-only
// under the three-tier model -- title editing, title styling, Badge Color
// (see COMMENT_UI_CONTRACT_V1.md's three-tier matrix). Composing a brand-new
// comment and mutating one's own existing comment use the two guards below
// instead, since both are allowed in 'comment' mode too.
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

// Wraps a callback that composes brand-new content (adding a comment) --
// allowed in both 'comment' and 'manage', a true no-op only in 'read'. There
// is no ownership question for composing a new comment (it is authored by
// the current user by construction), so this guard is mode-only, unlike
// `guardOwnCommentMutation` below.
export function guardCommentComposition<Args extends unknown[]>(
  accessMode: CommentAccessMode,
  handler: (...args: Args) => void | Promise<void>
): (...args: Args) => void {
  if (accessMode === 'read') {
    return () => {};
  }
  return (...args: Args) => {
    void handler(...args);
  };
}

// Wraps a callback that mutates an EXISTING, specific comment -- the target
// comment's id must be the wrapped handler's first argument (edit, remove,
// toggle-strikethrough, and per-comment color/highlight all fit this shape).
// 'manage' passes through unconditionally (frozen full authoring rights);
// 'comment' passes through only when `findComment(commentId)` resolves to a
// comment this caller owns (see `canMutateComment`); 'read' is always a
// no-op. `findComment` is supplied by the caller (it already holds the live
// comment list -- e.g. `cardCommentList.find(...)`) rather than this
// function reaching into any store itself, keeping the guard a pure wrapper
// with no knowledge of where comments are held.
//
// This is the SAME call-boundary defense-in-depth principle as
// `guardCommentMutation`: a forged callback invocation naming another user's
// commentId is rejected here, before the caller's own handler body (and its
// optimistic local-state update) ever runs -- independent of whatever
// ownership check CommentPopup itself also performs internally.
export function guardOwnCommentMutation<Args extends [commentId: string, ...rest: unknown[]]>(
  accessMode: CommentAccessMode,
  currentUserId: string | null | undefined,
  findComment: (commentId: string) => Pick<Comment, 'userId'> | null | undefined,
  handler: (...args: Args) => void | Promise<void>
): (...args: Args) => void {
  if (accessMode === 'read') {
    return () => {};
  }
  return (...args: Args) => {
    const [commentId] = args;
    const target = findComment(commentId);
    if (!canMutateComment(accessMode, target, currentUserId)) return;
    void handler(...args);
  };
}
