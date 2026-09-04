"use client";

import React from 'react';
import { Trash2, StickyNote } from 'lucide-react';

/**
 * PDF-R6K-H2B-C1 -- the compact control a persisted highlight opens.
 *
 * Deliberately small and deliberately per-highlight. A run covered by two
 * highlights lists BOTH, one row each, because the alternative is guessing
 * which one a Trash press meant -- and the ids come from the rendered span, so
 * nothing is ever matched by quote text or offset.
 *
 * What each row offers is decided by two independent facts:
 *
 *   Open Note   only when THIS highlight still has a live citation behind it.
 *               A plain highlight, or one orphaned when its Note was deleted,
 *               has no Note to open and is not given a dead control.
 *
 *   Trash       only when the viewer may write shared annotations. This is an
 *               affordance, not a boundary: H2A's RLS refuses a viewer's delete
 *               regardless of what this renders.
 */

export interface KnowledgeHighlightAction {
  readonly highlightId: string;
  readonly color: string;
  /** The Note this highlight can open, or null when there is none. */
  readonly targetPadletId: string | null;
}

export function KnowledgeHighlightActions({
  actions,
  onOpenNote,
  onDelete,
  onDismiss,
}: {
  readonly actions: readonly KnowledgeHighlightAction[];
  readonly onOpenNote: ((targetPadletId: string) => void) | null;
  /** Null for a viewer or commenter: no Trash is offered at all. */
  readonly onDelete: ((highlightId: string) => void | Promise<void>) | null;
  readonly onDismiss: () => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div
      data-knowledge-highlight-actions="true"
      data-no-drag="true"
      className="flex flex-col gap-0.5 rounded border border-gray-200 bg-white p-1 shadow-lg"
      // The control sits over page text that is itself selectable and draggable,
      // so a press here belongs to the control alone.
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <div
          key={action.highlightId}
          data-knowledge-highlight-action-row={action.highlightId}
          className="flex items-center gap-1"
        >
          {/* Which highlight this row is, when several cover the same run. */}
          <span
            aria-hidden="true"
            data-knowledge-highlight-swatch="true"
            className="h-3 w-3 flex-none rounded-sm border border-gray-300"
            style={{ backgroundColor: action.color }}
          />
          {action.targetPadletId !== null && onOpenNote !== null ? (
            <button
              type="button"
              data-no-drag="true"
              data-knowledge-highlight-action="open-note"
              title="Open the Note that cites this passage"
              aria-label="Open Note"
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-gray-700 hover:bg-gray-100"
              onClick={() => { onOpenNote(action.targetPadletId!); onDismiss(); }}
            >
              <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
              Open Note
            </button>
          ) : null}
          {onDelete !== null ? (
            <button
              type="button"
              data-no-drag="true"
              data-knowledge-highlight-action="delete"
              title="Delete this highlight"
              aria-label="Delete highlight"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => {
                // Deletes exactly this id. The Note, its citation and every
                // other highlight over the same text are untouched.
                void onDelete(action.highlightId);
                onDismiss();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default KnowledgeHighlightActions;
