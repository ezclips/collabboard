'use client';

// PATCH-323. The one bridge between CanvasClient (which owns the Board AI
// drawer and its draft state) and the Kanban store (which owns the cards).
//
// CanvasClient cannot call store actions: `KanbanShell` owns `KanbanProvider`,
// and the drawer's "open this card" / "save this answer as a card" actions need
// to. So a small component rendered INSIDE the provider registers the
// store-backed handlers upward, and a context carries the host's
// "ask about this card" action downward to the card menu. Nothing here reads or
// writes the board directly -- every call goes through the store's own actions.

import { createContext, useContext, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useKanbanData, useKanbanPersistence } from './store';

/** One answer reduced to a card title + description, ready to create. */
export interface KanbanBoardAiAnswerInput {
  readonly title: string;
  readonly description: string;
}

/** What the store can do for Board AI. Registered upward by the bridge. */
export interface KanbanBoardAiBridgeApi {
  /** Open the card editor, or say the card is gone. */
  openCard(cardId: string): void;
  /**
   * Create a card from an answer in the FIRST column (first row if any), at the
   * bottom. Returns the new card id, or null when the board has no columns.
   */
  createCardFromAnswer(input: KanbanBoardAiAnswerInput): Promise<string | null>;
  /** The id + title a citation chip shows, or null for a card that is gone. */
  cardSummary(cardId: string): { readonly id: string; readonly title: string } | null;
}

/** What CanvasClient can do for the card menu. */
export interface KanbanBoardAiHost {
  /** Attach this card to the next Board AI message and open the drawer. */
  askAboutCard(card: { readonly id: string; readonly title: string }): void;
}

/**
 * The host action, carried down to the card menu.
 *
 * A context rather than a prop because the menu lives several components below
 * the provider and is reached through Board/Column/Card, none of which have any
 * business knowing about Board AI. Default null: the menu simply offers nothing
 * where no host is present (a test, a preview, or any non-Kanban use).
 */
export const KanbanBoardAiContext = createContext<KanbanBoardAiHost | null>(null);

export function useKanbanBoardAi(): KanbanBoardAiHost | null {
  return useContext(KanbanBoardAiContext);
}

/** The longest card title an answer may produce from its first line. */
export const KANBAN_BOARD_AI_CARD_TITLE_MAX = 80;

/**
 * The first line of an answer, with markdown stripped, as a card title.
 *
 * The answer is markdown, so the first line is often a `## Heading` or a
 * `- bullet`; both would make a poor card label as written. Only inline markup
 * is removed -- the full text still reaches the card as its description, so
 * nothing is lost, only tidied.
 */
export function boardAiAnswerCardTitle(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';
  const stripped = firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]*\)/g, '$1')
    .trim();
  if (stripped.length === 0) return 'Board AI answer';
  return stripped.length <= KANBAN_BOARD_AI_CARD_TITLE_MAX
    ? stripped
    : `${stripped.slice(0, KANBAN_BOARD_AI_CARD_TITLE_MAX - 1)}…`;
}

/**
 * Registers the store-backed Board AI actions upward, and renders nothing.
 *
 * Rendered inside `KanbanProvider`, so it can use the store's own actions and
 * data. It re-registers whenever the data or actions change, so `openCard` and
 * `cardSummary` always see the current board rather than a stale snapshot.
 */
export function KanbanBoardAiBridge({
  onRegister,
}: {
  onRegister?: (api: KanbanBoardAiBridgeApi | null) => void;
}) {
  const actions = useKanbanPersistence();
  const data = useKanbanData();

  const api = useMemo<KanbanBoardAiBridgeApi>(() => ({
    openCard(cardId) {
      // The card may have been deleted since the citation was written. Saying so
      // is the honest answer; opening the editor on a missing card is not.
      const exists = data.cards.some((card) => card.id === cardId);
      if (!exists) {
        toast.error('This card no longer exists');
        return;
      }
      actions.setActiveCard(cardId);
    },
    async createCardFromAnswer({ title, description }) {
      const firstColumn = [...data.columns].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      if (!firstColumn) return null;
      const firstRow = [...data.rows].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      const cardId = crypto.randomUUID();
      const order = data.cards.filter((card) => card.columnId === firstColumn.id).length;
      await actions.addCard({
        id: cardId,
        label: title,
        description,
        columnId: firstColumn.id,
        rowId: firstRow?.id,
        order,
      });
      return cardId;
    },
    cardSummary(cardId) {
      const card = data.cards.find((candidate) => candidate.id === cardId);
      return card ? { id: card.id, title: card.label } : null;
    },
  }), [actions, data.cards, data.columns, data.rows]);

  useEffect(() => {
    onRegister?.(api);
    return () => { onRegister?.(null); };
  }, [api, onRegister]);

  return null;
}
