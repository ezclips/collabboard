'use client';

/**
 * PATCH-350. The proposed card changes under one Board AI answer on Kanban.
 *
 * The model only PROPOSED these; nothing is written until the user ticks the
 * ones they want and presses Apply. Applying goes through the bridge, which
 * uses the Kanban store's own actions on the user's own client, so RLS decides
 * exactly as for a manual edit. A viewer sees the same list, read-only.
 */

import React, { useState } from 'react';
import { KNOWLEDGE_TEXT_BUTTON_CLASS } from '@/components/collabboard/knowledgeReaderControls';
import type {
  KanbanApplyChangeResult,
  KanbanProposedChange,
} from '@/lib/domain/ai/kanbanChangeProposals';

export interface KanbanProposedChangesProps {
  readonly changes: readonly KanbanProposedChange[];
  /** The board's edit authority. False renders the list read-only. */
  readonly canEdit: boolean;
  /**
   * The bridge's apply function. Absent for a viewer, so the two buttons are
   * never rendered -- the same rule the Save-as-card action follows.
   */
  readonly onApply?: (changes: readonly KanbanProposedChange[]) => Promise<readonly KanbanApplyChangeResult[]>;
}

type Phase = 'idle' | 'applying' | 'done';

export default function KanbanProposedChanges({ changes, canEdit, onApply }: KanbanProposedChangesProps) {
  const [selected, setSelected] = useState<readonly number[]>(() => changes.map((_, index) => index));
  const [phase, setPhase] = useState<Phase>('idle');
  const [discarded, setDiscarded] = useState(false);
  const [results, setResults] = useState<readonly KanbanApplyChangeResult[] | null>(null);

  if (changes.length === 0) return null;

  const applicable = canEdit && !!onApply;
  const readOnly = phase === 'done' || discarded;

  const toggle = (index: number) => {
    if (readOnly || phase === 'applying') return;
    setSelected((current) => (
      current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index]
    ));
  };

  const applySelected = async () => {
    if (!onApply || readOnly || phase === 'applying') return;
    const chosen = changes.filter((_, index) => selected.includes(index));
    if (chosen.length === 0) return;
    setPhase('applying');
    try {
      const outcome = await onApply(chosen);
      setResults(outcome);
    } catch {
      // Never silent: a thrown apply is reported as a failure for each change.
      setResults(chosen.map(() => ({ ok: false, message: 'Could not apply this change' })));
    } finally {
      setPhase('done');
    }
  };

  const appliedIndexes = results
    ? results.map((result, index) => (result.ok ? index : -1)).filter((index) => index >= 0)
    : [];
  const failedIndexes = results
    ? results.map((result, index) => (result.ok ? -1 : index)).filter((index) => index >= 0)
    : [];
  const appliedLabels = appliedIndexes.map((index) => changes[selected[index]]?.label).filter(Boolean);

  return (
    <div
      data-kanban-proposed-changes="true"
      className="mt-1.5 whitespace-normal border-t border-gray-200 pt-1.5"
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        Proposed changes ({changes.length})
      </p>

      <ul className="space-y-1">
        {changes.map((change, index) => {
          const applied = appliedIndexes.includes(index);
          const failed = failedIndexes.includes(index);
          return (
            <li key={`${change.kind}-${index}`} data-kanban-proposed-change={index} className="flex items-start gap-1.5">
              <input
                type="checkbox"
                data-kanban-proposed-change-checkbox={index}
                checked={selected.includes(index)}
                disabled={!applicable || readOnly}
                onChange={() => toggle(index)}
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-label={change.label}
              />
              <span
                data-kanban-proposed-change-label="true"
                className={`text-[11px] ${applied ? 'text-green-700' : failed ? 'text-red-600' : 'text-gray-700'}`}
              >
                {change.label}
              </span>
            </li>
          );
        })}
      </ul>

      {results && failedIndexes.length > 0 ? (
        <ul data-kanban-proposed-failures="true" className="mt-1 space-y-0.5">
          {failedIndexes.map((index) => (
            <li key={index} className="text-[10px] text-red-600">
              {changes[selected[index]]?.label}: {results[index]?.message ?? 'Could not apply this change'}
            </li>
          ))}
        </ul>
      ) : null}

      {phase === 'done' || discarded ? (
        <p data-kanban-proposed-status="true" className="mt-1 text-[10px] text-gray-500">
          {discarded
            ? 'Discarded.'
            : `Applied ${appliedLabels.length} of ${results?.length ?? 0} changes`}
        </p>
      ) : null}

      {applicable && !readOnly ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-kanban-proposed-apply="true"
            className={KNOWLEDGE_TEXT_BUTTON_CLASS}
            disabled={phase === 'applying' || selected.length === 0}
            onClick={() => { void applySelected(); }}
          >
            {phase === 'applying' ? 'Applying\u2026' : 'Apply selected'}
          </button>
          <button
            type="button"
            data-kanban-proposed-discard="true"
            className={KNOWLEDGE_TEXT_BUTTON_CLASS}
            disabled={phase === 'applying'}
            onClick={() => setDiscarded(true)}
          >
            Discard
          </button>
        </div>
      ) : null}

      {!canEdit ? (
        <p data-kanban-proposed-readonly="true" className="mt-1 text-[10px] text-gray-500">
          Only editors can apply changes.
        </p>
      ) : null}

      <p className="mt-1 text-[10px] text-gray-400">
        These changes are not saved: they disappear if you reload the page.
      </p>
    </div>
  );
}
