import type {
  NotificationSettingsData,
  NotificationSettingsRepository,
} from '../../domain/settings/notifications';
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

interface NotificationSettingsRow {
  readonly settings?: unknown;
}

interface NotificationSelectQuery {
  eq(column: 'user_id', value: UserId): {
    maybeSingle(): Promise<{ data: NotificationSettingsRow | null; error: SupabaseErrorLike | null }>;
  };
}

interface NotificationUpsertQuery {
  upsert(payload: {
    user_id: UserId;
    settings: NotificationSettingsData;
    updated_at: string;
  }): Promise<{ error: SupabaseErrorLike | null }>;
}

interface NotificationSettingsSupabaseClient {
  from(table: 'notification_settings'): {
    select(columns: 'settings'): NotificationSelectQuery;
    upsert: NotificationUpsertQuery['upsert'];
  };
}

export class SupabaseNotificationSettingsRepository implements NotificationSettingsRepository {
  constructor(private readonly client: NotificationSettingsSupabaseClient) {}

  async load(userId: UserId): Promise<Result<NotificationSettingsData | null, DomainError>> {
    const { data, error } = await this.client
      .from('notification_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load notification settings', { cause: error }));
    }

    return ok((data?.settings as NotificationSettingsData | undefined) ?? null);
  }

  async save(userId: UserId, settings: NotificationSettingsData): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('notification_settings').upsert({
      user_id: userId,
      settings,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return err(domainError('unavailable', 'Could not save notification settings', { cause: error }));
    }

    return ok(undefined);
  }
}

export function createNotificationSettingsRepository(): NotificationSettingsRepository {
  return new SupabaseNotificationSettingsRepository(
    createBrowserSupabaseClient() as unknown as NotificationSettingsSupabaseClient,
  );
}
