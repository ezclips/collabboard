// Provider execution contract for AI generation.
//
// SERVER ONLY. Never import this (or anything under providers/) from a
// 'use client' module: every adapter handles a plaintext API key.
//
// The contract is deliberately narrow -- one call in, plain text out. No
// streaming, no conversation state, no usage accounting, and no
// provider-specific response object ever travels upward: an adapter returns a
// plain string or throws a normalized AIProviderError.
//
// It now carries OPTIONAL inline image parts alongside the user text. That is
// the only widening: still one call, still a string back, still no SDK and no
// second execution path. An adapter that cannot carry images must THROW rather
// than drop them -- see AIGenerateTextInput.images.

import type { AIProviderType } from '../../../domain/settings/aiProviderConnection';

/**
 * Providers this server can actually execute against.
 *
 * DeepSeek is deliberately NOT part of the user-facing `AIProviderType`: it is
 * the CollabBoard-default execution provider, backed by a server environment
 * key, and no user ever configures a connection row for it. Widening
 * `AIProviderType` instead would offer it as a BYOK choice in Settings.
 */
export type AIExecutionProvider = 'deepseek' | AIProviderType;

export const AI_EXECUTION_PROVIDERS: readonly AIExecutionProvider[] = [
  'deepseek',
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
];

/**
 * One inline image part. Base64 and a media type, never a URL.
 *
 * A URL would be the easier wire format and is the wrong one here: the images
 * this server sends are crops of PRIVATE Knowledge PDFs, which have no public
 * address by design. Handing a provider a link would either require publishing
 * the object or a signed URL that outlives the request. The bytes travel in the
 * request body and exist nowhere else.
 */
export interface AIGenerateImageInput {
  readonly mediaType: string;
  readonly base64: string;
}

export interface AIGenerateTextInput {
  /** Opaque provider model id. Never inspected or guessed at. */
  readonly model: string;
  /** Plaintext credential for THIS call only; never logged or persisted. */
  readonly apiKey: string;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
  readonly temperature?: number;
  /**
   * Inline images for THIS call only. Never a URL: the source is private.
   *
   * An adapter that cannot carry images MUST throw aiProviderInvalidConfiguration
   * when this is non-empty. Silently ignoring it would answer from text alone
   * while the user believes the model looked at their image -- a wrong answer
   * that reads like a right one. The refusal is the honest outcome.
   */
  readonly images?: readonly AIGenerateImageInput[];
  /**
   * The caller's cancellation signal, forwarded to fetch verbatim. Adapters
   * deliberately start no timers of their own: the calling route already owns
   * its timeout, and a second independent deadline inside every adapter would
   * be invisible to it.
   */
  readonly signal?: AbortSignal;
}

export interface AIProviderAdapter {
  readonly provider: AIExecutionProvider;
  /** Resolves to the model's plain text, trimmed. Throws AIProviderError otherwise. */
  generateText(input: AIGenerateTextInput): Promise<string>;
}
