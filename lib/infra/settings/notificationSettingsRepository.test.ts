import { describe, expect, it } from 'vitest';
import { SupabaseNotificationSettingsRepository } from './notificationSettingsRepository';
import type { NotificationSettingsData } from '../../domain/settings/notifications';
import { asUserId } from '../../domain/core/ids';

const settings: NotificationSettingsData = {
  general: [
    {
      title: 'Updates',
      settings: [
        {
          id: 'product_updates',
          label: 'Product updates',
          description: 'Updates about what has changed in CollabBoard.',
          push: false,
          email: false,
        },
      ],
    },
  ],
  scenes: [],
  accounts: [],
};

function createFakeClient(response: {
  loadData?: { settings: NotificationSettingsData } | null;
  loadError?: { code?: string; message?: string } | null;
  saveError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'notification_settings') => {
      expect(table).toBe('notification_settings');
      return {
        select: (columns: 'settings') => {
          expect(columns).toBe('settings');
          return {
            eq: (column: 'user_id', value: string) => {
              expect(column).toBe('user_id');
              expect(value).toBe('user-1');
              return {
                maybeSingle: async () => ({
                  data: response.loadData ?? null,
                  error: response.loadError ?? null,
                }),
              };
            },
          };
        },
        upsert: async (payload: {
          user_id: string;
          settings: NotificationSettingsData;
          updated_at: string;
        }) => {
          expect(payload.user_id).toBe('user-1');
          expect(payload.settings).toEqual(settings);
          expect(new Date(payload.updated_at).toString()).not.toBe('Invalid Date');
          return { error: response.saveError ?? null };
        },
      };
    },
  };
}

describe('SupabaseNotificationSettingsRepository', () => {
  it('loads an existing row', async () => {
    const repository = new SupabaseNotificationSettingsRepository(
      createFakeClient({ loadData: { settings } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(settings);
  });

  it('maps no row to ok(null)', async () => {
    const repository = new SupabaseNotificationSettingsRepository(
      createFakeClient({ loadData: null, loadError: null }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps database load errors to unavailable', async () => {
    const repository = new SupabaseNotificationSettingsRepository(
      createFakeClient({ loadError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('saves settings with an upsert', async () => {
    const repository = new SupabaseNotificationSettingsRepository(createFakeClient({}));

    const result = await repository.save(asUserId('user-1'), settings);

    expect(result.ok).toBe(true);
  });
});
