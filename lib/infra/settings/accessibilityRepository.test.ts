import { describe, expect, it } from 'vitest';
import { SupabaseAccessibilitySettingsRepository } from './accessibilityRepository';
import type { AccessibilitySettings } from '../../domain/settings/accessibility';
import { asUserId } from '../../domain/core/ids';

const settings: AccessibilitySettings = {
  keyboardShortcuts: true,
  autoDismissMessages: true,
  highContrastMode: 'system',
  reducedMotion: 'system',
};

function createFakeClient(response: {
  loadData?: { settings: AccessibilitySettings } | null;
  loadError?: { code?: string; message?: string } | null;
  saveError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'accessibility_settings') => {
      expect(table).toBe('accessibility_settings');
      return {
        select: (columns: '*') => {
          expect(columns).toBe('*');
          return {
            eq: (column: 'user_id', value: string) => {
              expect(column).toBe('user_id');
              expect(value).toBe('user-1');
              return {
                single: async () => ({
                  data: response.loadData ?? null,
                  error: response.loadError ?? null,
                }),
              };
            },
          };
        },
        upsert: async (payload: {
          user_id: string;
          settings: AccessibilitySettings;
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

describe('SupabaseAccessibilitySettingsRepository', () => {
  it('loads an existing row', async () => {
    const repository = new SupabaseAccessibilitySettingsRepository(
      createFakeClient({ loadData: { settings } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(settings);
  });

  it('maps no row to ok(null)', async () => {
    const repository = new SupabaseAccessibilitySettingsRepository(
      createFakeClient({ loadError: { code: 'PGRST116', message: 'No rows' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps database load errors to unavailable', async () => {
    const repository = new SupabaseAccessibilitySettingsRepository(
      createFakeClient({ loadError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('saves settings with an upsert', async () => {
    const repository = new SupabaseAccessibilitySettingsRepository(createFakeClient({}));

    const result = await repository.save(asUserId('user-1'), settings);

    expect(result.ok).toBe(true);
  });
});
