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

export type AIRole = typeof AI_ROLE_SOURCE | typeof AI_ROLE_EDIT;

export const AI_ROLES: readonly AIRole[] = [AI_ROLE_SOURCE, AI_ROLE_EDIT];

export const AI_ROLE_LABELS: Record<AIRole, string> = {
  [AI_ROLE_SOURCE]: 'Source AI',
  [AI_ROLE_EDIT]: 'Edit & Rewrite',
};

export function isAIRole(value: unknown): value is AIRole {
  return typeof value === 'string' && (AI_ROLES as readonly string[]).includes(value);
}
