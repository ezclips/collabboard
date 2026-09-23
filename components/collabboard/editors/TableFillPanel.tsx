"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

import {
  buildTableFillItems,
  TABLE_FILL_MAX_INSTRUCTION_CHARS,
  type TableFillSource,
  type TableFillValue,
} from '@/lib/domain/ai/tableFill';

/**
 * PATCH-166. The "Fill with AI…" panel.
 *
 * ONE INSTRUCTION, APPLIED TO A COLUMN, ROW BY ROW. The user says what to do
 * (summarize, categorize, translate, or a custom instruction) and what to read
 * (the whole row, or one other column). The client builds one item per target
 * row -- the same pure builder the tests exercise -- and sends them; the answers
 * come back as suggestions the editor renders for review. THIS COMPONENT WRITES
 * NOTHING to the table; it only reports values upward.
 *
 * Errors ARE shown here (unlike starter questions, which stay silent): the user
 * asked for this action and a failure must not look like an empty result.
 */

type Preset = 'summarize' | 'categorize' | 'translate' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  summarize: 'Summarize',
  categorize: 'Categorize',
  translate: 'Translate',
  custom: 'Custom instruction',
};

const REQUEST_TIMEOUT_MS = 25_000;

export interface TableFillPanelProps {
  readonly columns: readonly string[];
  readonly targetColumn: number;
  readonly rows: readonly (readonly string[])[];
  /** Reports the accepted-candidate values upward; never writes the grid. */
  readonly onSuggestions: (values: readonly TableFillValue[]) => void;
  readonly onClose: () => void;
}

/** How many rows the current target/replace settings would try to fill. */
function countTargetRows(
  rows: readonly (readonly string[])[],
  targetColumn: number,
  replaceExisting: boolean,
): number {
  let count = 0;
  for (const row of rows) {
    const cell = (row[targetColumn] ?? '').trim();
    if (replaceExisting || cell.length === 0) count += 1;
  }
  return count;
}

export default function TableFillPanel({
  columns,
  targetColumn,
  rows,
  onSuggestions,
  onClose,
}: TableFillPanelProps) {
  const [preset, setPreset] = useState<Preset>('summarize');
  const [detail, setDetail] = useState('');
  const [source, setSource] = useState<TableFillSource>('row');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const targetRowCount = useMemo(
    () => countTargetRows(rows, targetColumn, replaceExisting),
    [rows, targetColumn, replaceExisting],
  );

  const detailLabel = preset === 'categorize' ? 'Categories'
    : preset === 'translate' ? 'Language'
      : preset === 'custom' ? 'Instruction'
        : null;
  const detailPlaceholder = preset === 'categorize' ? 'Bug, Feature, Question'
    : preset === 'translate' ? 'German'
      : preset === 'custom' ? 'e.g. Rewrite as a question'
        : '';

  const canGenerate = !isGenerating
    && (preset === 'summarize' || detail.trim().length > 0);

  const handleCancel = () => {
    // Suppress any in-flight error, abort the request, and close the panel.
    generationRef.current += 1;
    abortRef.current?.abort();
    onClose();
  };

  const handleGenerate = async () => {
    const built = buildTableFillItems(
      { rows, columns },
      targetColumn,
      source,
      replaceExisting,
    );
    if (built.items.length === 0) {
      setError('There is nothing to work from in the chosen column.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    setIsGenerating(true);
    setError(null);
    setNotice(null);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/ai/table-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          preset,
          detail: preset === 'summarize' ? undefined : detail.trim(),
          items: built.items,
        }),
      });
      if (generationRef.current !== generation) return;

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body && typeof body.error === 'string'
          ? body.error
          : 'The AI request failed. Please try again.';
        setIsGenerating(false);
        setError(message);
        return;
      }

      const body = await response.json().catch(() => null);
      if (generationRef.current !== generation) return;
      const values: TableFillValue[] = body && Array.isArray(body.values) ? body.values : [];
      setIsGenerating(false);
      // An answer the route could not use arrives as `[]`. Say so here and lock
      // nothing: handing an empty list on would lock the table over zero
      // suggestions.
      if (values.length === 0) {
        setError("No suggestions came back. Try again, or change the instruction.");
        return;
      }
      onSuggestions(values);
      if (built.skippedForLimit) {
        setNotice(`Filled ${built.items.length} of ${targetRowCount} rows. Run it again for the rest.`);
      }
    } catch {
      if (generationRef.current !== generation) return;
      setIsGenerating(false);
      setError("The AI didn't answer in time.");
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <div
      data-table-fill-panel=""
      className="relative z-[1100] w-[280px] bg-white rounded-xl shadow-xl border border-gray-200 p-3"
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

      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Sparkles className="h-4 w-4 text-purple-500" aria-hidden="true" />
        Fill with AI…
      </div>

      <label className="mb-1 block text-xs text-gray-500" htmlFor="table-fill-preset">What to do</label>
      <select
        id="table-fill-preset"
        data-table-fill-preset=""
        value={preset}
        disabled={isGenerating}
        onChange={(e) => { setPreset(e.target.value as Preset); setError(null); setNotice(null); }}
        className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none"
      >
        {(Object.keys(PRESET_LABELS) as Preset[]).map((value) => (
          <option key={value} value={value}>{PRESET_LABELS[value]}</option>
        ))}
      </select>

      {detailLabel && (
        <div className="mb-2">
          <label className="mb-1 block text-xs text-gray-500" htmlFor="table-fill-detail">{detailLabel}</label>
          <input
            id="table-fill-detail"
            data-table-fill-detail=""
            type="text"
            value={detail}
            disabled={isGenerating}
            maxLength={TABLE_FILL_MAX_INSTRUCTION_CHARS}
            placeholder={detailPlaceholder}
            onChange={(e) => setDetail(e.target.value.slice(0, TABLE_FILL_MAX_INSTRUCTION_CHARS))}
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none"
          />
        </div>
      )}

      <label className="mb-1 block text-xs text-gray-500" htmlFor="table-fill-source">Read from</label>
      <select
        id="table-fill-source"
        data-table-fill-source=""
        value={source === 'row' ? 'row' : String(source)}
        disabled={isGenerating}
        onChange={(e) => setSource(e.target.value === 'row' ? 'row' : Number(e.target.value))}
        className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none"
      >
        <option value="row">Whole row</option>
        {columns.map((name, index) => (
          index === targetColumn ? null : <option key={index} value={index}>{name}</option>
        ))}
      </select>

      <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
        <input
          data-table-fill-replace=""
          type="checkbox"
          checked={replaceExisting}
          disabled={isGenerating}
          onChange={(e) => setReplaceExisting(e.target.checked)}
        />
        Also replace cells that already have text
      </label>

      {error && <div role="alert" className="mb-2 text-xs text-red-600">{error}</div>}
      {notice && <div data-table-fill-notice="" className="mb-2 text-xs text-gray-500">{notice}</div>}

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
          disabled={!canGenerate}
          className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
