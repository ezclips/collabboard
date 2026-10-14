/**
 * PATCH-367. Approve guest posts first: the pure rules and the label strings.
 *
 * A post is PENDING when its `metadata.pendingApproval` is exactly `true` (the
 * database stamps it, and only the database may change it). `approvedMetadata`
 * produces the metadata that approves a post -- a NEW object WITHOUT the key,
 * never a mutation of the input. The database decides visibility; this only
 * decides what the UI draws and what it writes to approve.
 */

export const PENDING_LABEL = 'Waiting for approval';

/** True only when `metadata.pendingApproval === true`. */
export function isPendingApproval(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as { pendingApproval?: unknown }).pendingApproval === true;
}

/**
 * A NEW metadata object with `pendingApproval` removed. The input is never
 * mutated. Removing the key is what approves a post (the trigger keeps NEW as
 * sent for a reviewer).
 */
export function approvedMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  delete next.pendingApproval;
  return next;
}

/** How many of these posts are waiting for approval. */
export function pendingCount(padlets: ReadonlyArray<{ metadata?: unknown }>): number {
  let count = 0;
  for (const padlet of padlets) {
    if (isPendingApproval(padlet.metadata)) count += 1;
  }
  return count;
}

/** The owner pill's text. */
export function guestPostsWaitingLabel(count: number): string {
  return count === 1 ? '1 guest post waiting' : `${count} guest posts waiting`;
}
