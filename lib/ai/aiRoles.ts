// AI roles. A role is WHAT the model is being used for, and it is the unit a
// user assigns a provider/model to in Settings -- deliberately separate from
// the provider (OpenAI, Anthropic, ...), the model id, and any future "agent"
// product workflow that may in turn use a configured role.
//
// Roles are plain strings end to end: the database column is text, not a
// Postgres enum, so adding `chat` or `research` later is an application change
// and an INSERT, never a schema migration.

export const AI_ROLE_SOURCE = 'source-ai';
export const AI_ROLE_EDIT = 'edit';
/**
 * Board AI Chat. Exactly what this file's opening note anticipated: a new role
 * is a string and an application change, with no migration -- the preference
 * column is text. It names WHAT the model is being used for and nothing about
 * WHICH provider or model serves it; that stays the user's per-role choice.
 *
 * The Settings screen keeps its own list of configurable roles, so adding this
 * one exposes no new UI. Until a chooser slice adds it there, a user has no
 * stored preference for it, which resolves to CollabBoard Default -- the
 * intended V1 behaviour.
 */
export const AI_ROLE_CHAT = 'board-chat';
/**
 * Component generation: the AI card builder, its Auto-mode classifier, and
 * content conversion.
 *
 * These three routes predate BYOK and called DeepSeek directly with the
 * server's own key, which made them the only AI in the product a user could
 * neither choose a provider for nor spend their own credits on. Naming the role
 * is what lets the same per-user preference every other surface uses govern
 * them too -- still no migration, because the preference column is text.
 *
 * ONE role covers all three routes on purpose. Classification and generation
 * are two halves of a single "build me this card" act, and splitting them would
 * let a user configure a provider for the visible half while an invisible
 * classifier kept running somewhere else.
 */
export const AI_ROLE_COMPONENT = 'component';

export type AIRole =
  | typeof AI_ROLE_SOURCE
  | typeof AI_ROLE_EDIT
  | typeof AI_ROLE_CHAT
  | typeof AI_ROLE_COMPONENT;

export const AI_ROLES: readonly AIRole[] = [
  AI_ROLE_SOURCE,
  AI_ROLE_EDIT,
  AI_ROLE_CHAT,
  AI_ROLE_COMPONENT,
];

export const AI_ROLE_LABELS: Record<AIRole, string> = {
  [AI_ROLE_SOURCE]: 'Source AI',
  [AI_ROLE_EDIT]: 'Edit & Rewrite',
  [AI_ROLE_CHAT]: 'Board Chat',
  [AI_ROLE_COMPONENT]: 'Component Generation',
};

export function isAIRole(value: unknown): value is AIRole {
  return typeof value === 'string' && (AI_ROLES as readonly string[]).includes(value);
}
