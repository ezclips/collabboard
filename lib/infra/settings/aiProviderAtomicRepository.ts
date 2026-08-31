import { getSupabaseAdmin } from '../../supabase/admin';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { AIProviderType } from '../../domain/settings/aiProviderConnection';

/**
 * The two cross-table writes, executed as database functions so they are
 * genuinely atomic.
 *
 * SERVER ONLY. Reached with the service role, which is what the functions'
 * EXECUTE grant allows -- they are revoked from PUBLIC/anon/authenticated, so
 * there is no browser-callable RPC surface.
 *
 * Both entry points take a userId and both pass it into the function, which
 * uses it as the ownership predicate. Neither accepts a plaintext key: the
 * caller encrypts first, and `apiKeyEncrypted` is ciphertext by contract.
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

export interface AIProviderRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: SupabaseErrorLike | null }>;
}

export const CREATE_CONNECTION_FN = 'create_ai_provider_connection_atomic';
export const REPLACE_CREDENTIAL_FN = 'replace_ai_provider_credential_atomic';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

export class SupabaseAIProviderAtomicRepository {
  constructor(private readonly client: AIProviderRpcClient) {}

  /**
   * Creates the connection row and its credential row in one transaction. The
   * returned id is the new connection's.
   */
  async createConnectionWithCredential(
    userId: UserId,
    input: {
      readonly providerType: AIProviderType;
      readonly displayName: string;
      readonly keyHint: string;
      readonly defaultModel: string | null;
      readonly apiKeyEncrypted: string;
    },
  ): Promise<Result<string, DomainError>> {
    const { data, error } = await this.client.rpc(CREATE_CONNECTION_FN, {
      p_user_id: userId,
      p_provider_type: input.providerType,
      p_display_name: input.displayName,
      p_key_hint: input.keyHint,
      p_default_model: input.defaultModel,
      p_api_key_encrypted: input.apiKeyEncrypted,
    });

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return err(domainError('conflict', 'A provider connection with that name already exists'));
      }
      if (error.code === CHECK_VIOLATION) {
        return err(domainError('validation', 'The provider connection was rejected by the database'));
      }
      return err(domainError('unavailable', 'Could not create the provider connection', { cause: error }));
    }
    if (typeof data !== 'string' || data.length === 0) {
      return err(domainError('unavailable', 'Could not create the provider connection'));
    }

    return ok(data);
  }

  /**
   * Replaces the stored credential and its masked hint together, clearing
   * verified_at. Returns `not_found` for a connection the user does not own --
   * the function returns false for both "missing" and "someone else's".
   */
  async replaceCredential(
    userId: UserId,
    connectionId: string,
    keyHint: string,
    apiKeyEncrypted: string,
  ): Promise<Result<void, DomainError>> {
    const { data, error } = await this.client.rpc(REPLACE_CREDENTIAL_FN, {
      p_user_id: userId,
      p_connection_id: connectionId,
      p_key_hint: keyHint,
      p_api_key_encrypted: apiKeyEncrypted,
    });

    if (error) {
      return err(domainError('unavailable', 'Could not replace the provider credential', { cause: error }));
    }
    if (data !== true) {
      return err(domainError('not_found', 'Provider connection not found'));
    }

    return ok(undefined);
  }
}

/** Server-only construction; see the note on the credential repository's factory. */
export function createAIProviderAtomicRepository(): SupabaseAIProviderAtomicRepository {
  return new SupabaseAIProviderAtomicRepository(
    getSupabaseAdmin() as unknown as AIProviderRpcClient,
  );
}
