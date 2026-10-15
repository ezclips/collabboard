'use client';

/**
 * PATCH-372. The proposed post/panel changes under ONE Board AI answer on a
 * Padlet-style board (Wall, Columns, Grid, Timeline).
 *
 * The twin of Kanban's `KanbanMessageProposals` + `KanbanProposedChanges`, in
 * one file: it owns the proposals memory AND the checklist. The model only
 * PROPOSED these; nothing is written until the user ticks the ones they want and
 * presses Apply. Applying goes through the layout's own client paths on the
 * user's own client, so RLS, freeze and guest approval decide exactly as for a
 * manual edit. A viewer sees the same list, read-only.
 */

import React, { useRef, useState } from 'react';
import { KNOWLEDGE_TEXT_BUTTON_CLASS } from '@/components/collabboard/knowledgeReaderControls';
import type {
  PadletApplyChangeResult,
  PadletProposedChange,
} from '@/lib/domain/ai/padletChangeProposals';

/** A stable empty default, so a message with none is not a new array each render. */
const NONE: readonly PadletProposedChange[] = [];

/** A message reduced to what this component needs. */
interface ProposalMessage {
  readonly id: string;
  readonly proposedPadletChanges?: readonly PadletProposedChange[] | null;
}

export interface PadletMessageProposalsProps {
  readonly message: ProposalMessage;
  /** The board's edit authority. False renders the list read-only. */
  readonly canEdit: boolean;
  /**
   * The apply function. Absent for a viewer, so the two buttons are never
   * rendered -- the same rule the Kanban twin follows.
   */
  readonly onApply?: (changes: readonly PadletProposedChange[]) => Promise<readonly PadletApplyChangeResult[]>;
}

type Phase = 'idle' | 'applying' | 'done';

export default function PadletMessageProposals({ message, canEdit, onApply }: PadletMessageProposalsProps) {
  /**
   * Proposals are NOT persisted: a re-read of the thread comes back without
   * them, so the wire value is captured the moment the message carries it and
   * kept for the life of this message's instance (keyed by message id, so the
   * instance survives the re-read). Captured DURING render, not in an effect:
   * the re-read can replace the message before an effect flushes.
   */
  const remembered = useRef<readonly PadletProposedChange[]>(NONE);
  const lastId = useRef<string | null>(message?.id ?? null);
  if (message && message.id !== lastId.current) {
    lastId.current = message.id;
    remembered.current = NONE;
  }
  const wire = message?.proposedPadletChanges;
  if (wire && wire.length > 0) remembered.current = wire;
  const changes = wire ?? remembered.current;

  const [selected, setSelected] = useState<readonly number[]>(() => changes.map((_, index) => index));
  const [phase, setPhase] = useState<Phase>('idle');
  const [discarded, setDiscarded] = useState(false);
  // Results keyed by the change's index.
  const [results, setResults] = useState<ReadonlyMap<number, PadletApplyChangeResult> | null>(null);

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
    const chosen = changes.map((change, index) => ({ change, index })).filter((entry) => selected.includes(entry.index));
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
  const appliedLabels = resultEntries.filter(([, result]) => result.ok).map(([index]) => changes[index]?.label).filter(Boolean);
  const failedEntries = resultEntries.filter(([, result]) => !result.ok);

  return (
    <div
      data-padlet-proposals="true"
      className="mt-1.5 whitespace-normal border-t border-gray-200 pt-1.5"
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        Proposed changes ({changes.length})
      </p>

      <ul className="space-y-1">
        {changes.map((change, index) => {
          const outcome = results?.get(index);
          const tone = outcome?.ok ? 'text-green-700' : outcome && !outcome.ok ? 'text-red-600' : 'text-gray-700';
          return (
            <li key={`${change.kind}-${index}`} data-padlet-proposal={index} className="flex items-start gap-1.5">
              <input
                type="checkbox"
                data-padlet-proposal-checkbox={index}
                checked={selected.includes(index)}
                disabled={!applicable || readOnly}
                onChange={() => toggle(index)}
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-label={change.label}
              />
              <span data-padlet-proposal-label="true" className={`min-w-0 flex-1 text-[11px] ${tone}`}>
                {change.label}
              </span>
            </li>
          );
        })}
      </ul>

      {failedEntries.length > 0 ? (
        <ul data-padlet-proposals-failures="true" className="mt-1 space-y-0.5">
          {failedEntries.map(([index, result]) => (
            <li key={index} className="text-[10px] text-red-600">
              {changes[index]?.label}: {result.message ?? 'Could not apply this change'}
            </li>
          ))}
        </ul>
      ) : null}

      {phase === 'done' || discarded ? (
        <p data-padlet-proposals-status="true" className="mt-1 text-[10px] text-gray-500">
          {discarded
            ? 'Discarded.'
            : `Applied ${appliedLabels.length} of ${results?.size ?? 0} changes`}
        </p>
      ) : null}

      {applicable && !readOnly ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-padlet-proposals-apply="true"
            className={KNOWLEDGE_TEXT_BUTTON_CLASS}
            disabled={phase === 'applying' || selected.length === 0}
            onClick={() => { void applySelected(); }}
          >
            {phase === 'applying' ? 'Applying\u2026' : 'Apply selected'}
          </button>
          <button
            type="button"
            data-padlet-proposals-discard="true"
            className={KNOWLEDGE_TEXT_BUTTON_CLASS}
            disabled={phase === 'applying'}
            onClick={() => setDiscarded(true)}
          >
            Discard
          </button>
        </div>
      ) : null}

      {!canEdit ? (
        <p data-padlet-proposals-readonly="true" className="mt-1 text-[10px] text-gray-500">
          Only editors can apply changes.
        </p>
      ) : null}

      <p className="mt-1 text-[10px] text-gray-400">
        These changes are not saved: they disappear if you reload the page.
      </p>
    </div>
  );
}
