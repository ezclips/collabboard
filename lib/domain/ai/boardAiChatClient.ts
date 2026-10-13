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
import type { BoardAiCitationEnvelope } from './boardAiChatCitation';
import type { BoardAiContextView } from './boardAiChatContext';
import type { KanbanProposedChange } from './kanbanChangeProposals';

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
  /**
   * Which of the attached sources this answer actually used, or null.
   *
   * Server-built from the blocks it authorized for that turn, and sanitized on
   * the way out exactly as `context` is: identity plus a server-authored
   * label, never source text, and never anything a model wrote.
   */
  readonly citations?: BoardAiCitationEnvelope | null;
  /**
   * PATCH-345. What the provider reported for this assistant turn, or null/absent
   * when it reported nothing (and always for a user message). Tokens, not money.
   */
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  /**
   * PATCH-350. Card changes this answer proposed on a Kanban turn, or
   * absent/null when it proposed none. Present only in the POST response that
   * generated it -- the proposals are not persisted, so a reloaded thread
   * carries the answer text but no proposals.
   *
   * PATCH-351. Each change may carry `warnings`: plain-words plan problems the
   * server found (a dependency violated, a start before today). A warned change
   * is shown in amber and unticked by default.
   */
  readonly proposedChanges?: readonly KanbanProposedChange[] | null;
}
