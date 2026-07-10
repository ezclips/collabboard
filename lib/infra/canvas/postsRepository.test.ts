import { describe, expect, it } from 'vitest';
import { SupabasePostsRepository } from './postsRepository';
import { asPostId } from '../../domain/core/ids';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(
  error: FakeError | null = null,
  insertReturnData: Record<string, unknown> | null = { id: 'row-1' },
  metadataRow: { metadata: Record<string, unknown> | null } | null = { metadata: {} },
) {
  const fromTables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];
  const deleteEqCalls: Array<{ column: string; value: string }> = [];
  const deleteInCalls: Array<{ column: string; values: readonly string[] }> = [];
  const insertCalls: object[] = [];
  const selectSingleCalls: object[] = [];
  const selectColumnsCalls: string[] = [];
  const selectMetadataEqCalls: Array<{ column: string; value: string }> = [];

  const client = {
    from(table: 'padlets') {
      fromTables.push(table);
      return {
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error };
            },
          };
        },
        select(columns: 'metadata') {
          selectColumnsCalls.push(columns);
          return {
            eq: (column: 'id', value: string) => {
              selectMetadataEqCalls.push({ column, value });
              return {
                maybeSingle: async () => ({ data: metadataRow, error }),
              };
            },
          };
        },
        delete() {
          return {
            eq: async (column: string, value: string) => {
              deleteEqCalls.push({ column, value });
              return { error };
            },
            in: async (column: string, values: readonly string[]) => {
              deleteInCalls.push({ column, values });
              return { error };
            },
          };
        },
        insert(row: object) {
          insertCalls.push(row);
          return {
            // The real builder is a thenable awaited directly for plain inserts;
            // the generic signature mirrors PromiseLike<{ error }> structurally.
            then<TResult1 = { error: FakeError | null }, TResult2 = never>(
              onFulfilled?:
                | ((value: { error: FakeError | null }) => TResult1 | PromiseLike<TResult1>)
                | null,
              onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): Promise<TResult1 | TResult2> {
              return Promise.resolve({ error }).then(onFulfilled, onRejected);
            },
            select() {
              return {
                single: async () => {
                  selectSingleCalls.push(row);
                  return { data: insertReturnData, error };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client,
    fromTables,
    updateCalls,
    eqCalls,
    deleteEqCalls,
    deleteInCalls,
    insertCalls,
    selectSingleCalls,
    selectColumnsCalls,
    selectMetadataEqCalls,
  };
}

const fields = {
  content: '[{"id":"task-1","completed":true}]',
  metadata: { todoTitle: 'Groceries', tasks: [{ id: 'task-1', completed: true }] },
  updatedAt: '2026-07-09T12:00:00.000Z',
};

describe('SupabasePostsRepository', () => {
  it('sends the exact legacy payload to padlets filtered by the post id', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTasks(asPostId('post-1'), fields);

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([
      {
        content: fields.content,
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      },
    ]);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTasks(asPostId('post-1'), fields);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('performs exactly one update per call', async () => {
    const { client, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    await repository.updateTasks(asPostId('post-1'), fields);
    await repository.updateTasks(asPostId('post-2'), fields);

    expect(updateCalls).toHaveLength(2);
  });

  it('updateMetadata sends exactly the metadata and updated_at payload', async () => {
    const { client, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateMetadata(asPostId('container-1'), {
      metadata: { title: 'Box', childPadletIds: ['child-1'] },
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([
      {
        metadata: { title: 'Box', childPadletIds: ['child-1'] },
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual(['metadata', 'updated_at']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'container-1' }]);
  });

  it('deleteById issues a padlets delete filtered by the post id', async () => {
    const { client, fromTables, deleteEqCalls, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(deleteEqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
    expect(updateCalls).toHaveLength(0);
  });

  it('deleteByIds issues a padlets delete with the exact id list', async () => {
    const { client, deleteInCalls, deleteEqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteByIds([asPostId('post-1'), asPostId('post-2')]);

    expect(result.ok).toBe(true);
    expect(deleteInCalls).toEqual([{ column: 'id', values: ['post-1', 'post-2'] }]);
    expect(deleteEqCalls).toHaveLength(0);
  });

  it('deleteByParentId filters on the metadata->>parentId column', async () => {
    const { client, deleteEqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteByParentId(asPostId('container-1'));

    expect(result.ok).toBe(true);
    expect(deleteEqCalls).toEqual([{ column: 'metadata->>parentId', value: 'container-1' }]);
  });

  it('maps a delete error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteById(asPostId('post-1'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('insert sends the row verbatim to padlets', async () => {
    const { client, fromTables, insertCalls, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);
    const row = { id: 'post-1', board_id: 'board-1', title: 'Hello' };

    const result = await repository.insert(row);

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(insertCalls).toEqual([row]);
    expect(insertCalls[0]).toBe(row);
    expect(updateCalls).toHaveLength(0);
  });

  it('insert maps a resolved error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.insert({ id: 'post-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('insertReturning issues insert().select().single() and returns the row', async () => {
    const returned = { id: 'post-1', board_id: 'board-1' };
    const { client, insertCalls, selectSingleCalls } = createFakeClient(null, returned);
    const repository = new SupabasePostsRepository(client);
    const row = { id: 'post-1', board_id: 'board-1' };

    const result = await repository.insertReturning(row);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(returned);
    }
    expect(insertCalls).toEqual([row]);
    expect(selectSingleCalls).toEqual([row]);
  });

  it('insertReturning maps a resolved error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.insertReturning({ id: 'post-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('updateMetadataUnstamped sends ONLY the metadata payload - no updated_at key', async () => {
    const { client, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateMetadataUnstamped(asPostId('post-1'), {
      metadata: { parentId: 'container-1' },
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([{ metadata: { parentId: 'container-1' } }]);
    expect(Object.keys(updateCalls[0])).toEqual(['metadata']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });
});

describe('SupabasePostsRepository.updatePosition', () => {
  it('sends ONLY position_x/position_y/updated_at when no metadata is given - no metadata key', async () => {
    const { client, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updatePosition(asPostId('post-1'), {
      positionX: 120,
      positionY: 45,
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([
      {
        position_x: 120,
        position_y: 45,
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual(['position_x', 'position_y', 'updated_at']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('includes the metadata key when metadata is given', async () => {
    const { client, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updatePosition(asPostId('post-1'), {
      positionX: 80,
      positionY: 30,
      updatedAt: '2026-07-10T08:00:00.000Z',
      metadata: { sectionId: 's-1' },
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([
      {
        position_x: 80,
        position_y: 30,
        updated_at: '2026-07-10T08:00:00.000Z',
        metadata: { sectionId: 's-1' },
      },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual([
      'position_x',
      'position_y',
      'updated_at',
      'metadata',
    ]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updatePosition(asPostId('post-1'), {
      positionX: 0,
      positionY: 0,
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('SupabasePostsRepository.updateTitle', () => {
  it('sends ONLY the title payload - no updated_at key', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTitle(asPostId('post-1'), { title: '' });

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([{ title: '' }]);
    expect(Object.keys(updateCalls[0])).toEqual(['title']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTitle(asPostId('post-1'), { title: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('SupabasePostsRepository.findMetadataById', () => {
  it('selects ONLY the metadata column filtered by the post id and returns it', async () => {
    const { client, fromTables, selectColumnsCalls, selectMetadataEqCalls, updateCalls } =
      createFakeClient(null, { id: 'row-1' }, { metadata: { comments: [{ id: 'c-1' }] } });
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ comments: [{ id: 'c-1' }] });
    }
    expect(fromTables).toEqual(['padlets']);
    expect(selectColumnsCalls).toEqual(['metadata']);
    expect(selectMetadataEqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns null when the row is missing (maybeSingle data null)', async () => {
    const { client } = createFakeClient(null, { id: 'row-1' }, null);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('returns null when the metadata column itself is null', async () => {
    const { client } = createFakeClient(null, { id: 'row-1' }, { metadata: null });
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
