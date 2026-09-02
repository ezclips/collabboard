'use client';

import { getSessionAccessToken } from '@/lib/infra/supabase/sessionToken';
import type { AIProviderConnection, AIProviderType } from '@/lib/domain/settings/aiProviderConnection';
import { DISPLAY_NAME_MAX, MODEL_ID_MAX } from '@/lib/domain/settings/aiProviderConnection';
import { AI_ROLE_CHAT, AI_ROLE_EDIT, AI_ROLE_SOURCE } from '@/lib/ai/aiRoles';

/**
 * Client-side access to the BYOK Settings API.
 *
 * Everything goes over fetch to the authenticated routes under
 * app/api/settings/**; nothing here imports lib/server, where plaintext keys
 * and the service-role client live. A raw key travels OUT in a request body
 * and is never stored, logged, or read back -- no endpoint returns one.
 */

/**
 * The configurable roles, in display order. Board Chat joined at BCHAT-C,
 * which is what lets its provider/model be chosen at all -- the chat route
 * resolves AI_ROLE_CHAT through the same per-user preference every other role
 * uses, so this list is the whole of the chooser's authority.
 */
export const AI_ROLES = [AI_ROLE_SOURCE, AI_ROLE_EDIT, AI_ROLE_CHAT] as const;

export type AISettingsRole = (typeof AI_ROLES)[number];

export interface AIRoleAssignment {
  readonly connectionId: string | null;
  readonly modelId: string | null;
}

export type AIRoleAssignments = Record<string, AIRoleAssignment>;

/** Text labels only -- no brand assets. */
export const AI_PROVIDER_LABELS: Record<AIProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
};

export const AI_ROLE_LABELS: Record<AISettingsRole, string> = {
  [AI_ROLE_SOURCE]: 'Source AI',
  [AI_ROLE_EDIT]: 'Edit & Rewrite',
  [AI_ROLE_CHAT]: 'Board Chat',
};

export const AI_ROLE_DESCRIPTIONS: Record<AISettingsRole, string> = {
  [AI_ROLE_SOURCE]: 'AI actions on selected source text and research material.',
  [AI_ROLE_EDIT]: 'Improve, shorten, fix grammar, and other selected-text editing actions.',
  [AI_ROLE_CHAT]: 'Your private Board AI conversation.',
};

/** What CollabBoard Default resolves to, shown read-only. */
export const COLLABBOARD_DEFAULT_MODEL = 'deepseek-chat';

/** Input bounds, mirrored from the domain contract the routes validate against. */
export const DISPLAY_NAME_LIMIT = DISPLAY_NAME_MAX;
export const MODEL_ID_LIMIT = MODEL_ID_MAX;

/**
 * A failed request, reduced to something safe to render.
 *
 * `sessionExpired` is true ONLY for 401, CollabBoard's own auth. A provider
 * rejecting a stored key arrives as 400 `authentication_failed` and must never
 * be treated as a session problem -- that would sign the user out because
 * their OpenAI key was wrong.
 */
export class AISettingsRequestError extends Error {
  readonly status: number;
  readonly category: string | null;
  readonly sessionExpired: boolean;

  constructor(message: string, status: number, category: string | null) {
    super(message);
    this.name = 'AISettingsRequestError';
    this.status = status;
    this.category = category;
    this.sessionExpired = status === 401;
  }
}

interface AISettingsFetchOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
}

/** Attaches the bearer token and normalizes failures. Bodies are never logged. */
export async function aiSettingsFetch<T>(path: string, options: AISettingsFetchOptions = {}): Promise<T> {
  const token = await getSessionAccessToken();
  if (!token) {
    throw new AISettingsRequestError('Not authenticated. Please sign in again.', 401, null);
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown; category?: unknown }
    | null;

  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'The request failed.';
    const category = typeof payload?.category === 'string' ? payload.category : null;
    throw new AISettingsRequestError(message, response.status, category);
  }

  return payload as T;
}

export async function fetchAIProviders(): Promise<readonly AIProviderConnection[]> {
  const payload = await aiSettingsFetch<{ providers?: readonly AIProviderConnection[] }>(
    '/api/settings/ai-providers',
  );
  return payload.providers ?? [];
}

export async function fetchAIRoles(): Promise<AIRoleAssignments> {
  const payload = await aiSettingsFetch<{ roles?: AIRoleAssignments }>('/api/settings/ai-roles');
  return payload.roles ?? {};
}

export interface CreateAIProviderInput {
  readonly providerType: AIProviderType;
  readonly displayName: string;
  readonly apiKey: string;
  readonly defaultModel: string | null;
}

export async function createAIProvider(input: CreateAIProviderInput): Promise<AIProviderConnection> {
  const payload = await aiSettingsFetch<{ provider: AIProviderConnection }>('/api/settings/ai-providers', {
    method: 'POST',
    body: input,
  });
  return payload.provider;
}

export interface UpdateAIProviderInput {
  readonly displayName?: string;
  readonly defaultModel?: string | null;
}

export async function updateAIProvider(
  id: string,
  changes: UpdateAIProviderInput,
): Promise<AIProviderConnection> {
  const payload = await aiSettingsFetch<{ provider: AIProviderConnection }>(
    `/api/settings/ai-providers/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: changes },
  );
  return payload.provider;
}

export async function replaceAIProviderKey(id: string, apiKey: string): Promise<AIProviderConnection> {
  const payload = await aiSettingsFetch<{ provider: AIProviderConnection }>(
    `/api/settings/ai-providers/${encodeURIComponent(id)}/key`,
    { method: 'PUT', body: { apiKey } },
  );
  return payload.provider;
}

export async function deleteAIProvider(id: string): Promise<void> {
  await aiSettingsFetch<{ success: boolean }>(`/api/settings/ai-providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Verify a stored connection: whether it worked and when, never the reply. */
export async function testAIProvider(id: string, model?: string | null): Promise<string | null> {
  const payload = await aiSettingsFetch<{ ok: boolean; verifiedAt: string | null }>(
    `/api/settings/ai-providers/${encodeURIComponent(id)}/test`,
    { method: 'POST', body: model ? { model } : {} },
  );
  return payload.verifiedAt ?? null;
}

export async function saveAIRole(
  role: AISettingsRole,
  connectionId: string | null,
  modelId: string | null,
): Promise<void> {
  await aiSettingsFetch<{ role: string }>('/api/settings/ai-roles', {
    method: 'PUT',
    body: { role, connectionId, modelId },
  });
}

/** `Last verified 3 Feb 2026, 14:05` -- historical, never "currently valid". */
export function formatVerifiedAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
