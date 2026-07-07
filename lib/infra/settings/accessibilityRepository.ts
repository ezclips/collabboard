import type {
  AccessibilitySettings,
  AccessibilitySettingsRepository,
} from '../../domain/settings/accessibility';
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

interface AccessibilitySettingsRow {
  readonly settings?: unknown;
}

interface AccessibilitySelectQuery {
  eq(column: 'user_id', value: UserId): {
    single(): Promise<{ data: AccessibilitySettingsRow | null; error: SupabaseErrorLike | null }>;
  };
}

interface AccessibilityUpsertQuery {
  upsert(payload: {
    user_id: UserId;
    settings: AccessibilitySettings;
    updated_at: string;
  }): Promise<{ error: SupabaseErrorLike | null }>;
}

interface AccessibilitySupabaseClient {
  from(table: 'accessibility_settings'): {
    select(columns: '*'): AccessibilitySelectQuery;
    upsert: AccessibilityUpsertQuery['upsert'];
  };
}

export class SupabaseAccessibilitySettingsRepository implements AccessibilitySettingsRepository {
  constructor(private readonly client: AccessibilitySupabaseClient) {}

  async load(userId: UserId): Promise<Result<AccessibilitySettings | null, DomainError>> {
    const { data, error } = await this.client
      .from('accessibility_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return ok(null);
      return err(
        domainError('unavailable', 'Could not load accessibility settings', { cause: error }),
      );
    }

    return ok((data?.settings as AccessibilitySettings | undefined) ?? null);
  }

  async save(userId: UserId, settings: AccessibilitySettings): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('accessibility_settings').upsert({
      user_id: userId,
      settings,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return err(
        domainError('unavailable', 'Could not save accessibility settings', { cause: error }),
      );
    }

    return ok(undefined);
  }
}

export function createAccessibilitySettingsRepository(): AccessibilitySettingsRepository {
  return new SupabaseAccessibilitySettingsRepository(
    createBrowserSupabaseClient() as unknown as AccessibilitySupabaseClient,
  );
}
