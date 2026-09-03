'use client';

import React from 'react';
import { FileText, StickyNote, TextQuote, X } from 'lucide-react';

import {
  boardAiDraftKey,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';
import type { BoardAiContextItem, BoardAiContextView } from '@/lib/domain/ai/boardAiChatContext';

/**
 * The chips that say what a message carries.
 *
 * Two callers, two sources of truth, and they must not be confused. DRAFT
 * chips describe what the browser has queued and can still be removed.
 * PERSISTED chips describe what the SERVER recorded, and are read-only: they
 * are a record of what an already-sent message was allowed to use, not a
 * handle for using it again. D2 deliberately has no click-to-reuse, because
 * reusing a chip would mean trusting stored display metadata as a request.
 */

function iconFor(type: string) {
  if (type === 'padlet') return StickyNote;
  if (type === 'knowledge-selection') return TextQuote;
  return FileText;
}

export interface BoardAiChatDraftChipsProps {
  readonly items: readonly BoardAiDraftContextItem[];
  readonly onRemove: (key: string) => void;
  readonly disabled?: boolean;
}

export function BoardAiChatDraftChips({ items, onRemove, disabled = false }: BoardAiChatDraftChipsProps) {
  if (items.length === 0) return null;
  return (
    <ul
      data-board-ai-context-drafts="true"
      className="mb-1.5 flex flex-wrap gap-1"
    >
      {items.map((item) => {
        const key = boardAiDraftKey(item);
        const Icon = iconFor(item.request.type);
        return (
          <li
            key={key}
            data-board-ai-context-draft={item.request.type}
            className="flex max-w-full items-center gap-1 rounded border border-blue-200 bg-blue-50 py-0.5 pl-1.5 pr-0.5 text-[11px] text-blue-900"
          >
            <Icon className="h-3 w-3 shrink-0 text-blue-500" aria-hidden="true" />
            <span className="min-w-0 truncate">{item.label}</span>
            {item.detail ? (
              <span className="min-w-0 shrink truncate text-blue-500">· {item.detail}</span>
            ) : null}
            <button
              type="button"
              data-board-ai-context-remove={key}
              aria-label={`Remove ${item.label} from context`}
              disabled={disabled}
              className="shrink-0 rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onRemove(key)}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The label for a persisted chip, built ONLY from what the server sent.
 *
 * `label` and `excerpt` were authored server-side from authoritative content
 * and re-derived through the sanitizer on the way out, so a hand-written row
 * cannot put anything unexpected here. Nothing is fetched to draw a chip.
 */
function persistedText(item: BoardAiContextItem): { title: string; detail: string | null } {
  const title = item.label && item.label.trim().length > 0 ? item.label : 'Source';
  if (item.type === 'knowledge-selection') {
    const quote = item.selectedText ?? item.excerpt;
    return {
      title,
      detail: quote ? `p. ${item.pageNumber ?? '?'} · “${quote}”` : `p. ${item.pageNumber ?? '?'}`,
    };
  }
  if (item.type === 'knowledge-page') {
    return { title, detail: item.pageNumber === undefined ? 'Page' : `p. ${item.pageNumber}` };
  }
  if (item.type === 'padlet') return { title, detail: 'Note' };
  return { title, detail: 'Document' };
}

export interface BoardAiChatPersistedChipsProps {
  readonly context: BoardAiContextView | null;
}

export function BoardAiChatPersistedChips({ context }: BoardAiChatPersistedChipsProps) {
  if (!context || context.items.length === 0) return null;
  return (
    <ul
      data-board-ai-context-persisted="true"
      className="mt-1 flex flex-wrap justify-end gap-1"
    >
      {context.items.map((item, index) => {
        const Icon = iconFor(item.type);
        const { title, detail } = persistedText(item);
        return (
          <li
            // Persisted items are read-only and positional; the server's own
            // order is the only ordering they have.
            key={`${item.type}-${index}`}
            data-board-ai-context-chip={item.type}
            className="flex max-w-full items-center gap-1 rounded border border-gray-200 bg-white/70 px-1.5 py-0.5 text-[10px] text-gray-500"
          >
            <Icon className="h-2.5 w-2.5 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="min-w-0 truncate">{title}</span>
            {detail ? <span className="min-w-0 shrink truncate">· {detail}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
