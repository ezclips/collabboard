"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { X } from 'lucide-react';
import {
  TEXT_ACTIONS,
  TEXT_ACTION_LABELS,
  TEXT_ACTION_INSTRUCTION_MAX,
  type TextAction,
} from '@/lib/ai/textActions';

interface SelectedTextAIPanelProps {
  /** Shared by Note and Document -- this component never reads a live TipTap
   * selection itself; it only ever acts on the captured range/text below. */
  editor: Editor;
  /** The exact range captured synchronously in onAIAction, before the R3
   * context menu's close() nulls its own selectedTextMenuRange. */
  range: { from: number; to: number };
  /** The exact text captured at that same moment via doc.textBetween. */
  capturedText: string;
  onClose: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'preview'; result: string }
  | { kind: 'error'; message: string };

const REQUEST_TIMEOUT_MS = 30_000;

/** Same textBetween semantics used to capture the original text, so the
 * comparison in validateRange is apples-to-apples. */
function readRangeText(editor: Editor, range: { from: number; to: number }): string {
  return editor.state.doc.textBetween(range.from, range.to, '\n', '\n');
}

export default function SelectedTextAIPanel({ editor, range, capturedText, onClose }: SelectedTextAIPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [action, setAction] = useState<TextAction | null>(null);
  const [instruction, setInstruction] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const run = async (nextAction: TextAction, nextInstruction?: string) => {
    if (nextAction === 'custom' && !nextInstruction?.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;
    setAction(nextAction);
    setApplyError(null);
    setPhase({ kind: 'loading' });
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/ai/text-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action: nextAction,
          selectedText: capturedText,
          instruction: nextAction === 'custom' ? nextInstruction?.trim() : undefined,
        }),
      });
      if (generationRef.current !== generation) return;
      if (!res.ok) {
        setPhase({
          kind: 'error',
          message: res.status === 429
            ? 'Too many AI requests. Try again in a minute.'
            : 'AI request failed. Please try again.',
        });
        return;
      }
      const parsed = await res.json().catch(() => null);
      if (generationRef.current !== generation) return;
      if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) {
        setPhase({ kind: 'error', message: 'AI request failed. Please try again.' });
        return;
      }
      setPhase({ kind: 'preview', result: parsed.text });
    } catch {
      if (generationRef.current !== generation) return;
      setPhase({ kind: 'error', message: 'AI request failed. Please try again.' });
    } finally {
      clearTimeout(timer);
    }
  };

  const retry = () => { if (action) run(action, instruction); };

  const validateRange = (): string | null => {
    if (range.from < 0 || range.to > editor.state.doc.content.size || range.from > range.to) {
      return 'The selected text changed. Run the AI action again.';
    }
    if (readRangeText(editor, range) !== capturedText) {
      return 'The selected text changed. Run the AI action again.';
    }
    return null;
  };

  const apply = (mode: 'replace' | 'insert') => {
    if (phase.kind !== 'preview') return;
    const staleError = validateRange();
    if (staleError) { setApplyError(staleError); return; }
    // A plain string given to insertContentAt is parsed as HTML by TipTap's
    // DOMParser -- an explicit text-node object bypasses that parser
    // entirely, so a result containing "<script>" or "<img onerror=...>"
    // can only ever become a literal text node, never markup.
    if (mode === 'replace') {
      editor.chain().focus().insertContentAt(range, { type: 'text', text: phase.result }).run();
    } else {
      editor.chain().focus().insertContentAt(range.to, { type: 'text', text: ` ${phase.result}` }).run();
    }
    onClose();
  };

  const handleClose = () => {
    abortRef.current?.abort();
    generationRef.current += 1;
    onClose();
  };

  const isLoading = phase.kind === 'loading';

  return (
    <div className="relative z-[1100]" data-selected-text-ai-panel="">
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ask AI</div>
        <p className="text-xs text-gray-400 mb-3">Only the selected text is sent to AI.</p>

        {phase.kind !== 'preview' && (
          <div className="flex flex-col gap-1">
            {/* Not disabled while loading: switching to a different action
                before the first response arrives is a normal change-of-mind,
                and run() already aborts/invalidates whatever was in flight. */}
            {TEXT_ACTIONS.filter((a) => a !== 'custom').map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => run(a)}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100"
              >
                {TEXT_ACTION_LABELS[a]}
              </button>
            ))}
            <div className="flex flex-col gap-1 pt-2 mt-1 border-t border-gray-100">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value.slice(0, TEXT_ACTION_INSTRUCTION_MAX))}
                placeholder="Custom instruction..."
                className="text-sm border border-gray-200 rounded px-2 py-1 outline-none"
              />
              <button
                type="button"
                disabled={!instruction.trim()}
                onClick={() => run('custom', instruction)}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                {TEXT_ACTION_LABELS.custom}
              </button>
            </div>
          </div>
        )}

        {isLoading && <div role="status" className="text-xs text-gray-400 mt-2">Thinking...</div>}

        {phase.kind === 'error' && (
          <div className="mt-2">
            <div role="alert" className="text-xs text-red-600 mb-2">{phase.message}</div>
            {action && (
              <button type="button" onClick={retry} className="text-xs text-blue-600 hover:underline">Retry</button>
            )}
          </div>
        )}

        {phase.kind === 'preview' && (
          <div className="mt-1">
            <div className="text-xs text-gray-500 mb-1">Result</div>
            <div className="text-sm border border-gray-200 rounded p-2 bg-gray-50 whitespace-pre-wrap mb-2">
              {phase.result}
            </div>
            {applyError && <div role="alert" className="text-xs text-red-600 mb-2">{applyError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => apply('replace')} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
                Replace selection
              </button>
              <button type="button" onClick={() => apply('insert')} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100">
                Insert after
              </button>
              <button type="button" onClick={retry} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100">
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
