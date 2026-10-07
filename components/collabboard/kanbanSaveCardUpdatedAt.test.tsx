// PATCH-320 Addendum 6. saveCard must return the updated_at it wrote, and an
// update conditioned on a stale stamp must still report a conflict.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  response: { data: null as unknown, error: null as unknown },
  eqCalls: [] as Array<[string, unknown]>,
  insertPayload: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        hoisted.insertPayload = payload;
        const query: {
          eq: (col: string, val: unknown) => unknown;
          select: () => Promise<unknown>;
        } = {
          eq: (col: string, val: unknown) => {
            hoisted.eqCalls.push([col, val]);
            return query;
          },
          select: async () => hoisted.response,
        };
        return query;
      },
      insert: (payload: Record<string, unknown>) => {
        hoisted.insertPayload = payload;
        return Promise.resolve(hoisted.response);
      },
    }),
  }),
}));

import { saveCard } from '@/lib/kanban/supabaseAdapter';

beforeEach(() => {
  hoisted.response = { data: null, error: null };
  hoisted.eqCalls = [];
  hoisted.insertPayload = null;
});

describe('PATCH-320: saveCard returns the stamp it wrote', () => {
  it('returns the stored updated_at and conditions on the given stamp', async () => {
    hoisted.response = { data: [{ id: 'c1', updated_at: 'server-stamp' }], error: null };
    const result = await saveCard({ id: 'c1', canvas_id: 'b1', title: 'X', updated_at: 'old' } as never);

    expect(result.ok).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.updatedAt).toBe('server-stamp');
    expect(hoisted.eqCalls).toContainEqual(['updated_at', 'old']);
  });

  it('the next save can condition on the first save\'s returned stamp', async () => {
    hoisted.response = { data: [{ id: 'c1', updated_at: 'server-1' }], error: null };
    const first = await saveCard({ id: 'c1', canvas_id: 'b1', title: 'A', updated_at: 'old' } as never);

    hoisted.eqCalls = [];
    hoisted.response = { data: [{ id: 'c1', updated_at: 'server-2' }], error: null };
    await saveCard({ id: 'c1', canvas_id: 'b1', title: 'B', updated_at: first.updatedAt } as never);

    expect(hoisted.eqCalls).toContainEqual(['updated_at', 'server-1']);
  });

  it('a mismatched stamp still yields a conflict', async () => {
    hoisted.response = { data: [], error: null };
    const result = await saveCard({ id: 'c1', canvas_id: 'b1', title: 'X', updated_at: 'old' } as never);

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
  });

  it('an insert returns the updated_at it wrote', async () => {
    hoisted.response = { data: null, error: null };
    const result = await saveCard({ id: 'c1', canvas_id: 'b1', title: 'New' } as never, true);

    expect(result.ok).toBe(true);
    expect(typeof result.updatedAt).toBe('string');
    expect(hoisted.insertPayload?.updated_at).toBe(result.updatedAt);
  });
});
