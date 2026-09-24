"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

import { AI_ROLE_EDIT } from '@/lib/ai/aiRoles';
import AIRoleModelChooser from '@/components/ai/AIRoleModelChooser';
import { TEXT_ACTION_INSTRUCTION_MAX } from '@/lib/ai/textActions';
import {
  tableAskAIInstruction,
  type TableAskAIPreset,
} from '@/lib/domain/ai/tableAskAI';

/**
 * PATCH-168. "Ask AI…" on the cells the user has selected.
 *
 * The table's own version of the selected-text panel: summarize, explain,
 * translate or ask a question about the selection, using the same quick-action
 * route and Edit & Rewrite model that Notes and Documents use. It writes NOTHING
 * itself -- `Insert into cell` hands the answer to the editor, which owns the
 * one writer -- and the table stays editable while the panel is open.
 *
 * The selection text is captured by the editor AT OPEN TIME and passed in, so
 * moving the selection afterwards cannot silently change what the question was
 * asked about. The active cell for `Insert into cell` is read live, so the
 * answer lands in the cell the user is looking at when they click.
 */

const REQUEST_TIMEOUT_MS = 25_000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'preview'; result: string }
  | { kind: 'error'; message: string };

type DetailPreset = 'translate' | 'question';

export interface TableAskAIPanelProps {
  /** The selection as text, captured at open time. */
  readonly text: string;
  readonly truncated: boolean;
  readonly cellCount: number;
  /** The cell `Insert into cell` would write to, read live from the editor. */
  readonly activeCell: { row: number; col: number } | null;
  readonly activeCellHasText: boolean;
  /** Hands the answer to the editor; this panel never writes the grid. */
  readonly onInsert: (value: string) => void;
  readonly onClose: () => void;
}

export default function TableAskAIPanel({
  text,
  truncated,
  cellCount,
  activeCell,
  activeCellHasText,
  onInsert,
  onClose,
}: TableAskAIPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [detailPreset, setDetailPreset] = useState<DetailPreset | null>(null);
  const [detail, setDetail] = useState('');
  const [modelError, setModelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const copiedTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const run = async (preset: TableAskAIPreset, detailValue?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;
    setPhase({ kind: 'loading' });
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/ai/text-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'custom',
          selectedText: text,
          instruction: tableAskAIInstruction(preset, detailValue),
          // The stored role preference the server resolves a provider from. No
          // provider, model or key travels with the request.
          purpose: AI_ROLE_EDIT,
        }),
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
      if (!body || typeof body.text !== 'string' || !body.text.trim()) {
        setPhase({ kind: 'error', message: 'The AI request failed. Please try again.' });
        return;
      }
      setPhase({ kind: 'preview', result: body.text });
    } catch {
      if (generationRef.current !== generation) return;
      setPhase({ kind: 'error', message: "The AI didn't answer in time." });
    } finally {
      clearTimeout(timer);
    }
  };

  const handleClose = () => {
    // Invalidate any in-flight response before aborting, so its catch is a no-op.
    generationRef.current += 1;
    abortRef.current?.abort();
    onClose();
  };

  const handleInsert = () => {
    if (phase.kind !== 'preview' || !activeCell) return;
    // A cell holds one line: collapse the answer's whitespace. The editor writes
    // it through the same pure path every other change uses, styles untouched.
    onInsert(phase.result.replace(/\s+/g, ' ').trim());
  };

  const handleCopy = async () => {
    if (phase.kind !== 'preview') return;
    try {
      await navigator.clipboard.writeText(phase.result);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // A clipboard the browser refuses is not worth an error line.
    }
  };

  const askAgain = () => {
    setPhase({ kind: 'idle' });
    setDetailPreset(null);
    setDetail('');
  };

  const isLoading = phase.kind === 'loading';
  const isEmpty = text.length === 0;

  return (
    <div
      data-table-ask-ai-panel=""
      className="relative z-[1100] w-[300px] bg-white rounded-xl shadow-xl border border-gray-200 p-3"
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

      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Sparkles className="h-4 w-4 text-purple-500" aria-hidden="true" />
          Ask AI
        </div>
        {!isEmpty && (
          <AIRoleModelChooser
            role={AI_ROLE_EDIT}
            label="Edit & Rewrite model"
            attributePrefix="table-ask-ai"
            saveErrorMessage="Could not change the model."
            disabled={isLoading}
            onError={setModelError}
          />
        )}
      </div>

      <p data-table-ask-ai-count="" className="mb-2 text-xs text-gray-400">
        {cellCount} cells selected{truncated ? ' (only the first part fits)' : ''}
      </p>

      {modelError && <div role="alert" className="mb-2 text-xs text-red-600">{modelError}</div>}

      {isEmpty ? (
        <p className="text-xs text-gray-500">The selected cells are empty.</p>
      ) : (
        <>
          {phase.kind !== 'preview' && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => run('summarize')}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Summarize
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => run('explain')}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Explain
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setDetailPreset('translate')}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Translate…
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setDetailPreset('question')}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Ask a question…
              </button>

              {detailPreset && (
                <div className="mt-1 flex flex-col gap-1 border-t border-gray-100 pt-2">
                  <label
                    className="text-xs text-gray-500"
                    htmlFor="table-ask-ai-detail"
                  >
                    {detailPreset === 'translate' ? 'Language' : 'Question'}
                  </label>
                  <input
                    id="table-ask-ai-detail"
                    data-table-ask-ai-detail=""
                    type="text"
                    value={detail}
                    disabled={isLoading}
                    maxLength={TEXT_ACTION_INSTRUCTION_MAX}
                    placeholder={detailPreset === 'translate' ? 'German' : 'What changed?'}
                    onChange={(e) => setDetail(e.target.value.slice(0, TEXT_ACTION_INSTRUCTION_MAX))}
                    className="rounded border border-gray-200 px-2 py-1 text-sm outline-none"
                  />
                  <button
                    type="button"
                    disabled={isLoading || !detail.trim()}
                    onClick={() => run(detailPreset, detail)}
                    className="self-start rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Go
                  </button>
                </div>
              )}
            </div>
          )}

          {isLoading && <div role="status" className="mt-2 text-xs text-gray-400">Thinking…</div>}

          {phase.kind === 'error' && (
            <div role="alert" className="mt-2 text-xs text-red-600">{phase.message}</div>
          )}

          {phase.kind === 'preview' && (
            <div className="mt-1">
              <div className="mb-1 text-xs text-gray-500">Result</div>
              {/* Plain text, never HTML: the answer is rendered as a string. */}
              <div
                data-table-ask-ai-result=""
                className="mb-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-2 text-sm"
              >
                {phase.result}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!activeCell}
                  onClick={handleInsert}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {activeCell && activeCellHasText ? 'Replace cell text' : 'Insert into cell'}
                </button>
                {!activeCell && <span className="text-[10px] text-gray-400">Select a cell first</span>}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={askAgain}
                  className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
                >
                  Ask again
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
