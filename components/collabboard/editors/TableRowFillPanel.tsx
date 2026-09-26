"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

import {
  buildRowFillItems,
  ROW_FILL_MAX_EXTRA_CHARS,
  rowFillInstruction,
  type TableFillCell,
  type TableFillValue,
} from '@/lib/domain/ai/tableFill';
import PlanLimitNotice, { planLimitFromResponse } from '@/components/billing/PlanLimitNotice';

/**
 * PATCH-173. The "Fill row with AI…" panel.
 *
 * Type what the row is about (a car's brand and model, say) and this asks the
 * model for every EMPTY cell in that row, one item per cell, each naming the
 * field it wants after 'Find:' -- the field being that cell's column TITLE.
 *
 * Answers are still suggestions the editor renders for review, and the panel
 * says outright that they come from the model's knowledge, not a live search.
 * It writes NOTHING itself.
 */

const REQUEST_TIMEOUT_MS = 25_000;

export interface TableRowFillPanelProps {
  readonly columns: readonly string[];
  readonly rowIndex: number;
  readonly rows: readonly (readonly string[])[];
  /** PATCH-188. The board this fill runs on; the owner's plan pays. */
  readonly boardId?: string;
  /** Reports the candidate cells upward; never writes the grid. */
  readonly onSuggestions: (cells: readonly TableFillCell[]) => void;
  readonly onClose: () => void;
}

export default function TableRowFillPanel({
  columns,
  rowIndex,
  rows,
  boardId,
  onSuggestions,
  onClose,
}: TableRowFillPanelProps) {
  const [extra, setExtra] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<{ message: string; planLimit: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const built = useMemo(
    () => buildRowFillItems({ rows, columns }, rowIndex, replaceExisting),
    [rows, columns, rowIndex, replaceExisting],
  );

  const handleCancel = () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    onClose();
  };

  const handleGenerate = async () => {
    const builtNow = buildRowFillItems({ rows, columns }, rowIndex, replaceExisting);
    if (builtNow.items.length === 0) {
      setError({ message: 'There is nothing to fill in this row.', planLimit: false });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    setIsGenerating(true);
    setError(null);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/ai/table-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          preset: 'custom',
          detail: rowFillInstruction(extra),
          // The route treats `row` as an opaque key; here it is the column index.
          items: builtNow.items,
          // PATCH-188. Omitted when absent, never sent as undefined or ''.
          ...(boardId ? { boardId } : {}),
        }),
      });
      if (generationRef.current !== generation) return;

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const planLimit = planLimitFromResponse(response.status, body);
        if (planLimit) {
          setIsGenerating(false);
          setError({ message: planLimit.message, planLimit: true });
          return;
        }
        const message = body && typeof body.error === 'string'
          ? body.error
          : 'The AI request failed. Please try again.';
        setIsGenerating(false);
        setError({ message, planLimit: false });
        return;
      }

      const body = await response.json().catch(() => null);
      if (generationRef.current !== generation) return;
      const values: TableFillValue[] = body && Array.isArray(body.values) ? body.values : [];
      setIsGenerating(false);
      if (values.length === 0) {
        setError({ message: "No suggestions came back. Try again, or change the instruction.", planLimit: false });
        return;
      }
      // Map the response's column keys back to this row's cells.
      onSuggestions(values.map((value) => ({ row: rowIndex, col: value.row, value: value.value })));
    } catch {
      if (generationRef.current !== generation) return;
      setIsGenerating(false);
      setError({ message: "The AI didn't answer in time.", planLimit: false });
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <div
      data-table-row-fill-panel=""
      className="relative z-[1100] w-[300px] bg-white rounded-xl shadow-xl border border-gray-200 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleCancel}
        aria-label="Close"
        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Sparkles className="h-4 w-4 text-purple-500" aria-hidden="true" />
        Fill row with AI
      </div>

      <p className="mb-2 text-xs text-gray-400">
        Fills {built.items.length} empty cells in row {rowIndex + 1} from each column's title.
      </p>

      {built.defaultTitleCount > 0 && (
        <p
          data-table-row-fill-title-hint=""
          className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
        >
          Give your columns titles first — the AI uses them to know what to fill. (Double-click a column letter.)
        </p>
      )}

      <p className="mb-2 text-[11px] text-gray-400">
        Answers come from the AI's knowledge, not a web search — check them.
      </p>

      <label className="mb-1 block text-xs text-gray-500" htmlFor="table-row-fill-extra">
        Extra instruction (optional)
      </label>
      <textarea
        id="table-row-fill-extra"
        data-table-row-fill-extra=""
        rows={3}
        value={extra}
        disabled={isGenerating}
        maxLength={ROW_FILL_MAX_EXTRA_CHARS}
        placeholder="e.g. Use litres"
        onChange={(e) => setExtra(e.target.value.slice(0, ROW_FILL_MAX_EXTRA_CHARS))}
        className="mb-2 w-full resize-y rounded border border-gray-200 px-2 py-1 text-sm outline-none"
      />

      <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
        <input
          data-table-row-fill-replace=""
          type="checkbox"
          checked={replaceExisting}
          disabled={isGenerating}
          onChange={(e) => setReplaceExisting(e.target.checked)}
        />
        Also replace cells that already have text
      </label>

      {error && (
        <div role="alert" className="mb-2 text-xs text-red-600">
          {error.planLimit
            ? <PlanLimitNotice message={error.message} />
            : error.message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
