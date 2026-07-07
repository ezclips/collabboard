import { describe, expect, it } from 'vitest';
import type { DashboardSettingsData } from '../../domain/settings/dashboard';
import { asUserId } from '../../domain/core/ids';
import { SupabaseDashboardSettingsRepository } from './dashboardSettingsRepository';

const settings: DashboardSettingsData = {
  libraries: [
    {
      id: 'personal-1',
      name: 'Personal Library',
      username: 'user',
      type: 'personal',
      show: true,
    },
  ],
  defaultWorkspace: 'personal-1',
};

function createFakeClient(response: {
  loadData?: { default_workspace?: string | null; libraries?: unknown | null } | null;
  loadError?: { code?: string; message?: string } | null;
  saveError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'dashboard_settings') => {
      expect(table).toBe('dashboard_settings');
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
          libraries: DashboardSettingsData['libraries'];
          default_workspace: string;
          updated_at: string;
        }) => {
          expect(payload.user_id).toBe('user-1');
          expect(payload.libraries).toEqual(settings.libraries);
          expect(payload.default_workspace).toBe(settings.defaultWorkspace);
          expect(new Date(payload.updated_at).toString()).not.toBe('Invalid Date');
          return { error: response.saveError ?? null };
        },
      };
    },
  };
}

describe('SupabaseDashboardSettingsRepository', () => {
  it('loads an existing row with column mapping', async () => {
    const repository = new SupabaseDashboardSettingsRepository(
      createFakeClient({
        loadData: {
          default_workspace: 'workspace-1',
          libraries: settings.libraries,
        },
      }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      defaultWorkspace: 'workspace-1',
      libraries: settings.libraries,
    });
  });

  it('maps no row to ok(null)', async () => {
    const repository = new SupabaseDashboardSettingsRepository(
      createFakeClient({ loadError: { code: 'PGRST116', message: 'No rows' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps database load errors to unavailable', async () => {
    const repository = new SupabaseDashboardSettingsRepository(
      createFakeClient({ loadError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.load(asUserId('user-1'));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('saves settings with snake_case payload fields', async () => {
    const repository = new SupabaseDashboardSettingsRepository(createFakeClient({}));

    const result = await repository.save(asUserId('user-1'), settings);

    expect(result.ok).toBe(true);
  });
});
