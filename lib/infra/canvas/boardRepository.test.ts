import { describe, expect, it } from 'vitest';
import { SupabaseCanvasBoardRepository } from './boardRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(mutationError: FakeError | null = null) {
  const tables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];

  const client = {
    from(table: 'boards') {
      tables.push(table);
      return {
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
      };
    },
  };

  return { client, tables, updateCalls, eqCalls };
}

describe('SupabaseCanvasBoardRepository', () => {
  it('updateSettings sends ONLY the settings payload - no updated_at key', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateSettings('board-1', {
      settings: { mapStyleId: 'style-x' },
    });

    expect(result.ok).toBe(true);
    expect(fake.tables).toEqual(['boards']);
    expect(fake.updateCalls).toEqual([{ settings: { mapStyleId: 'style-x' } }]);
    expect(Object.keys(fake.updateCalls[0])).toEqual(['settings']);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 'board-1' }]);
  });

  it('updateSettingsStamped sends settings plus updated_at', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateSettingsStamped('board-1', {
      settings: { chronoMode: 'month' },
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([
      { settings: { chronoMode: 'month' }, updated_at: '2026-07-10T08:00:00.000Z' },
    ]);
  });

  it('updateBackground sends the snake_case background payload', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateBackground('board-1', {
      backgroundType: 'image',
      backgroundValue: 'https://x.test/bg.png',
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([
      {
        background_type: 'image',
        background_value: 'https://x.test/bg.png',
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
  });

  it('updateCover sends the wholesale metadata payload', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateCover('board-1', {
      coverPostId: 'post-9',
      coverImage: null,
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([
      {
        metadata: { cover_post_id: 'post-9', cover_image: null },
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
  });

  it('maps a mutation error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient(supabaseError);
    const repository = new SupabaseCanvasBoardRepository(fake.client);

    const result = await repository.updateSettings('board-1', { settings: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
