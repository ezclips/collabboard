import { describe, expect, it } from 'vitest';
import { SupabaseLinesRepository } from './linesRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(options: {
  insertRow?: Record<string, unknown> | null;
  insertError?: FakeError | null;
  mutationError?: FakeError | null;
} = {}) {
  const { insertRow = { id: 'line-41' }, insertError = null, mutationError = null } = options;
  const insertCalls: object[] = [];
  const updateCalls: object[] = [];
  const eqCalls: Array<{ column: string; value: string }> = [];
  const deleteEqCalls: Array<{ column: string; value: string }> = [];
  const tables: string[] = [];

  const client = {
    from(table: 'canvas_lines') {
      tables.push(table);
      return {
        // The real insert builder is thenable AND .select().single()-chainable.
        insert(row: object) {
          insertCalls.push(row);
          return Object.assign(Promise.resolve({ error: insertError }), {
            select() {
              return {
                single: async () => ({
                  data: insertError ? null : insertRow,
                  error: insertError,
                }),
              };
            },
          });
        },
        update(payload: object) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
        delete() {
          return {
            eq: async (column: 'id', value: string) => {
              deleteEqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
      };
    },
  };

  return { client, insertCalls, updateCalls, eqCalls, deleteEqCalls, tables };
}

describe('SupabaseLinesRepository', () => {
  it('inserts the row verbatim into canvas_lines and returns ok', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseLinesRepository(fake.client);
    const row = { board_id: 'board-9', start_x: 1 };

    const result = await repository.insertLine(row);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toHaveLength(1);
    expect(fake.insertCalls[0]).toBe(row);
    expect(fake.tables).toEqual(['canvas_lines']);
  });

  it('returns the created row from insertLineReturning', async () => {
    const fake = createFakeClient({ insertRow: { id: 'line-42', board_id: 'board-9' } });
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.insertLineReturning({ board_id: 'board-9' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 'line-42', board_id: 'board-9' });
    }
  });

  it('maps an insert error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '23503', message: 'fk violation' };
    const fake = createFakeClient({ insertError: supabaseError });
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.insertLine({ board_id: 'board-9' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('updates the payload filtered by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.updateLineById('line-7', {
      color: '#fff',
      updated_at: '2026-07-11T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([{ color: '#fff', updated_at: '2026-07-11T12:00:00.000Z' }]);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 'line-7' }]);
  });

  it('deletes by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.deleteLineById('line-5');

    expect(result.ok).toBe(true);
    expect(fake.deleteEqCalls).toEqual([{ column: 'id', value: 'line-5' }]);
  });

  it('maps a mutation error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient({ mutationError: supabaseError });
    const repository = new SupabaseLinesRepository(fake.client);

    const result = await repository.updateLineById('line-7', { color: '#fff' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
