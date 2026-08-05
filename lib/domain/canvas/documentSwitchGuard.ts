import type { Padlet } from '@/types/collabboard';
import type { DocumentModalDestination } from './documentModalRoute';

// PATCH-149B2-ii §32.14/§34: pure decision helper -- no React, no state, no
// persistence. Mirrors documentModalRoute.ts's purity precedent. §32's
// "prefer a discriminated descriptor" guidance is followed deliberately, so
// a queued action can be inspected, tested and executed exactly once
// without capturing a stale closure.
export type QueuedDocumentAction =
  | { kind: 'open-document'; post: Padlet; destination: DocumentModalDestination }
  | { kind: 'open-tool'; toolType: string }
  | { kind: 'open-drawing-editor'; padlet: Padlet };

export type CurrentDocumentState = {
  destination: DocumentModalDestination | null;
  isDirty: boolean;
};

export type DocumentSwitchDecision =
  | { type: 'proceed' }
  | { type: 'proceed-after-clear' }
  | { type: 'blocked'; queued: QueuedDocumentAction };

// §32.12 O4-C: close if clean, block if dirty. Read-only always proceeds
// (§32.11 -- a read-only Document never becomes dirty, so this is also
// reachable via `!current.isDirty`, but is named explicitly per governance).
export function decideDocumentSwitch(
  current: CurrentDocumentState,
  action: QueuedDocumentAction,
): DocumentSwitchDecision {
  if (!current.destination) return { type: 'proceed' };
  if (current.destination === 'document-viewer' || !current.isDirty) {
    return { type: 'proceed-after-clear' };
  }
  return { type: 'blocked', queued: action };
}
