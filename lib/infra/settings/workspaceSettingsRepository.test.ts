import { describe, expect, it } from 'vitest';
import { SupabaseWorkspaceSettingsRepository } from './workspaceSettingsRepository';
import { asUserId } from '../../domain/core/ids';

const row = {
  id: 'settings-1',
  workspace_name: 'Team Space',
  workspace_logo: 'https://example.com/logo.png',
};

function createFakeClient(response: {
  findData?: typeof row | null;
  findError?: { code?: string; message?: string } | null;
  updateError?: { code?: string; message?: string } | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'workspace_settings') => {
      expect(table).toBe('workspace_settings');
      return {
        select: (columns: 'id, workspace_name, workspace_logo') => {
          expect(columns).toBe('id, workspace_name, workspace_logo');
          return {
            eq: (column: 'workspace_id', value: string) => {
              expect(column).toBe('workspace_id');
              expect(value).toBe('workspace-1');
              return {
                maybeSingle: async () => ({
                  data: response.findData ?? null,
                  error: response.findError ?? null,
                }),
              };
            },
          };
        },
        update: (payload: {
          workspace_name: string;
          workspace_logo: string | null;
          updated_at: string;
        }) => {
          expect(payload).toEqual({
            workspace_name: 'Updated Name',
            workspace_logo: 'https://example.com/new-logo.png',
            updated_at: '2026-07-08T10:00:00.000Z',
          });
          return {
            eq: async (column: 'id', value: string) => {
              expect(column).toBe('id');
              expect(value).toBe('settings-1');
              return { error: response.updateError ?? null };
            },
          };
        },
        insert: async (payload: {
          workspace_id: string;
          user_id: ReturnType<typeof asUserId>;
          workspace_name: string;
          workspace_logo: string | null;
          updated_at: string;
        }) => {
          expect(payload).toEqual({
            workspace_id: 'workspace-1',
            user_id: asUserId('user-1'),
            workspace_name: 'Updated Name',
            workspace_logo: 'https://example.com/new-logo.png',
            updated_at: '2026-07-08T10:00:00.000Z',
          });
          return { error: response.insertError ?? null };
        },
      };
    },
  };
}

describe('SupabaseWorkspaceSettingsRepository', () => {
  it('loads an existing row and maps snake_case to camelCase', async () => {
    const repository = new SupabaseWorkspaceSettingsRepository(createFakeClient({ findData: row }));

    const result = await repository.findByWorkspaceId('workspace-1');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      id: 'settings-1',
      workspaceName: 'Team Space',
      workspaceLogo: 'https://example.com/logo.png',
    });
  });

  it('maps maybeSingle no-row to ok(null)', async () => {
    const repository = new SupabaseWorkspaceSettingsRepository(createFakeClient({}));

    const result = await repository.findByWorkspaceId('workspace-1');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps load errors to err', async () => {
    const repository = new SupabaseWorkspaceSettingsRepository(
      createFakeClient({ findError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.findByWorkspaceId('workspace-1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('updates with the exact payload keys', async () => {
    const repository = new SupabaseWorkspaceSettingsRepository(createFakeClient({}));

    const result = await repository.updateById('settings-1', {
      workspaceName: 'Updated Name',
      workspaceLogo: 'https://example.com/new-logo.png',
      updatedAt: '2026-07-08T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
  });

  it('inserts with the exact payload keys', async () => {
    const repository = new SupabaseWorkspaceSettingsRepository(createFakeClient({}));

    const result = await repository.insert({
      workspaceId: 'workspace-1',
      userId: asUserId('user-1'),
      workspaceName: 'Updated Name',
      workspaceLogo: 'https://example.com/new-logo.png',
      updatedAt: '2026-07-08T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
  });
});
