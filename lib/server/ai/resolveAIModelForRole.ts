// Role -> provider/model/credential resolution.
//
// SERVER ONLY. The result carries a plaintext API key and must never be
// returned to a browser, logged, or embedded in a response body.
//
// Two outcomes only:
//
//   CollabBoard Default -- no role preference row, or a row whose connection
//   is explicitly null. Backed by the server's own DeepSeek key. No credential
//   table is touched on this path at all.
//
//   BYOK -- the role names a connection the user owns. Ownership is proven by
//   the Phase 1A repositories, which take a userId on every call; this module
//   never looks a secret up by connection id alone.
//
// Errors are THROWN as AIProviderError rather than returned as a Result: the
// Results-not-throws rule is a lib/domain convention, and a caller of this
// module is about to call an adapter, which throws the same error type. One
// try/catch then covers resolve-and-generate. The repositories keep returning
// Results; translating them here is this module's job.

import type { AIRole } from '../../ai/aiRoles';
import { isAIProviderType } from '../../domain/settings/aiProviderConnection';
import type { AIProviderConnection, AIRolePreference } from '../../domain/settings/aiProviderConnection';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { AIProviderError, aiProviderInvalidConfiguration } from './providers/errors';
import { DEEPSEEK_DEFAULT_MODEL } from './providers/deepSeek';
import type { AIExecutionProvider } from './providers/types';

export type AIModelResolutionSource = 'collabboard-default' | 'byok';

/** Server-only descriptor. Deliberately carries no keyHint/ciphertext/display name. */
export interface ResolvedAIModel {
  readonly source: AIModelResolutionSource;
  readonly provider: AIExecutionProvider;
  readonly model: string;
  readonly apiKey: string;
  /** Null on the CollabBoard-default path, which has no connection row. */
  readonly connectionId: string | null;
}

/**
 * Only the two reads this module needs, so a caller cannot pass something that
 * happens to expose a write. Both signatures keep `userId` first -- the
 * ownership boundary Phase 1A established.
 */
export interface AIRolePreferenceReader {
  getPreference(userId: UserId, role: string): Promise<Result<AIRolePreference | null, DomainError>>;
}

export interface AIProviderCredentialReader {
  getConnection(userId: UserId, connectionId: string): Promise<Result<AIProviderConnection | null, DomainError>>;
  loadCredential(userId: UserId, connectionId: string): Promise<Result<string, DomainError>>;
}

export interface AIModelResolverDeps {
  readonly preferences: AIRolePreferenceReader;
  readonly credentials: AIProviderCredentialReader;
}


function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The CollabBoard default. The environment key is read lazily, per call, so an
 * unconfigured deployment fails here rather than at import time.
 */
function resolveCollabBoardDefault(): ResolvedAIModel {
  const apiKey = trimmedOrNull(process.env.DEEPSEEK_API_KEY);
  if (!apiKey) throw aiProviderInvalidConfiguration('deepseek');

  return {
    source: 'collabboard-default',
    provider: 'deepseek',
    model: DEEPSEEK_DEFAULT_MODEL,
    apiKey,
    connectionId: null,
  };
}

export async function resolveAIModelForRole(
  userId: UserId,
  role: AIRole,
  deps: AIModelResolverDeps,
): Promise<ResolvedAIModel> {
  const preference = await deps.preferences.getPreference(userId, role);
  if (!preference.ok) throw new AIProviderError('provider_unavailable');

  const connectionId = preference.value?.connectionId ?? null;

  // No row, or a row explicitly on the default: these are the SAME state, and
  // the only state that reaches the environment-backed provider.
  if (connectionId === null) return resolveCollabBoardDefault();

  // From here the user has explicitly chosen BYOK. Every failure below is a
  // broken configuration the user must fix -- never a silent downgrade to the
  // CollabBoard key, which would quietly bill us for their misconfiguration
  // and hide the breakage from them.
  const connection = await deps.credentials.getConnection(userId, connectionId);
  if (!connection.ok) throw new AIProviderError('provider_unavailable');
  // Null covers both "deleted" and "belongs to another user" -- the repository
  // deliberately does not distinguish them.
  if (connection.value === null) throw aiProviderInvalidConfiguration();

  const provider = connection.value.providerType;
  if (!isAIProviderType(provider)) throw aiProviderInvalidConfiguration();

  // The role's own model wins; the connection's default is the fallback.
  const model = trimmedOrNull(preference.value?.modelId) ?? trimmedOrNull(connection.value.defaultModel);
  if (model === null) throw aiProviderInvalidConfiguration(provider);

  const credential = await deps.credentials.loadCredential(userId, connectionId);
  // A missing credential row and a decrypt failure are both configuration
  // defects the user resolves the same way -- by re-entering the key.
  if (!credential.ok) throw aiProviderInvalidConfiguration(provider);
  const apiKey = trimmedOrNull(credential.value);
  if (apiKey === null) throw aiProviderInvalidConfiguration(provider);

  return { source: 'byok', provider, model, apiKey, connectionId };
}
