import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { ProfileRow, ProfilesRepository } from '../../domain/profile/profile';
import { makeAuthedClient } from '../supabase/legacyToken';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface ProfilesSelectQuery {
  eq(column: 'id', value: UserId): {
    maybeSingle(): Promise<{ data: ProfileRow | null; error: SupabaseErrorLike | null }>;
  };
}

interface ProfilesUpdateQuery {
  eq(column: 'id', value: UserId): {
    select(columns: 'id'): {
      maybeSingle(): Promise<{ data: { id: string } | null; error: SupabaseErrorLike | null }>;
    };
  };
}

interface ProfilesSupabaseClient {
  from(table: 'profiles'): {
    select(columns: '*'): ProfilesSelectQuery;
    update(payload: Record<string, unknown>): ProfilesUpdateQuery;
    insert(payload: Record<string, unknown>): Promise<{ error: SupabaseErrorLike | null }>;
  };
}

export class SupabaseProfilesRepository implements ProfilesRepository {
  constructor(private readonly client: ProfilesSupabaseClient) {}

  async findById(userId: UserId): Promise<Result<ProfileRow | null, DomainError>> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load profile', { cause: error }));
    }

    return ok(data ?? null);
  }

  async updatePatch(
    userId: UserId,
    email: string,
    patch: Record<string, unknown>,
    now: string,
  ): Promise<Result<boolean, DomainError>> {
    const { data, error } = await this.client
      .from('profiles')
      .update({ email, ...patch, updated_at: now })
      .eq('id', userId)
      .select('id')
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not save profile', { cause: error }));
    }

    return ok(Boolean(data));
  }

  async insertPatch(
    userId: UserId,
    email: string,
    patch: Record<string, unknown>,
    now: string,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('profiles')
      .insert({ id: userId, email, created_at: now, ...patch, updated_at: now });

    if (error) {
      return err(domainError('unavailable', 'Could not save profile', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createLegacyProfilesRepository(token: string): ProfilesRepository {
  return new SupabaseProfilesRepository(
    makeAuthedClient(token) as unknown as ProfilesSupabaseClient,
  );
}
