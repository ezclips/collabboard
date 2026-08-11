// PATCH 8B -- shared comment domain foundation.
//
// Shape and field names are authoritative from COMMENT_UI_CONTRACT_V1.md /
// FreeformPadletCards.tsx (`components/collabboard/canvas/ui/FreeformPadletCards.tsx`),
// not invented. `color` is a legacy field some sites still mirror alongside
// `textColor` on every write (sites A, C) while others (site B) write
// `textColor` only -- that drift is real and frozen, so it is NOT collapsed
// into one policy here (see `mirrorLegacyColor` below).
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
