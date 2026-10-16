'use client';

/**
 * PATCH-378. The ready-made Board AI actions: a chip row above the composer, and
 * the `/` menu that offers the same actions while the composer's text starts with
 * a slash.
 *
 * A chip SENDS through the drawer's own path -- the one the PATCH-164 starter
 * questions use -- so the answer or the proposal list begins immediately.
 * Choosing from the `/` menu only PUTS the prompt into the composer: there the
 * person is editing, not firing.
 *
 * The wording lives in `lib/domain/ai/boardAiPadletActions.ts`; this file only
 * presents it, so a chip and its menu entry can never disagree.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  actionsForLayout,
  layoutNounFor,
  type BoardAiPadletAction,
} from '@/lib/domain/ai/boardAiPadletActions';

export type BoardAiActionKeyHandler = (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;

export interface BoardAiActionChipsProps {
  /**
   * The board's layout. Falsy hides the whole row AND its menu: Freeform, Kanban
   * and the PDF reader pass nothing, and must not gain a control their layout
   * cannot honour.
   */
  readonly actionLayout?: string | null;
  /**
   * PATCH-380. A guest may ask questions and never restructure the board, so
   * only the `answer` actions are offered -- the same list Map already uses.
   */
  readonly answerOnly?: boolean;
  /** True while a reply streams: every chip is disabled. */
  readonly disabled?: boolean;
  /** The composer's text, which is what opens the `/` menu. */
  readonly draft?: string;
  /** Send a chip's prompt through the drawer's own send path. */
  readonly onSend: (prompt: string) => void;
  /** Put a chosen action's prompt in the composer, where it stays editable. */
  readonly onInsert: (prompt: string) => void;
  /**
   * The composer's keydown belongs to the drawer's textarea, so this hands the
   * drawer a handler to call FIRST: while the menu is open, Arrow/Enter/Escape
   * choose an action instead of sending. Must be stable (a `useCallback`).
   */
  readonly onKeyHandlerChange?: (handler: BoardAiActionKeyHandler | null) => void;
}

export default function BoardAiActionChips({
  actionLayout,
  answerOnly = false,
  disabled = false,
  draft = '',
  onSend,
  onInsert,
  onKeyHandlerChange,
}: BoardAiActionChipsProps) {
  const actions = useMemo(
    () => (actionLayout ? actionsForLayout(actionLayout, { answerOnly }) : []),
    [actionLayout, answerOnly],
  );
  const noun = useMemo(() => layoutNounFor(actionLayout), [actionLayout]);

  /**
   * The menu is DERIVED from the composer: open while the text starts with a
   * slash and at least one action matches. Escape dismisses it WITHOUT eating
   * what was typed -- the dismissal is remembered against the query it dismissed,
   * so the next keystroke opens the menu again.
   */
  const query = draft.startsWith('/') ? draft.slice(1).toLowerCase() : null;
  const matches = useMemo(
    () => (query === null ? [] : actions.filter((action) => action.slash.slice(1).startsWith(query))),
    [actions, query],
  );
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const menuOpen = query !== null && query !== dismissedQuery && matches.length > 0;

  useEffect(() => { setHighlight(0); }, [query]);

  const choose = useCallback((action: BoardAiPadletAction | undefined) => {
    if (!action) return;
    onInsert(action.prompt(noun));
  }, [noun, onInsert]);

  useEffect(() => {
    if (!onKeyHandlerChange) return;
    if (!menuOpen) {
      onKeyHandlerChange(null);
      return;
    }
    const handler: BoardAiActionKeyHandler = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((current) => (current + 1) % matches.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((current) => (current - 1 + matches.length) % matches.length);
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        choose(matches[highlight] ?? matches[0]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedQuery(query);
        return true;
      }
      return false;
    };
    onKeyHandlerChange(handler);
    return () => { onKeyHandlerChange(null); };
  }, [menuOpen, matches, highlight, query, choose, onKeyHandlerChange]);

  if (!actionLayout) return null;

  return (
    <div data-board-ai-actions="true" className="relative">
      {menuOpen ? (
        <ul
          data-board-ai-action-menu="true"
          className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {matches.map((action, index) => (
            <li key={action.id}>
              <button
                type="button"
                data-board-ai-action-menu-item={action.id}
                onClick={() => choose(action)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] ${
                  index === highlight ? 'bg-blue-50 text-blue-800' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium">{action.slash}</span>
                <span className="truncate text-gray-400">{action.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div data-board-ai-action-chips="true" className="flex gap-1.5 overflow-x-auto pb-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-board-ai-action={action.id}
            title={action.label}
            disabled={disabled}
            onClick={() => onSend(action.prompt(noun))}
            className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action.slash}
          </button>
        ))}
      </div>
    </div>
  );
}
