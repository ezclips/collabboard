'use client';

/**
 * PATCH-350. The card changes ONE assistant message carries, remembered across
 * a thread re-read.
 *
 * Proposals are NOT persisted: a re-read of the thread -- which a Kanban turn
 * always triggers, for its context chips -- comes back without them. So the
 * wire value is captured the moment the message carries it and kept for the
 * life of this message's instance (keyed by message id, so the instance
 * survives the re-read).
 *
 * Captured DURING render, not in an effect: the re-read can replace the message
 * before an effect flushes, and the value would be gone by then.
 */

import { useRef } from 'react';
import type { KanbanProposedChange } from '@/lib/domain/ai/kanbanChangeProposals';

/** A stable empty default, so a message with none is not a new array each render. */
const NONE: readonly KanbanProposedChange[] = [];

interface ProposalCarrier {
  readonly id: string;
  readonly proposedChanges?: readonly KanbanProposedChange[] | null;
}

export function useKanbanProposalsByMessage(
  message: ProposalCarrier | null | undefined,
): readonly KanbanProposedChange[] {
  const remembered = useRef<readonly KanbanProposedChange[]>(NONE);
  const lastId = useRef<string | null>(message?.id ?? null);

  // A different message reusing this instance starts clean.
  if (message && message.id !== lastId.current) {
    lastId.current = message.id;
    remembered.current = NONE;
  }
  const wire = message?.proposedChanges;
  if (wire && wire.length > 0) remembered.current = wire;

  return wire ?? remembered.current;
}
