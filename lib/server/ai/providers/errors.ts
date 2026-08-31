// Normalized provider failures.
//
// SERVER ONLY.
//
// The whole point of this module is that NOTHING provider-supplied reaches a
// caller. A provider error body can echo the request back (Authorization
// header included), name an account, or carry an upstream trace; the API key
// is in scope at every call site. So an AIProviderError carries only a fixed
// message chosen from the table below, plus a category, the provider, and the
// HTTP status -- never a response body, never a key, never a wrapped `cause`
// that could hold either.

import type { AIExecutionProvider } from './types';

export type AIProviderErrorCategory =
  | 'authentication_failed'
  | 'rate_limited'
  | 'model_unavailable'
  | 'provider_unavailable'
  | 'invalid_configuration'
  | 'request_failed';

/** Fixed, developer-facing copy. Never interpolated with provider or key material. */
const CATEGORY_MESSAGES: Record<AIProviderErrorCategory, string> = {
  authentication_failed: 'The provider rejected the credential.',
  rate_limited: 'The provider rate limited this request.',
  model_unavailable: 'The configured model is unavailable for this credential.',
  provider_unavailable: 'The provider is unavailable.',
  invalid_configuration: 'The AI configuration is incomplete or invalid.',
  request_failed: 'The provider request failed.',
};

export class AIProviderError extends Error {
  readonly category: AIProviderErrorCategory;
  readonly provider: AIExecutionProvider | null;
  readonly status: number | null;

  constructor(
    category: AIProviderErrorCategory,
    options?: { provider?: AIExecutionProvider; status?: number },
  ) {
    super(CATEGORY_MESSAGES[category]);
    this.name = 'AIProviderError';
    this.category = category;
    this.provider = options?.provider ?? null;
    this.status = options?.status ?? null;
  }
}

/**
 * HTTP status -> category. 401/403 are the credential; 429 is throttling; 404
 * is a model the credential cannot reach; 5xx is the provider itself. Anything
 * else is a request we cannot classify further.
 */
export function aiProviderCategoryForStatus(status: number): AIProviderErrorCategory {
  if (status === 401 || status === 403) return 'authentication_failed';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'model_unavailable';
  if (status >= 500) return 'provider_unavailable';
  return 'request_failed';
}

/** The ONLY way an adapter turns a non-OK provider response into an error. */
export function aiProviderHttpError(
  provider: AIExecutionProvider,
  status: number,
): AIProviderError {
  return new AIProviderError(aiProviderCategoryForStatus(status), { provider, status });
}

export function aiProviderRequestFailed(provider: AIExecutionProvider): AIProviderError {
  return new AIProviderError('request_failed', { provider });
}

export function aiProviderInvalidConfiguration(
  provider?: AIExecutionProvider,
): AIProviderError {
  return new AIProviderError('invalid_configuration', provider ? { provider } : undefined);
}

/**
 * A thrown fetch is either the caller cancelling -- which must stay an
 * AbortError so the caller can tell cancellation from failure -- or the
 * network/provider being unreachable.
 */
export function aiProviderTransportError(
  provider: AIExecutionProvider,
  cause: unknown,
): never {
  if (cause instanceof Error && cause.name === 'AbortError') throw cause;
  throw new AIProviderError('provider_unavailable', { provider });
}

/**
 * Every adapter's last step. An empty or non-string completion is a failed
 * request, not an empty answer a caller should render.
 */
export function requireProviderText(
  provider: AIExecutionProvider,
  text: unknown,
): string {
  if (typeof text !== 'string') throw aiProviderRequestFailed(provider);
  const trimmed = text.trim();
  if (trimmed.length === 0) throw aiProviderRequestFailed(provider);
  return trimmed;
}
