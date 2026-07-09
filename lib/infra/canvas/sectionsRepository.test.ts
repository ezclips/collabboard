import { describe, expect, it } from 'vitest';
import { SupabaseSectionsRepository } from './sectionsRepository';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(options: {
  insertRow?: Record<string, unknown> | null;
  insertError?: FakeError | null;
  mutationError?: FakeError | null;
} = {}) {
  const { insertRow = { id: 41 }, insertError = null, mutationError = null } = options;
  const insertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const deleteEqCalls: Array<{ column: string; value: number }> = [];
  const eqCalls: Array<{ column: string; value: number }> = [];

  const client = {
    from(table: 'board_sections') {
      expectTable(table);
      return {
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload);
          return {
            select() {
              return {
                single: async () => ({ data: insertError ? null : insertRow, error: insertError }),
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: number) => {
              eqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
        delete() {
          return {
            eq: async (column: 'id', value: number) => {
              deleteEqCalls.push({ column, value });
              return { error: mutationError };
            },
          };
        },
      };
    },
  };

  const tables: string[] = [];
  function expectTable(table: string) {
    tables.push(table);
  }

  return { client, insertCalls, updateCalls, deleteEqCalls, eqCalls, tables };
}

describe('SupabaseSectionsRepository', () => {
  it('inserts the snake_case payload and returns the created row', async () => {
    const fake = createFakeClient({ insertRow: { id: 41, title: 'Section 3' } });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSection({
      boardId: 'board-9',
      title: 'Section 3',
      description: '',
      position: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 41, title: 'Section 3' });
    }
    expect(fake.insertCalls).toEqual([
      { board_id: 'board-9', title: 'Section 3', description: '', position: 2 },
    ]);
    expect(fake.tables).toEqual(['board_sections']);
  });

  it('maps an insert error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '23503', message: 'fk violation' };
    const fake = createFakeClient({ insertError: supabaseError });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.insertSection({
      boardId: 'board-9',
      title: 'Section 1',
      description: '',
      position: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('renames via a title+updated_at payload filtered by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.renameSection(12, {
      title: 'Sprint',
      updatedAt: '2026-07-09T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([{ title: 'Sprint', updated_at: '2026-07-09T12:00:00.000Z' }]);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 12 }]);
  });

  it('moves via a position+updated_at payload filtered by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.updateSectionPosition(3, {
      position: 1,
      updatedAt: '2026-07-09T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fake.updateCalls).toEqual([{ position: 1, updated_at: '2026-07-09T12:00:00.000Z' }]);
    expect(fake.eqCalls).toEqual([{ column: 'id', value: 3 }]);
  });

  it('deletes by id', async () => {
    const fake = createFakeClient();
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.deleteSection(5);

    expect(result.ok).toBe(true);
    expect(fake.deleteEqCalls).toEqual([{ column: 'id', value: 5 }]);
  });

  it('maps a mutation error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const fake = createFakeClient({ mutationError: supabaseError });
    const repository = new SupabaseSectionsRepository(fake.client);

    const result = await repository.updateSectionPosition(3, {
      position: 1,
      updatedAt: '2026-07-09T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
