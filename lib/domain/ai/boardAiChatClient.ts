/**
 * The shapes the Board AI Chat API hands a browser.
 *
 * A deliberately separate, narrower view of the same conversation the server
 * stores. `BoardAiThread` and `BoardAiMessage` in boardAiChat.ts carry storage
 * concerns -- ownership ids, the jsonb columns -- that no client needs and the
 * routes therefore never send. Naming the wire shape here keeps that
 * projection explicit: a field added to the row does not silently become a
 * field the browser receives.
 *
 * Browser-safe by construction: no credential type is imported, and there is
 * nothing here a connection id or key could travel in.
 */

import { BOARD_AI_MESSAGE_ROLES, type BoardAiMessageRole } from './boardAiChat';
import type { BoardAiContextView } from './boardAiChatContext';

/** Re-exported so a client bounds its composer by the SAME number the route enforces. */
export const BOARD_AI_CHAT_MESSAGE_MAX = 4000;

export const BOARD_AI_CHAT_ROLES = BOARD_AI_MESSAGE_ROLES;

export interface BoardAiChatThreadSummary {
  readonly id: string;
  /** Null until something names it; V1 names none. */
  readonly title: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BoardAiChatMessageView {
  readonly id: string;
  readonly role: BoardAiMessageRole;
  readonly content: string;
  /** Display names only, and only on an assistant turn. Never a credential. */
  readonly provider: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  /**
   * The sanitized view of what this message had attached, or null. Identity
   * plus the server's own label and excerpt -- enough to redraw a chip after a
   * reload, and never the source text itself, which the server reloads from
   * identity on every turn.
   */
  readonly context: BoardAiContextView | null;
}
