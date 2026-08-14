import { describe, expect, it, vi } from 'vitest';
import { FreeformGraphRepo } from './graphRepo';

/**
 * PATCH 9P: unit tests for FreeformGraphRepo.deleteEdgesForPost, the query
 * that removes every Graph edge touching a post that just became a
 * Container child. Uses a minimal chainable stub matching the exact subset
 * of the supabase-js query builder this method calls -- same shape/spirit
 * as the real client's .from().delete().eq().or() chain used by the
 * existing (and untouched) deleteEdge method.
 */
function makeChain(result: { error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: any = {
    delete: (...args: unknown[]) => { calls.push({ method: 'delete', args }); return chain; },
    eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return chain; },
    or: (...args: unknown[]) => { calls.push({ method: 'or', args }); return Promise.resolve(result); },
  };
  return { chain, calls };
}

function makeSupabaseStub(result: { error: unknown }) {
  const from = vi.fn();
  const { chain, calls } = makeChain(result);
  from.mockReturnValue(chain);
  return { supabase: { from } as any, from, calls };
}

describe('FreeformGraphRepo.deleteEdgesForPost', () => {
  it('deletes from freeform_graph_edges scoped to board_id, matching either endpoint via .or()', async () => {
    const { supabase, from, calls } = makeSupabaseStub({ error: null });
    const repo = new FreeformGraphRepo(supabase, 'board-1');

    await repo.deleteEdgesForPost('post-1');

    expect(from).toHaveBeenCalledWith('freeform_graph_edges');
    expect(calls).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['board_id', 'board-1'] },
      { method: 'or', args: ['source_post_id.eq.post-1,target_post_id.eq.post-1'] },
    ]);
  });

  it('marks the table unavailable and swallows a missing-relation error (42P01), matching deleteEdge', async () => {
    const { supabase } = makeSupabaseStub({ error: { code: '42P01', message: 'relation does not exist' } });
    const repo = new FreeformGraphRepo(supabase, 'board-1');

    await expect(repo.deleteEdgesForPost('post-1')).resolves.toBeUndefined();

    // Table now flagged unavailable -- a second call short-circuits with no query at all.
    const secondFrom = vi.fn();
    (repo as any).supabase = { from: secondFrom };
    await repo.deleteEdgesForPost('post-2');
    expect(secondFrom).not.toHaveBeenCalled();
  });

  it('throws on any other error, same as deleteEdge', async () => {
    const { supabase } = makeSupabaseStub({ error: { code: '23505', message: 'some other db error' } });
    const repo = new FreeformGraphRepo(supabase, 'board-1');

    await expect(repo.deleteEdgesForPost('post-1')).rejects.toEqual({
      code: '23505',
      message: 'some other db error',
    });
  });

  it('is a no-op once isTableUnavailable is already set (e.g. by a prior getEdges/upsertEdge call)', async () => {
    const { supabase, from } = makeSupabaseStub({ error: null });
    const repo = new FreeformGraphRepo(supabase, 'board-1');
    (repo as any).isTableUnavailable = true;

    await repo.deleteEdgesForPost('post-1');

    expect(from).not.toHaveBeenCalled();
  });

  it('PATCH 9Q [idempotence]: resolves cleanly when zero rows match -- .delete() is never called with a count option, so the method must not condition success on affected-row count', async () => {
    // A Postgres/PostgREST delete matching zero rows still resolves with
    // { error: null } (never a special "not found" error) -- the same
    // { error: null } shape as a delete matching one or many rows, since
    // this repo never requests { count: 'exact' }. This test's stub, like
    // production's real response, carries no `count` field at all.
    const { supabase } = makeSupabaseStub({ error: null });
    const repo = new FreeformGraphRepo(supabase, 'board-1');

    await expect(repo.deleteEdgesForPost('post-with-no-edges')).resolves.toBeUndefined();
  });

  it('PATCH 9Q [idempotence]: repeated calls for the same postId are each individually safe', async () => {
    const { supabase } = makeSupabaseStub({ error: null });
    const repo = new FreeformGraphRepo(supabase, 'board-1');

    await expect(repo.deleteEdgesForPost('post-1')).resolves.toBeUndefined();
    await expect(repo.deleteEdgesForPost('post-1')).resolves.toBeUndefined();
  });
});
