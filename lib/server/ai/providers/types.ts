// Provider execution contract for AI generation.
//
// SERVER ONLY. Never import this (or anything under providers/) from a
// 'use client' module: every adapter handles a plaintext API key.
//
// The contract is deliberately narrow -- one text-in/text-out call. No
// streaming, no conversation state, no usage accounting, and no
// provider-specific response object ever travels upward: an adapter returns a
// plain string or throws a normalized AIProviderError.

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
