import { getSupabaseAdmin } from '../../supabase/admin';
import {
  aiCredentialKeyHint,
  type AIProviderConnection,
  type AIProviderConnectionInput,
  type AIProviderType,
} from '../../domain/settings/aiProviderConnection';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { decryptAICredential, encryptAICredential } from '../../server/ai/credentialCipher';

/**
 * Server-only repository for BYOK provider connections and their encrypted
 * credentials.
 *
 * SERVER ONLY. Never import this from a 'use client' module.
 *
 * This repository is reached with the SERVICE ROLE, which is authorized here
 * for exactly one reason: ai_provider_credentials is intentionally unreachable
 * from PostgREST (RLS on, no policies, privileges revoked), so no browser can
 * read ciphertext even for its own connection. The price of that bypass is
 * that RLS protects nothing on this path -- so EVERY method that touches a
 * connection or its secret takes BOTH a userId and a connectionId and proves
 * ownership in the query itself. There is deliberately no
 * `loadCredential(connectionId)` overload that trusts a caller-supplied id.
 *
 * Creation is intentionally left as two primitives rather than one composite
 * call: supabase-js cannot span two tables in a transaction, and compensating
 * for a partial write in application code would be worse than letting the
 * orchestration layer (and, if it needs one, an RPC) own that decision.
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface ConnectionRow {
  readonly id: string;
  readonly provider_type: string;
  readonly display_name: string;
  readonly key_hint: string;
  readonly default_model: string | null;
  readonly verified_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CredentialRow {
  readonly api_key_encrypted: string;
}

interface SelectQuery<T> extends PromiseLike<{ data: readonly T[] | null; error: SupabaseErrorLike | null }> {
  eq(column: string, value: unknown): SelectQuery<T>;
  order(column: string, options: { ascending: boolean }): SelectQuery<T>;
  maybeSingle(): Promise<{ data: T | null; error: SupabaseErrorLike | null }>;
}

interface MutationQuery extends PromiseLike<{ error: SupabaseErrorLike | null }> {
  eq(column: string, value: unknown): MutationQuery;
  select(columns: string): SelectQuery<ConnectionRow>;
}

interface InsertQuery<T> {
  select(columns: string): { single(): Promise<{ data: T | null; error: SupabaseErrorLike | null }> };
}

interface ConnectionsTable {
  select(columns: string): SelectQuery<ConnectionRow>;
  insert(row: Record<string, unknown>): InsertQuery<ConnectionRow>;
  update(values: Record<string, unknown>): MutationQuery;
  delete(): MutationQuery;
}

interface CredentialsTable {
  select(columns: string): SelectQuery<CredentialRow>;
  upsert(
    row: Record<string, unknown>,
    options: { onConflict: string },
  ): Promise<{ error: SupabaseErrorLike | null }>;
}

export interface AIProviderSupabaseClient {
  from(table: 'ai_provider_connections'): ConnectionsTable;
  from(table: 'ai_provider_credentials'): CredentialsTable;
}

/**
 * The ONLY column list any read of ai_provider_connections uses. Secret
 * material is not in this table at all, and this constant keeps the projection
 * explicit rather than relying on `select('*')` never drifting.
 */
export const SAFE_CONNECTION_COLUMNS =
  'id, provider_type, display_name, key_hint, default_model, verified_at, created_at, updated_at';

const UNIQUE_VIOLATION = '23505';

function toConnection(row: ConnectionRow): AIProviderConnection {
  return {
    id: row.id,
    providerType: row.provider_type as AIProviderType,
    displayName: row.display_name,
    keyHint: row.key_hint,
    defaultModel: row.default_model,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAIProviderCredentialRepository {
  constructor(private readonly client: AIProviderSupabaseClient) {}

  /** Safe metadata for one user. Never reads or decrypts credential material. */
  async listConnections(userId: UserId): Promise<Result<readonly AIProviderConnection[], DomainError>> {
    const { data, error } = await this.client
      .from('ai_provider_connections')
      .select(SAFE_CONNECTION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      return err(domainError('unavailable', 'Could not load AI provider connections', { cause: error }));
    }

    return ok((data ?? []).map(toConnection));
  }

  /** Safe metadata for one owned connection, or null when it is not the caller's. */
  async getConnection(
    userId: UserId,
    connectionId: string,
  ): Promise<Result<AIProviderConnection | null, DomainError>> {
    const { data, error } = await this.client
      .from('ai_provider_connections')
      .select(SAFE_CONNECTION_COLUMNS)
      .eq('id', connectionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load AI provider connection', { cause: error }));
    }

    return ok(data ? toConnection(data) : null);
  }

  /**
   * Creates the metadata row only. The credential is written separately by
   * `putCredential`; see the class comment on why this is not one call.
   */
  async insertConnectionMetadata(
    userId: UserId,
    input: AIProviderConnectionInput,
    keyHint: string,
  ): Promise<Result<AIProviderConnection, DomainError>> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('ai_provider_connections')
      .insert({
        user_id: userId,
        provider_type: input.providerType,
        display_name: input.displayName,
        key_hint: keyHint,
        default_model: input.defaultModel,
        created_at: now,
        updated_at: now,
      })
      .select(SAFE_CONNECTION_COLUMNS)
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return err(domainError('conflict', 'A provider connection with that name already exists'));
      }
      return err(domainError('unavailable', 'Could not create AI provider connection', { cause: error }));
    }
    if (!data) {
      return err(domainError('unavailable', 'Could not create AI provider connection'));
    }

    return ok(toConnection(data));
  }

  /**
   * Encrypts and stores (or replaces) the credential for an OWNED connection.
   * Encryption happens before any write, so a misconfigured master key fails
   * closed without leaving a connection half-updated.
   */
  async putCredential(
    userId: UserId,
    connectionId: string,
    apiKey: string,
  ): Promise<Result<void, DomainError>> {
    const owned = await this.requireOwnedConnection(userId, connectionId);
    if (!owned.ok) return owned;

    let encrypted: string;
    try {
      encrypted = encryptAICredential(apiKey);
    } catch (cause) {
      return err(domainError('unavailable', 'Could not encrypt the provider credential', { cause }));
    }

    const now = new Date().toISOString();
    const { error } = await this.client.from('ai_provider_credentials').upsert(
      {
        connection_id: connectionId,
        api_key_encrypted: encrypted,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'connection_id' },
    );

    if (error) {
      return err(domainError('unavailable', 'Could not store the provider credential', { cause: error }));
    }

    return ok(undefined);
  }

  /**
   * Decrypts the credential for an OWNED connection. Ownership is proven
   * against ai_provider_connections BEFORE the secret table is touched, which
   * is the whole reason this method cannot be called with an id alone.
   */
  async loadCredential(userId: UserId, connectionId: string): Promise<Result<string, DomainError>> {
    const owned = await this.requireOwnedConnection(userId, connectionId);
    if (!owned.ok) return owned;

    const { data, error } = await this.client
      .from('ai_provider_credentials')
      .select('api_key_encrypted')
      .eq('connection_id', connectionId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load the provider credential', { cause: error }));
    }
    if (!data) {
      return err(domainError('not_found', 'No credential is stored for that provider connection'));
    }

    try {
      return ok(decryptAICredential(data.api_key_encrypted));
    } catch (cause) {
      return err(domainError('unavailable', 'Could not decrypt the provider credential', { cause }));
    }
  }

  /**
   * Updates the two client-mutable metadata fields, ownership-scoped. Nothing
   * else is writable through this path: provider_type, key_hint, user_id and
   * verified_at are absent by construction, so a client cannot reach them
   * however the request body is shaped.
   *
   * Changing the default model clears verified_at: what Test Connection
   * verified was a provider/model pair, and the model half just changed.
   */
  async updateConnectionMetadata(
    userId: UserId,
    connectionId: string,
    changes: { readonly displayName?: string; readonly defaultModel?: string | null },
  ): Promise<Result<AIProviderConnection | null, DomainError>> {
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (changes.displayName !== undefined) values.display_name = changes.displayName;
    if (changes.defaultModel !== undefined) {
      values.default_model = changes.defaultModel;
      values.verified_at = null;
    }

    const { data, error } = await this.client
      .from('ai_provider_connections')
      .update(values)
      .eq('id', connectionId)
      .eq('user_id', userId)
      .select(SAFE_CONNECTION_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return err(domainError('conflict', 'A provider connection with that name already exists'));
      }
      return err(domainError('unavailable', 'Could not update the provider connection', { cause: error }));
    }

    return ok(data ? toConnection(data) : null);
  }

  /**
   * Records a successful Test Connection. Server-owned: verified_at has no
   * client-writable path anywhere in this repository.
   */
  async markConnectionVerified(
    userId: UserId,
    connectionId: string,
  ): Promise<Result<AIProviderConnection | null, DomainError>> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('ai_provider_connections')
      .update({ verified_at: now, updated_at: now })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .select(SAFE_CONNECTION_COLUMNS)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not update the provider connection', { cause: error }));
    }

    return ok(data ? toConnection(data) : null);
  }

  /** Refreshes the masked hint after a key replacement, ownership-scoped. */
  async updateConnectionKeyHint(
    userId: UserId,
    connectionId: string,
    apiKey: string,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('ai_provider_connections')
      .update({ key_hint: aiCredentialKeyHint(apiKey), updated_at: new Date().toISOString() })
      .eq('id', connectionId)
      .eq('user_id', userId);

    if (error) {
      return err(domainError('unavailable', 'Could not update the provider connection', { cause: error }));
    }

    return ok(undefined);
  }

  /**
   * Deletes an owned connection. The credential row cascades away with it, so
   * no ciphertext is ever orphaned, and any role preference pointing at it is
   * reset to NULL by the schema -- which is what makes that role fall back to
   * CollabBoard Default.
   */
  async deleteConnection(userId: UserId, connectionId: string): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('ai_provider_connections')
      .delete()
      .eq('id', connectionId)
      .eq('user_id', userId);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the provider connection', { cause: error }));
    }

    return ok(undefined);
  }

  private async requireOwnedConnection(
    userId: UserId,
    connectionId: string,
  ): Promise<Result<void, DomainError>> {
    const { data, error } = await this.client
      .from('ai_provider_connections')
      .select('id')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not verify provider connection ownership', { cause: error }));
    }
    if (!data) {
      // Same answer for "does not exist" and "belongs to someone else": a
      // caller must not be able to probe for other users' connection ids.
      return err(domainError('not_found', 'Provider connection not found'));
    }

    return ok(undefined);
  }
}

/**
 * Server-only construction. Reuses the existing `getSupabaseAdmin` factory,
 * which already reads the service role lazily and throws when it is absent --
 * the fail-closed behaviour this table requires. Deliberately NOT
 * `createServerSupabaseClient`, which falls back to the anon key: silently
 * degrading to a client that cannot see this table would surface as a
 * confusing empty result rather than a configuration error.
 */
export function createAIProviderCredentialRepository(): SupabaseAIProviderCredentialRepository {
  return new SupabaseAIProviderCredentialRepository(
    getSupabaseAdmin() as unknown as AIProviderSupabaseClient,
  );
}
