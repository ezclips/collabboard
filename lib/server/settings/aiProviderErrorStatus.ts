// Normalized provider failure -> HTTP status for Settings routes.
//
// SERVER ONLY.
//
// One mapping, in one place, so every Settings route answers a given failure
// the same way. Only the category travels to the client: AIProviderError
// already carries no response body, no key and no cause, and nothing here
// widens that.

import type { AIProviderErrorCategory } from '../ai/providers/errors';

const STATUS_BY_CATEGORY: Record<AIProviderErrorCategory, number> = {
  // The user's stored credential was rejected. 400, not 401: the CALLER is
  // authenticated -- a 401 here would read as "your session expired" and, in a
  // browser client, may trigger a sign-out.
  authentication_failed: 400,
  rate_limited: 429,
  model_unavailable: 400,
  provider_unavailable: 502,
  invalid_configuration: 400,
  request_failed: 502,
};

export function aiProviderErrorStatus(category: AIProviderErrorCategory): number {
  return STATUS_BY_CATEGORY[category] ?? 502;
}
