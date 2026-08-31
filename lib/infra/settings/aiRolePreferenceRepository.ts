import { getSupabaseAdmin } from '../../supabase/admin';
import type { AIRolePreference } from '../../domain/settings/aiProviderConnection';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';

/**
 * Role -> provider/model preferences.
 *
 * A missing row, or a row whose connectionId is null, means CollabBoard
 * Default: no fake default-provider row is ever written, so "I have not chosen
 * anything" and "I chose the default" are the same state.
 *
 * Cross-user safety is enforced in THREE independent places, because this
 * repository (like the credential one) may run with the service role and so
 * cannot lean on RLS: the database trigger fires for every writer, the RLS
 * WITH CHECK stops direct PostgREST writes, and `setPreference` below refuses
 * a connection the caller does not own before issuing the write at all.
 */

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface PreferenceRow {
  readonly role: string;
  readonly connection_id: string | null;
  readonly model_id: string | null;
}

interface OwnedConnectionRow {
  readonly id: string;
}

interface SelectQuery<T> extends PromiseLike<{ data: readonly T[] | null; error: SupabaseErrorLike | null }> {
  eq(column: string, value: unknown): SelectQuery<T>;
  maybeSingle(): Promise<{ data: T | null; error: SupabaseErrorLike | null }>;
}

interface PreferencesTable {
  select(columns: string): SelectQuery<PreferenceRow>;
  upsert(
    row: Record<string, unknown>,
    options: { onConflict: string },
  ): Promise<{ error: SupabaseErrorLike | null }>;
}

interface ConnectionsTable {
  select(columns: string): SelectQuery<OwnedConnectionRow>;
}

export interface AIRolePreferenceSupabaseClient {
  from(table: 'ai_role_preferences'): PreferencesTable;
  from(table: 'ai_provider_connections'): ConnectionsTable;
}

const PREFERENCE_COLUMNS = 'role, connection_id, model_id';

function toPreference(row: PreferenceRow): AIRolePreference {
  return {
    role: row.role,
    connectionId: row.connection_id,
    modelId: row.model_id,
  };
}

export class SupabaseAIRolePreferenceRepository {
  constructor(private readonly client: AIRolePreferenceSupabaseClient) {}

  async listPreferences(userId: UserId): Promise<Result<readonly AIRolePreference[], DomainError>> {
    const { data, error } = await this.client
      .from('ai_role_preferences')
      .select(PREFERENCE_COLUMNS)
      .eq('user_id', userId);

    if (error) {
      return err(domainError('unavailable', 'Could not load AI role preferences', { cause: error }));
    }

    return ok((data ?? []).map(toPreference));
  }

  /** Null means the role is on CollabBoard Default -- not an error. */
  async getPreference(userId: UserId, role: string): Promise<Result<AIRolePreference | null, DomainError>> {
    const { data, error } = await this.client
      .from('ai_role_preferences')
      .select(PREFERENCE_COLUMNS)
      .eq('user_id', userId)
      .eq('role', role)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load the AI role preference', { cause: error }));
    }

    return ok(data ? toPreference(data) : null);
  }

  /**
   * Assigns a role to an owned connection, or to CollabBoard Default when
   * `connectionId` is null. A connection the caller does not own is refused
   * before any write.
   */
  async setPreference(
    userId: UserId,
    role: string,
    connectionId: string | null,
    modelId: string | null,
  ): Promise<Result<void, DomainError>> {
    if (connectionId !== null) {
      const owned = await this.requireOwnedConnection(userId, connectionId);
      if (!owned.ok) return owned;
    }

    const now = new Date().toISOString();
    const { error } = await this.client.from('ai_role_preferences').upsert(
      {
        user_id: userId,
        role,
        connection_id: connectionId,
        model_id: modelId,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,role' },
    );

    if (error) {
      return err(domainError('unavailable', 'Could not save the AI role preference', { cause: error }));
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
      return err(domainError('not_found', 'Provider connection not found'));
    }

    return ok(undefined);
  }
}

/** Server-only construction; see the note on the credential repository's factory. */
export function createAIRolePreferenceRepository(): SupabaseAIRolePreferenceRepository {
  return new SupabaseAIRolePreferenceRepository(
    getSupabaseAdmin() as unknown as AIRolePreferenceSupabaseClient,
  );
}
