import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  UserAchievements,
  UserAchievementsRepository,
} from '../../domain/achievements/achievements';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface UserAchievementsRow {
  readonly points?: number | null;
}

interface UserAchievementsSelectQuery {
  eq(column: 'user_id', value: UserId): {
    single(): Promise<{ data: UserAchievementsRow | null; error: SupabaseErrorLike | null }>;
  };
}

interface UserAchievementsSupabaseClient {
  from(table: 'user_achievements'): {
    select(columns: '*'): UserAchievementsSelectQuery;
  };
}

export class SupabaseUserAchievementsRepository implements UserAchievementsRepository {
  constructor(private readonly client: UserAchievementsSupabaseClient) {}

  async load(userId: UserId): Promise<Result<UserAchievements | null, DomainError>> {
    const { data, error } = await this.client
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return ok(null);
      return err(domainError('unavailable', 'Could not load user achievements', { cause: error }));
    }

    return ok({ points: data?.points ?? 0 });
  }
}

export function createUserAchievementsRepository(): UserAchievementsRepository {
  return new SupabaseUserAchievementsRepository(
    createBrowserSupabaseClient() as unknown as UserAchievementsSupabaseClient,
  );
}
