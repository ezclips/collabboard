import type {
  DashboardSettingsRepository,
  DashboardSettingsData,
  DashboardSettingsRow,
} from '../../domain/settings/dashboard';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { UserId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface DashboardSettingsSupabaseRow {
  readonly default_workspace?: string | null;
  readonly libraries?: unknown | null;
}

interface DashboardSettingsSelectQuery {
  eq(column: 'user_id', value: UserId): {
    single(): Promise<{ data: DashboardSettingsSupabaseRow | null; error: SupabaseErrorLike | null }>;
  };
}

interface DashboardSettingsUpsertQuery {
  upsert(payload: {
    user_id: UserId;
    libraries: DashboardSettingsData['libraries'];
    default_workspace: string;
    updated_at: string;
  }): Promise<{ error: SupabaseErrorLike | null }>;
}

interface DashboardSettingsSupabaseClient {
  from(table: 'dashboard_settings'): {
    select(columns: '*'): DashboardSettingsSelectQuery;
    upsert: DashboardSettingsUpsertQuery['upsert'];
  };
}

export class SupabaseDashboardSettingsRepository implements DashboardSettingsRepository {
  constructor(private readonly client: DashboardSettingsSupabaseClient) {}

  async load(userId: UserId): Promise<Result<DashboardSettingsRow | null, DomainError>> {
    const { data, error } = await this.client
      .from('dashboard_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return ok(null);
      return err(domainError('unavailable', 'Could not load dashboard settings', { cause: error }));
    }

    return ok({
      defaultWorkspace: data?.default_workspace ?? null,
      libraries: data?.libraries ?? null,
    });
  }

  async save(userId: UserId, settings: DashboardSettingsData): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('dashboard_settings').upsert({
      user_id: userId,
      libraries: settings.libraries,
      default_workspace: settings.defaultWorkspace,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return err(domainError('unavailable', 'Could not save dashboard settings', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createDashboardSettingsRepository(): DashboardSettingsRepository {
  return new SupabaseDashboardSettingsRepository(
    createBrowserSupabaseClient() as unknown as DashboardSettingsSupabaseClient,
  );
}
