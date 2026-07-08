import { describe, expect, it } from 'vitest';
import { SupabaseWorkspacesRepository } from './workspacesRepository';

function createFakeClient(response: { updateError?: { code?: string; message?: string } | null }) {
  return {
    from: (table: 'workspaces') => {
      expect(table).toBe('workspaces');
      return {
        update: (payload: {
          name: string;
          logo_url: string | null;
          updated_at: string;
        }) => {
          expect(payload).toEqual({
            name: 'Updated Name',
            logo_url: 'https://example.com/new-logo.png',
            updated_at: '2026-07-08T10:00:00.000Z',
          });
          return {
            eq: async (column: 'id', value: string) => {
              expect(column).toBe('id');
              expect(value).toBe('workspace-1');
              return { error: response.updateError ?? null };
            },
          };
        },
      };
    },
  };
}

describe('SupabaseWorkspacesRepository', () => {
  it('updates with the exact payload keys', async () => {
    const repository = new SupabaseWorkspacesRepository(createFakeClient({}));

    const result = await repository.updateNameAndLogo('workspace-1', {
      name: 'Updated Name',
      logoUrl: 'https://example.com/new-logo.png',
      updatedAt: '2026-07-08T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
  });

  it('maps update errors to err', async () => {
    const repository = new SupabaseWorkspacesRepository(
      createFakeClient({ updateError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.updateNameAndLogo('workspace-1', {
      name: 'Updated Name',
      logoUrl: 'https://example.com/new-logo.png',
      updatedAt: '2026-07-08T10:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });
});
