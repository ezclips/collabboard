'use client';

/**
 * PATCH-356. "Set up this board with AI": pick a quick preset or describe the
 * plan, generate a starter-board proposal, review it, and Create board. The AI
 * only PROPOSES; Create runs the picker's existing `applyTemplate` command
 * (rollback included). Nothing is written until Create.
 */

import React, { useState } from 'react';
import { ChevronLeft, ListChecks, Loader2, Sparkles, StickyNote, Table2 } from 'lucide-react';

import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import {
  BOARD_SETUP_DESCRIPTION_MAX,
  BOARD_SETUP_PRESETS,
  boardSetupToTemplate,
  type BoardSetupItem,
  type BoardSetupPreset,
  type BoardSetupResult,
} from '@/lib/domain/ai/boardSetup';
import { requestBoardSetup } from '@/lib/infra/ai/requestBoardSetup';

export interface BoardSetupAssistantProps {
  readonly boardId: string;
  /** The picker's existing applyTemplate: same command, rollback, reveal, onApplied. */
  readonly onCreate: (template: BoardTemplate) => Promise<boolean>;
  /** Return to the picker's template list. */
  readonly onBack: () => void;
}

const UNUSABLE = "The AI's answer couldn't be used — try again.";
const CREATE_FAILED = 'The board could not be created. Nothing was changed — try again.';

function ItemIcon({ type }: { type: BoardSetupItem['type'] }) {
  if (type === 'todo') return <ListChecks className="h-3 w-3 shrink-0" aria-hidden="true" />;
  if (type === 'table') return <Table2 className="h-3 w-3 shrink-0" aria-hidden="true" />;
  return <StickyNote className="h-3 w-3 shrink-0" aria-hidden="true" />;
}

export function BoardSetupAssistant({ boardId, onCreate, onBack }: BoardSetupAssistantProps) {
  const [preset, setPreset] = useState<BoardSetupPreset | null>(null);
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BoardSetupResult | null>(null);

  const canGenerate = !generating && (preset !== null || description.trim().length > 0);

  const generate = () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    void (async () => {
      const response = await requestBoardSetup({
        boardId,
        preset: preset ?? undefined,
        description: description.trim() || undefined,
      });
      setGenerating(false);
      if (!response.ok) {
        setError(response.message);
        return;
      }
      if (response.result === null) {
        setError(UNUSABLE);
        return;
      }
      setResult(response.result);
    })();
  };

  const create = () => {
    if (!result || creating) return;
    setCreating(true);
    setError(null);
    void (async () => {
      const ok = await onCreate(boardSetupToTemplate(result));
      setCreating(false);
      if (!ok) setError(CREATE_FAILED);
    })();
  };

  const backButton = (
    <button
      type="button"
      data-board-setup-back="true"
      onClick={onBack}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Back
    </button>
  );

  if (result) {
    return (
      <div data-board-setup-assistant="true" className="space-y-3 px-4 pb-3">
        <div data-board-setup-preview="true" className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">{result.title || 'Your board'}</p>
          {result.intro ? <p className="text-xs text-slate-600">{result.intro}</p> : null}
          <ul className="space-y-2">
            {result.columns.map((column, columnIndex) => (
              <li key={columnIndex} data-board-setup-column="true" className="space-y-0.5">
                <p className="text-xs font-medium text-slate-700">{column.title}</p>
                <ul className="space-y-0.5">
                  {column.items.map((item, itemIndex) => (
                    <li
                      key={itemIndex}
                      data-board-setup-item={item.type}
                      className="flex items-center gap-1 text-[11px] text-slate-500"
                    >
                      <ItemIcon type={item.type} />
                      <span className="truncate">{item.title || item.type}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        {error ? <p data-board-setup-error="true" className="text-xs text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          {backButton}
          <button
            type="button"
            data-board-setup-try-again="true"
            onClick={() => { setResult(null); setError(null); }}
            disabled={creating}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Try again
          </button>
          <button
            type="button"
            data-board-setup-create="true"
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {creating ? 'Creating…' : 'Create board'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-board-setup-assistant="true" className="space-y-3 px-4 pb-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Set up this board with AI
        </h3>
        <p className="text-xs text-slate-500">Pick an option or describe what you&apos;re planning.</p>
      </div>

      <div className="flex flex-wrap gap-1">
        {BOARD_SETUP_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            data-board-setup-preset={option.id}
            aria-pressed={preset === option.id}
            onClick={() => setPreset(preset === option.id ? null : option.id)}
            className={preset === option.id
              ? 'rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700'
              : 'rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50'}
          >
            {option.label}
          </button>
        ))}
      </div>

      <textarea
        data-board-setup-description="true"
        value={description}
        maxLength={BOARD_SETUP_DESCRIPTION_MAX}
        placeholder="Or describe it…"
        rows={3}
        onChange={(event) => setDescription(event.target.value)}
        className="w-full resize-none rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
      />

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span data-board-setup-counter="true">{description.length}/{BOARD_SETUP_DESCRIPTION_MAX}</span>
        <span>Uses 1 AI credit</span>
      </div>

      {generating ? (
        <p data-board-setup-generating="true" className="text-xs text-slate-500">Building your board…</p>
      ) : null}
      {error ? <p data-board-setup-error="true" className="text-xs text-red-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        {backButton}
        <button
          type="button"
          data-board-setup-generate="true"
          onClick={generate}
          disabled={!canGenerate}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {generating ? 'Building…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

export default BoardSetupAssistant;
