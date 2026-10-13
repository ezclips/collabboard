'use client';

/**
 * PATCH-350 Addendum 1. The proposed card changes under ONE Board AI message.
 *
 * Owns the proposals memory and the `<KanbanProposedChanges>` render, so
 * `BoardAiChatDrawer.tsx` keeps only a one-line render. It captures the wire
 * value while the message carries it, because a thread re-read -- which a
 * Kanban turn always triggers -- comes back without it; the same message id
 * keeps the instance, and the remembered value with it.
 */

import React from 'react';
import KanbanProposedChanges from './KanbanProposedChanges';
import { useKanbanProposalsByMessage } from './useKanbanProposalsByMessage';
import type {
  KanbanApplyChangeResult,
  KanbanProposedChange,
} from '@/lib/domain/ai/kanbanChangeProposals';

/** A message reduced to what this component needs. */
interface ProposalMessage {
  readonly id: string;
  readonly proposedChanges?: readonly KanbanProposedChange[] | null;
}

export interface KanbanMessageProposalsProps {
  readonly message: ProposalMessage;
  /** The board's edit authority. False renders the list read-only. */
  readonly canEdit: boolean;
  readonly onApply?: (changes: readonly KanbanProposedChange[]) => Promise<readonly KanbanApplyChangeResult[]>;
}

export default function KanbanMessageProposals({ message, canEdit, onApply }: KanbanMessageProposalsProps) {
  const changes = useKanbanProposalsByMessage(message);
  if (changes.length === 0) return null;
  return <KanbanProposedChanges changes={changes} canEdit={canEdit} onApply={onApply} />;
}
