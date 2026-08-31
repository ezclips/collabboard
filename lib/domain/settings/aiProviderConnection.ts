import { z } from 'zod';

/**
 * AI provider (BYOK) domain contract.
 *
 * The types here are the CLIENT-SAFE half of the feature. An
 * `AIProviderConnection` describes a configured provider well enough to render
 * and manage it in Settings, and it structurally cannot carry secret material:
 * there is no apiKey, no ciphertext, no IV and no auth tag on this type, and
 * none may ever be added. Secret material lives in ai_provider_credentials and
 * never leaves the server.
 *
 * "CollabBoard Default" is intentionally NOT a provider type and not a
 * connection: it is the absence of a role preference, resolved server-side to
 * the environment-backed default provider.
 *
 * A user-supplied base URL (custom OpenAI-compatible endpoint) is absent by
 * design -- it is an SSRF surface and is deferred to a later phase.
 */

export const AI_PROVIDER_TYPES = ['openai', 'anthropic', 'gemini', 'openrouter'] as const;

export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number];

export function isAIProviderType(value: unknown): value is AIProviderType {
  return typeof value === 'string' && (AI_PROVIDER_TYPES as readonly string[]).includes(value);
}

/** Client-safe provider metadata. Never widen this with credential material. */
export interface AIProviderConnection {
  readonly id: string;
  readonly providerType: AIProviderType;
  readonly displayName: string;
  /** Masked suffix of the stored key, for recognition only. */
  readonly keyHint: string;
  readonly defaultModel: string | null;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What a caller supplies to create a connection. The key is separate and transient. */
export interface AIProviderConnectionInput {
  readonly providerType: AIProviderType;
  readonly displayName: string;
  readonly defaultModel: string | null;
}

/** A role's resolved configuration. A null connectionId means CollabBoard Default. */
export interface AIRolePreference {
  readonly role: string;
  readonly connectionId: string | null;
  readonly modelId: string | null;
}

export const DISPLAY_NAME_MAX = 120;
export const MODEL_ID_MAX = 200;

/** Characters kept from the end of an API key for the masked hint. */
export const KEY_HINT_LENGTH = 4;

export const aiProviderConnectionInputSchema = z.object({
  providerType: z.enum(AI_PROVIDER_TYPES),
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
  defaultModel: z.string().trim().min(1).max(MODEL_ID_MAX).nullable(),
});

/**
 * No provider-specific key-format assumptions: providers use different
 * prefixes and lengths, so this only rejects the obviously unusable.
 */
export const aiProviderApiKeySchema = z.string().trim().min(8).max(512);

/**
 * The ONLY masked representation of a key that may be persisted or shown. The
 * result is at most KEY_HINT_LENGTH characters, so it can never round-trip
 * into a usable credential -- and a key shorter than that yields whatever
 * little it has rather than padding out to a fixed width.
 */
export function aiCredentialKeyHint(apiKey: string): string {
  return apiKey.slice(-KEY_HINT_LENGTH);
}
