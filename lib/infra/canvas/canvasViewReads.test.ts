import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findBoardById,
  findLinesByBoardId,
  findPostsByBoardId,
  findSectionsByBoardId,
} from './canvasViewReads';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

vi.mock('../supabase/browserClient', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createBrowserSupabaseClient);

interface FakeResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface RecordedCall {
  table: string;
  columns: string;
  filterColumn: string;
  filterValue: string;
  maybeSingle: boolean;
}

/**
 * The fake builder is BOTH awaitable (the three list reads await eq()
 * directly) and .maybeSingle()-chainable (the board read) - mirroring the
 * real builder's thenable shape. The double-cast mirrors the production
 * factory idiom (the authState.test.ts harness, PATCH-037).
 */
function installFakeClient(responses: Record<string, FakeResponse>) {
  const calls: RecordedCall[] = [];
  mockedCreateClient.mockReturnValue({
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(filterColumn: string, filterValue: string) {
              const call: RecordedCall = { table, columns, filterColumn, filterValue, maybeSingle: false };
              calls.push(call);
              const response = responses[table];
              return Object.assign(Promise.resolve(response), {
                maybeSingle: async () => {
                  call.maybeSingle = true;
                  return response;
                },
              });
            },
          };
        },
      };
    },
  } as unknown as ReturnType<typeof createBrowserSupabaseClient>);
  return calls;
}

beforeEach(() => {
  mockedCreateClient.mockReset();
});

describe('findBoardById', () => {
  it('selects * from boards filtered by id via maybeSingle and returns the row', async () => {
    const row = { id: 'board-1', layout: 'grid' };
    const calls = installFakeClient({ boards: { data: row, error: null } });

    const result = await findBoardById('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(row);
    }
    expect(calls).toEqual([
      { table: 'boards', columns: '*', filterColumn: 'id', filterValue: 'board-1', maybeSingle: true },
    ]);
  });

  it('returns ok(null) when the row is missing', async () => {
    installFakeClient({ boards: { data: null, error: null } });

    const result = await findBoardById('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    installFakeClient({ boards: { data: null, error: supabaseError } });

    const result = await findBoardById('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('findPostsByBoardId', () => {
  it('selects * from padlets filtered by board_id and returns the rows', async () => {
    const rows = [{ id: 'post-1' }, { id: 'post-2' }];
    const calls = installFakeClient({ padlets: { data: rows, error: null } });

    const result = await findPostsByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rows);
    }
    expect(calls).toEqual([
      { table: 'padlets', columns: '*', filterColumn: 'board_id', filterValue: 'board-1', maybeSingle: false },
    ]);
  });

  it('collapses null data to an empty list', async () => {
    installFakeClient({ padlets: { data: null, error: null } });

    const result = await findPostsByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    installFakeClient({ padlets: { data: null, error: supabaseError } });

    const result = await findPostsByBoardId('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('findLinesByBoardId', () => {
  it('selects * from canvas_lines filtered by board_id and returns the rows', async () => {
    const rows = [{ id: 'line-1' }];
    const calls = installFakeClient({ canvas_lines: { data: rows, error: null } });

    const result = await findLinesByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rows);
    }
    expect(calls).toEqual([
      { table: 'canvas_lines', columns: '*', filterColumn: 'board_id', filterValue: 'board-1', maybeSingle: false },
    ]);
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42P01', message: 'relation does not exist' };
    installFakeClient({ canvas_lines: { data: null, error: supabaseError } });

    const result = await findLinesByBoardId('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('findSectionsByBoardId', () => {
  it('selects * from board_sections filtered by board_id and returns the rows', async () => {
    const rows = [{ id: 7, position: 0 }];
    const calls = installFakeClient({ board_sections: { data: rows, error: null } });

    const result = await findSectionsByBoardId('board-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(rows);
    }
    expect(calls).toEqual([
      { table: 'board_sections', columns: '*', filterColumn: 'board_id', filterValue: 'board-1', maybeSingle: false },
    ]);
  });

  it('maps a resolved supabase error to unavailable carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    installFakeClient({ board_sections: { data: null, error: supabaseError } });

    const result = await findSectionsByBoardId('board-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
