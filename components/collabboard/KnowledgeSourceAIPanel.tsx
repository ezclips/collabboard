"use client";

import React, { useEffect, useRef, useState } from 'react';
import { TEXT_ACTION_INSTRUCTION_MAX, TEXT_ACTION_SELECTED_TEXT_MAX } from '@/lib/ai/textActions';

/**
 * PDF Source AI Phase 1. The right-pane AI surface for one exact PDF text
 * selection. Deliberately editor-independent -- unlike SelectedTextAIPanel
 * (KNI-R4), it never touches a TipTap `Editor`: it only ever acts on the
 * plain `selectedText` string handed to it, and its one write-adjacent
 * action is `onNotePost`, which the drawer turns into a staged Note draft.
 * The async state machine (abort/generation/timeout/retry) mirrors
 * SelectedTextAIPanel's proven shape; it is not imported from it because the
 * two components' apply semantics are unrelated (insert-into-editor vs.
 * hand-off-to-Note-creation).
 */
export interface KnowledgeSourceAIPanelProps {
  /** The exact captured source text this session was activated on -- an
   * IMMUTABLE snapshot owned by the drawer, never re-read from a live PDF
   * selection. */
  readonly selectedText: string;
  /** Forwards the AI's plain-text result to the drawer's Note-creation seam. */
  readonly onNotePost: (resultText: string) => void;
  /** Returns the right pane to Source Notes. Never closes the reader. */
  readonly onClose: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'preview'; result: string }
  | { kind: 'error'; message: string };

const REQUEST_TIMEOUT_MS = 30_000;
const SUMMARIZE_INSTRUCTION = 'Summarize the selected text clearly and concisely.';
const EXPLAIN_INSTRUCTION = 'Explain the selected text clearly in plain language.';

export default function KnowledgeSourceAIPanel({ selectedText, onNotePost, onClose }: KnowledgeSourceAIPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [customInstruction, setCustomInstruction] = useState('');
  const [lastInstruction, setLastInstruction] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // The endpoint's own bound, checked here too so this panel fails closed
  // even if a future caller somehow reaches it with an over-limit snapshot.
  const overLimit = selectedText.length > TEXT_ACTION_SELECTED_TEXT_MAX;

  const run = async (instruction: string) => {
    if (overLimit || !instruction.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;
    setLastInstruction(instruction);
    setPhase({ kind: 'loading' });
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/ai/text-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        // ONLY these three fields, ever: no document id, page text, board
        // content or source-reference metadata travels with this request.
        body: JSON.stringify({ action: 'custom', selectedText, instruction }),
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

  const retry = () => { if (lastInstruction) void run(lastInstruction); };

  const isLoading = phase.kind === 'loading';
  const excerpt = selectedText.length > 240 ? `${selectedText.slice(0, 240)}…` : selectedText;

  return (
    <div data-knowledge-source-ai-panel="true">
      {/* The mode/back affordance: Source Notes remains one click away at all
          times, in every phase, exactly like the panel it replaces. */}
      <div className="mb-2 flex items-center gap-2 text-[9px] font-medium uppercase leading-none tracking-wider">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to Source Notes"
          className="text-gray-400 hover:text-gray-600"
        >
          Source Notes
        </button>
        <span className="text-gray-300" aria-hidden="true">|</span>
        <span className="text-gray-800">AI</span>
      </div>

      <p className="mb-2 text-xs text-gray-400">Only the selected text is sent to AI.</p>
      <div className="mb-3 whitespace-pre-wrap rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600">
        {excerpt}
      </div>

      {overLimit ? (
        <p role="alert" className="text-xs text-red-600">
          AI supports selections up to 4,000 characters.
        </p>
      ) : null}

      {/* Not disabled while loading, mirroring SelectedTextAIPanel: switching
          to a different action before the first response arrives is a
          normal change-of-mind, and `run()` already aborts/invalidates
          whatever was in flight. */}
      {!overLimit && phase.kind !== 'preview' ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void run(SUMMARIZE_INSTRUCTION)}
            className="rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100"
          >
            Summarize
          </button>
          <button
            type="button"
            onClick={() => void run(EXPLAIN_INSTRUCTION)}
            className="rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100"
          >
            Explain
          </button>
          <div className="mt-1 flex flex-col gap-1 border-t border-gray-100 pt-2">
            <textarea
              value={customInstruction}
              onChange={(event) => setCustomInstruction(event.target.value.slice(0, TEXT_ACTION_INSTRUCTION_MAX))}
              placeholder="Custom prompt..."
              rows={2}
              className="rounded border border-gray-200 px-2 py-1 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!customInstruction.trim()}
              onClick={() => void run(customInstruction.trim())}
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              Ask AI
            </button>
          </div>
        </div>
      ) : null}

      {isLoading && <div role="status" className="mt-2 text-xs text-gray-400">Thinking...</div>}

      {phase.kind === 'error' && (
        <div className="mt-2">
          <div role="alert" className="mb-2 text-xs text-red-600">{phase.message}</div>
          {lastInstruction ? (
            <button type="button" onClick={retry} className="text-xs text-blue-600 hover:underline">Retry</button>
          ) : null}
        </div>
      )}

      {phase.kind === 'preview' && (
        <div className="mt-1">
          <div className="mb-1 text-xs text-gray-500">Result</div>
          {/* Plain text only -- a text child, never dangerouslySetInnerHTML,
              so hostile model output can only ever render as literal text. */}
          <div className="mb-2 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-2 text-sm">
            {phase.result}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onNotePost(phase.result)}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            >
              Note Post
            </button>
            <button type="button" onClick={retry} className="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100">
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
