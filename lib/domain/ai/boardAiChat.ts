/**
 * Board AI Chat V1 -- domain shapes for a private, board-scoped chat.
 *
 * A thread belongs to one board AND one user. Two collaborators on the same
 * board hold entirely separate histories, so nothing here carries an author or
 * a visibility flag: privacy is structural, not a field.
 *
 * Deliberately says nothing about PROVIDER selection, MODEL resolution, AI
 * ROLES or agents. `provider` and `model` below are informational labels
 * recorded alongside an assistant reply -- what produced it -- and never inputs
 * to execution. No credential type belongs in this file, and none is imported.
 */

import type { BoardId, UserId } from '../core/ids';

/**
 * The roles V1 PERSISTS. A system prompt is constructed per request by the
 * execution layer and is not conversation the user owns, so it is not stored
 * and not a member here.
 *
 * A plain string union over a text column with a CHECK constraint, matching
 * `aiRoles.ts`'s reasoning: adding a role later is an application change, never
 * a schema migration.
 */
export const BOARD_AI_MESSAGE_ROLES = ['user', 'assistant'] as const;

export type BoardAiMessageRole = (typeof BOARD_AI_MESSAGE_ROLES)[number];

export function isBoardAiMessageRole(value: unknown): value is BoardAiMessageRole {
  return typeof value === 'string' && (BOARD_AI_MESSAGE_ROLES as readonly string[]).includes(value);
}

/**
 * Storage capacity for the later context and citation slices, typed as JSON
 * rather than `any` so nothing can be smuggled through this shape today.
 *
 * BCHAT-A writes neither. The real `BoardAiContext` union and the citation type
 * arrive with the slices that authorize them server-side; giving them a
 * permissive shape now would invite a client to define what a context is.
 */
export type BoardAiJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly BoardAiJsonValue[]
  | { readonly [key: string]: BoardAiJsonValue };

export interface BoardAiThread {
  readonly id: string;
  readonly boardId: BoardId;
  readonly userId: UserId;
  /** Null until a thread is named; V1 never invents one. */
  readonly title: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BoardAiMessage {
  readonly id: string;
  readonly threadId: string;
  readonly role: BoardAiMessageRole;
  readonly content: string;
  /** Both null for a user message, and for any reply whose origin was not recorded. */
  readonly provider: string | null;
  readonly model: string | null;
  readonly context: BoardAiJsonValue | null;
  readonly citations: BoardAiJsonValue | null;
  readonly createdAt: string;
}

/**
 * Neither input carries `userId` or `boardId`: both come from the repository's
 * own scoped arguments, so a caller cannot describe a thread belonging to
 * someone else. The database repeats the same rule in its WITH CHECK.
 */
export interface CreateBoardAiThreadInput {
  readonly title?: string | null;
}

export interface AppendBoardAiMessageInput {
  readonly role: BoardAiMessageRole;
  readonly content: string;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly context?: BoardAiJsonValue | null;
  readonly citations?: BoardAiJsonValue | null;
}

export const BOARD_AI_THREAD_TITLE_MAX = 200;

/**
 * A ceiling, not a token budget. It exists so a single row cannot be used to
 * park unbounded text in the database; what a model is actually sent is the
 * execution layer's concern in a later slice.
 */
export const BOARD_AI_MESSAGE_CONTENT_MAX = 32_000;

/** Empty or whitespace-only is not a message, and is refused before any write. */
export function isBoardAiMessageContentValid(content: string): boolean {
  return content.trim().length > 0 && content.length <= BOARD_AI_MESSAGE_CONTENT_MAX;
}

/**
 * Normalises a supplied title to what should be stored. Absent, empty and
 * whitespace-only all mean "unnamed" -- one stored representation for one
 * state, the same rule `aiRolePreferenceRepository` applies to a default.
 */
export function normalizeBoardAiThreadTitle(title: string | null | undefined): string | null {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, BOARD_AI_THREAD_TITLE_MAX);
}
