"use client";

import React, { useEffect, useRef, useState } from 'react';
import { WandSparkles, X } from 'lucide-react';

import {
  applyTablePlan,
  buildTablePlanRequest,
  describeTablePlanStep,
  TABLE_PLAN_MAX_COMMAND_CHARS,
  type TablePlan,
} from '@/lib/domain/ai/tablePlan';
import type { TableGrid } from '@/lib/domain/canvas/tableStructure';
import TablePlanPreview from './TablePlanPreview';

/**
 * PATCH-175. "Edit table with AI": the user types a command, the AI answers
 * with a PLAN of our own table actions, and the plan is run on a DRAFT the user
 * reads before anything applies.
 *
 * THE PANEL WRITES NOTHING. It asks for a plan, runs it on a copy with the pure
 * `applyTablePlan`, shows the result, and reports the draft upward on Apply --
 * the editor owns the one writer and the Undo. Nothing is sent to the model
 * beyond the command and a sample of the table, and no number is ever asked of
 * the model.
 */

const REQUEST_TIMEOUT_MS = 25_000;

type Phase =
  | { kind: 'ask' }
  | { kind: 'loading' }
  | { kind: 'preview'; plan: TablePlan; draft: TableGrid }
  | { kind: 'nothing'; message: string; plan: TablePlan }
  | { kind: 'error'; message: string };

export interface TableAIEditPanelProps {
  /** The table the plan is built from, and the draft runs against. */
  readonly grid: TableGrid;
  /** Reports the draft upward on Apply; never writes the grid itself. */
  readonly onApply: (draft: TableGrid, stepCount: number) => void;
  /** Reports whether a draft is being previewed, so the editor can lock. */
  readonly onPreview: (draft: TableGrid | null) => void;
  readonly onClose: () => void;
}

export default function TableAIEditPanel({ grid, onApply, onPreview, onClose }: TableAIEditPanelProps) {
  const [command, setCommand] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' });
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleClose = () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    onPreview(null);
    onClose();
  };

  const plan = async () => {
    const trimmed = command.trim();
    if (trimmed.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    setPhase({ kind: 'loading' });
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/ai/table-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(buildTablePlanRequest(grid, trimmed)),
      });
      if (generationRef.current !== generation) return;

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body && typeof body.error === 'string'
          ? body.error
          : 'The AI request failed. Please try again.';
        setPhase({ kind: 'error', message });
        return;
      }

      const body = await response.json().catch(() => null);
      if (generationRef.current !== generation) return;
      const answer: TablePlan | null = body && body.plan ? body.plan : null;
      if (!answer) {
        setPhase({ kind: 'error', message: "The AI's answer couldn't be used. Try rephrasing." });
        return;
      }
      if (answer.steps.length === 0) {
        setPhase({
          kind: 'nothing',
          message: answer.message.trim() || 'The AI found nothing to change.',
          plan: answer,
        });
        return;
      }

      const result = applyTablePlan(grid, answer.steps);
      if ('error' in result) {
        setPhase({ kind: 'error', message: `The plan couldn't be applied: ${result.error}.` });
        return;
      }
      onPreview(result.grid);
      setPhase({ kind: 'preview', plan: answer, draft: result.grid });
    } catch {
      if (generationRef.current !== generation) return;
      setPhase({ kind: 'error', message: "The AI didn't answer in time." });
    } finally {
      clearTimeout(timer);
    }
  };

  const tryAgain = () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    onPreview(null);
    setPhase({ kind: 'ask' });
  };

  const isAsking = phase.kind === 'ask';
  const isLoading = phase.kind === 'loading';

  return (
    <div
      data-table-ai-edit-panel=""
      className="relative z-[1100] w-[320px] bg-white rounded-xl shadow-xl border border-gray-200 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <WandSparkles className="h-4 w-4 text-purple-500" aria-hidden="true" />
        Edit table with AI
      </div>

      {isAsking && (
        <>
          <p className="mb-2 text-xs text-gray-400">
            The AI plans the change; you see it before anything is applied.
          </p>
          <textarea
            id="table-ai-edit-command"
            data-table-ai-edit-command=""
            rows={3}
            value={command}
            maxLength={TABLE_PLAN_MAX_COMMAND_CHARS}
            placeholder="e.g. Sort by price, highest first, and show the total"
            onChange={(e) => setCommand(e.target.value.slice(0, TABLE_PLAN_MAX_COMMAND_CHARS))}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') plan();
            }}
            className="mb-2 w-full resize-y rounded border border-gray-200 px-2 py-1 text-sm outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={plan}
              disabled={command.trim().length === 0}
              className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Plan
            </button>
          </div>
        </>
      )}

      {isLoading && (
        <div role="status" className="text-xs text-gray-400">Planning…</div>
      )}

      {phase.kind === 'preview' && (
        <>
          {phase.plan.message && (
            <p data-table-plan-message="" className="mb-2 text-xs text-gray-700">{phase.plan.message}</p>
          )}
          <ol data-table-plan-steps="" className="mb-2 list-decimal space-y-0.5 pl-4 text-xs text-gray-600">
            {phase.plan.steps.map((step, index) => (
              <li key={index}>{describeTablePlanStep(step)}</li>
            ))}
          </ol>
          <div className="mb-2 max-h-[240px] overflow-auto">
            <TablePlanPreview grid={phase.draft} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => onApply(phase.draft, phase.plan.steps.length)}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {phase.kind === 'nothing' && (
        <>
          <p data-table-plan-nothing="" className="mb-2 text-xs text-gray-600">{phase.message}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Close
            </button>
            <button
              type="button"
              onClick={tryAgain}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Try again
            </button>
          </div>
        </>
      )}

      {phase.kind === 'error' && (
        <>
          <div role="alert" data-table-plan-error="" className="mb-2 text-xs text-red-600">{phase.message}</div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Close
            </button>
            <button
              type="button"
              onClick={tryAgain}
              className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
            >
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
