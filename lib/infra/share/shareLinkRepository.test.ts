import { describe, expect, it } from 'vitest';
import { SupabaseShareLinkRepository } from './shareLinkRepository';

const shareLink = {
  id: 'link-1',
  token: 'token-1',
  share_target: 'post-in-board',
  board_id: 'board-1',
  padlet_id: 'padlet-1',
  permission: 'view',
  password_hash: null,
  expires_at: null,
  access_count: 4,
};

function createFakeClient(response: {
  findData?: typeof shareLink | null;
  findError?: { code?: string; message?: string } | null;
  updateError?: { code?: string; message?: string } | null;
}) {
  return {
    from: (table: 'share_links') => {
      expect(table).toBe('share_links');
      return {
        select: (columns: '*') => {
          expect(columns).toBe('*');
          return {
            eq: (column: 'token', value: string) => {
              expect(column).toBe('token');
              expect(value).toBe('token-1');
              return {
                single: async () => ({
                  data: response.findData ?? null,
                  error: response.findError ?? null,
                }),
              };
            },
          };
        },
        update: (payload: { access_count: number; last_accessed_at: string }) => {
          expect(payload.access_count).toBe(5);
          expect(new Date(payload.last_accessed_at).toString()).not.toBe('Invalid Date');
          return {
            eq: async (column: 'id', value: string | number) => {
              expect(column).toBe('id');
              expect(value).toBe('link-1');
              return { error: response.updateError ?? null };
            },
          };
        },
      };
    },
  };
}

describe('SupabaseShareLinkRepository', () => {
  it('loads an existing share link row', async () => {
    const repository = new SupabaseShareLinkRepository(createFakeClient({ findData: shareLink }));

    const result = await repository.findByToken('token-1');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(shareLink);
  });

  it('maps PGRST116 to ok(null)', async () => {
    const repository = new SupabaseShareLinkRepository(
      createFakeClient({ findError: { code: 'PGRST116', message: 'No rows' } }),
    );

    const result = await repository.findByToken('token-1');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('maps other database errors to ok(null)', async () => {
    const repository = new SupabaseShareLinkRepository(
      createFakeClient({ findError: { code: '500', message: 'Database unavailable' } }),
    );

    const result = await repository.findByToken('token-1');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeNull();
  });

  it('records access with count increment and timestamp', async () => {
    const repository = new SupabaseShareLinkRepository(createFakeClient({}));

    await expect(repository.recordAccess('link-1', 4)).resolves.toBeUndefined();
  });

  it('swallows recordAccess update failures', async () => {
    const repository = new SupabaseShareLinkRepository(
      createFakeClient({ updateError: { code: '500', message: 'Update failed' } }),
    );

    await expect(repository.recordAccess('link-1', 4)).resolves.toBeUndefined();
  });
});
