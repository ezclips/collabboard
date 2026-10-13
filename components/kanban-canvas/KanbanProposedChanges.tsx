'use client';

/**
 * PATCH-350. The proposed card changes under one Board AI answer on Kanban.
 *
 * The model only PROPOSED these; nothing is written until the user ticks the
 * ones they want and presses Apply. Applying goes through the bridge, which
 * uses the Kanban store's own actions on the user's own client, so RLS decides
 * exactly as for a manual edit. A viewer sees the same list, read-only.
 *
 * PATCH-351: when the answer is a PLAN (two or more date changes), the list is
 * titled "Proposed schedule", the date changes are sorted by start date and
 * labelled as a range, and any change carrying a plan warning is shown in amber
 * and UNTICKED by default (the user may still tick it).
 */

import React, { useState } from 'react';
import { KNOWLEDGE_TEXT_BUTTON_CLASS } from '@/components/collabboard/knowledgeReaderControls';
import {
  kanbanChangeIsDateChange,
  kanbanScheduleLabel,
  type KanbanApplyChangeResult,
  type KanbanProposedChange,
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
  // A change with a plan warning starts UNTICKED; the user may still tick it.
  const [selected, setSelected] = useState<readonly number[]>(() => (
    changes.map((_, index) => index).filter((index) => (changes[index].warnings?.length ?? 0) === 0)
  ));
  const [phase, setPhase] = useState<Phase>('idle');
  const [discarded, setDiscarded] = useState(false);
  // Results keyed by the change's ORIGINAL index, so the schedule's reordering
  // cannot misattribute an outcome.
  const [results, setResults] = useState<ReadonlyMap<number, KanbanApplyChangeResult> | null>(null);

  if (changes.length === 0) return null;

  const applicable = canEdit && !!onApply;
  const readOnly = phase === 'done' || discarded;

  // PATCH-351. A plan is two or more date changes: sort those by start date and
  // keep the rest below, in their own order.
  const scheduleMode = changes.filter(kanbanChangeIsDateChange).length >= 2;
  const entries = changes.map((change, index) => ({ change, index }));
  const displayEntries = scheduleMode
    ? [
      ...entries
        .filter((entry) => kanbanChangeIsDateChange(entry.change))
        .sort((a, b) => (a.change.startDate ?? '').localeCompare(b.change.startDate ?? '')),
      ...entries.filter((entry) => !kanbanChangeIsDateChange(entry.change)),
    ]
    : entries;
  const labelFor = (change: KanbanProposedChange): string => (
    scheduleMode && kanbanChangeIsDateChange(change) ? kanbanScheduleLabel(change) : change.label
  );

  const toggle = (index: number) => {
    if (readOnly || phase === 'applying') return;
    setSelected((current) => (
      current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index]
    ));
  };

  const applySelected = async () => {
    if (!onApply || readOnly || phase === 'applying') return;
    const chosen = entries.filter((entry) => selected.includes(entry.index));
    if (chosen.length === 0) return;
    setPhase('applying');
    try {
      const outcome = await onApply(chosen.map((entry) => entry.change));
      setResults(new Map(chosen.map((entry, position) => [
        entry.index,
        outcome[position] ?? { ok: false, message: 'Could not apply this change' },
      ])));
    } catch {
      // Never silent: a thrown apply is reported as a failure for each change.
      setResults(new Map(chosen.map((entry) => [
        entry.index,
        { ok: false, message: 'Could not apply this change' },
      ])));
    } finally {
      setPhase('done');
    }
  };

  const resultEntries = results ? [...results.entries()] : [];
  const appliedIndexes = resultEntries.filter(([, result]) => result.ok).map(([index]) => index);
  const failedEntries = resultEntries.filter(([, result]) => !result.ok);
  const appliedLabels = appliedIndexes.map((index) => changes[index]?.label).filter(Boolean);

  return (
    <div
      data-kanban-proposed-changes="true"
      className="mt-1.5 whitespace-normal border-t border-gray-200 pt-1.5"
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {scheduleMode ? `Proposed schedule (${changes.length})` : `Proposed changes (${changes.length})`}
      </p>

      <ul className="space-y-1">
        {displayEntries.map(({ change, index }) => {
          const outcome = results?.get(index);
          const tone = outcome?.ok ? 'text-green-700' : outcome && !outcome.ok ? 'text-red-600' : 'text-gray-700';
          return (
            <li key={`${change.kind}-${index}`} data-kanban-proposed-change={index} className="flex items-start gap-1.5">
              <input
                type="checkbox"
                data-kanban-proposed-change-checkbox={index}
                checked={selected.includes(index)}
                disabled={!applicable || readOnly}
                onChange={() => toggle(index)}
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-label={labelFor(change)}
              />
              <span className="min-w-0 flex-1">
                <span data-kanban-proposed-change-label="true" className={`block text-[11px] ${tone}`}>
                  {labelFor(change)}
                </span>
                {(change.warnings ?? []).map((warning, warningIndex) => (
                  <span
                    key={warningIndex}
                    data-kanban-proposed-warning="true"
                    className="block text-[10px] text-amber-600"
                  >
                    {warning}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      {failedEntries.length > 0 ? (
        <ul data-kanban-proposed-failures="true" className="mt-1 space-y-0.5">
          {failedEntries.map(([index, result]) => (
            <li key={index} className="text-[10px] text-red-600">
              {changes[index]?.label}: {result.message ?? 'Could not apply this change'}
            </li>
          ))}
        </ul>
      ) : null}

      {phase === 'done' || discarded ? (
        <p data-kanban-proposed-status="true" className="mt-1 text-[10px] text-gray-500">
          {discarded
            ? 'Discarded.'
            : `Applied ${appliedLabels.length} of ${results?.size ?? 0} changes`}
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
