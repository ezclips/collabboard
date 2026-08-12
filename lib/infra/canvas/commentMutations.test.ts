// PATCH 8O.2 -- persistence path for 'comment'-mode comment mutations.
//
// Proves the fail-safe contract described in commentMutations.ts's own
// header: no optimistic local mutation happens until the RPC actually
// succeeds, a failure surfaces via toast.error and leaves state untouched,
// and a success applies the SERVER's returned comment list (not a
// client-computed guess) via setPadlets.
import fs from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { toast } from 'sonner';
import { createCommentModeMutations, callCommentMutationRpc } from './commentMutations';
import type { Padlet } from '@/types/collabboard';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makePadlets(): Padlet[] {
  return [
    {
      id: 'padlet-1',
      board_id: 'board-1',
      type: 'image',
      title: '',
      content: '',
      position_x: 0,
      position_y: 0,
      width: 100,
      height: 100,
      metadata: { detachedComments: [{ id: 'c1', text: 'hi', userId: 'u1', userName: 'A', timestamp: 1 }] },
    } as unknown as Padlet,
  ];
}

function makeSetPadlets(initial: Padlet[]) {
  let current = initial;
  const setPadlets = vi.fn((updater: Padlet[] | ((prev: Padlet[]) => Padlet[])) => {
    current = typeof updater === 'function' ? (updater as (prev: Padlet[]) => Padlet[])(current) : updater;
  });
  return { setPadlets, get: () => current };
}

describe('callCommentMutationRpc', () => {
  it('calls supabase.rpc("comment_mutate", ...) with the exact narrow payload -- no arbitrary metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await callCommentMutationRpc({ rpc } as any, {
      padletId: 'p1',
      operation: 'EDIT_OWN_COMMENT',
      commentId: 'c1',
      text: 'hello',
    });
    expect(rpc).toHaveBeenCalledWith('comment_mutate', {
      p_padlet_id: 'p1',
      p_operation: 'EDIT_OWN_COMMENT',
      p_comment_id: 'c1',
      p_text: 'hello',
      p_text_color: null,
      p_background_color: null,
      p_is_strikethrough: null,
    });
  });

  it('returns ok:false with the error message when the RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'function comment_mutate(...) does not exist' } });
    const result = await callCommentMutationRpc({ rpc } as any, { padletId: 'p1', operation: 'ADD_COMMENT', text: 'x' });
    expect(result).toEqual({ ok: false, error: 'function comment_mutate(...) does not exist' });
  });

  it('returns ok:true with the server comment array on success', async () => {
    const comments = [{ id: 'c1', text: 'x', userId: 'u1', userName: 'A', timestamp: 1 }];
    const rpc = vi.fn().mockResolvedValue({ data: comments, error: null });
    const result = await callCommentMutationRpc({ rpc } as any, { padletId: 'p1', operation: 'ADD_COMMENT', text: 'x' });
    expect(result).toEqual({ ok: true, comments });
  });
});

describe('createCommentModeMutations -- success path', () => {
  it('submitOwnComment sends ADD_COMMENT and applies the server-returned comments', async () => {
    const serverComments = [
      { id: 'c1', text: 'hi', userId: 'u1', userName: 'A', timestamp: 1 },
      { id: 'c2', text: 'new one', userId: 'u1', userName: 'A', timestamp: 2 },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: serverComments, error: null });
    const { setPadlets, get } = makeSetPadlets(makePadlets());
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });

    mutations.submitOwnComment('padlet-1', 'new one');
    await new Promise((r) => setTimeout(r, 0));

    expect(rpc).toHaveBeenCalledWith('comment_mutate', expect.objectContaining({
      p_padlet_id: 'padlet-1',
      p_operation: 'ADD_COMMENT',
      p_text: 'new one',
    }));
    expect((get()[0].metadata as any).detachedComments).toEqual(serverComments);
    expect((get()[0].metadata as any).comments).toEqual(serverComments);
  });

  it('editOwnComment sends EDIT_OWN_COMMENT with commentId and text', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const { setPadlets } = makeSetPadlets(makePadlets());
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });
    mutations.editOwnComment('padlet-1', 'c1', 'edited text');
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledWith('comment_mutate', expect.objectContaining({
      p_operation: 'EDIT_OWN_COMMENT', p_comment_id: 'c1', p_text: 'edited text',
    }));
  });

  it('removeOwnComment sends DELETE_OWN_COMMENT with commentId', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const { setPadlets } = makeSetPadlets(makePadlets());
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });
    mutations.removeOwnComment('padlet-1', 'c1');
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledWith('comment_mutate', expect.objectContaining({
      p_operation: 'DELETE_OWN_COMMENT', p_comment_id: 'c1',
    }));
  });

  it('toggleOwnCommentStrikethrough and setOwnCommentColor both send STYLE_OWN_COMMENT', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const { setPadlets } = makeSetPadlets(makePadlets());
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });

    mutations.toggleOwnCommentStrikethrough('padlet-1', 'c1', true);
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledWith('comment_mutate', expect.objectContaining({
      p_operation: 'STYLE_OWN_COMMENT', p_is_strikethrough: true,
    }));

    rpc.mockClear();
    mutations.setOwnCommentColor('padlet-1', 'c1', '#ff0000', undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledWith('comment_mutate', expect.objectContaining({
      p_operation: 'STYLE_OWN_COMMENT', p_text_color: '#ff0000',
    }));
  });
});

describe('createCommentModeMutations -- fail-safe path (RPC not yet applied to the live database)', () => {
  it('does NOT mutate local state and surfaces toast.error when the RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'function comment_mutate(...) does not exist' } });
    const initial = makePadlets();
    const { setPadlets, get } = makeSetPadlets(initial);
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });

    mutations.submitOwnComment('padlet-1', 'will fail');
    await new Promise((r) => setTimeout(r, 0));

    expect(get()).toBe(initial);
    expect(get()[0].metadata).toBe(initial[0].metadata);
    expect(toast.error).toHaveBeenCalledWith('Failed to post comment');
  });

  it('never calls setPadlets before the RPC promise resolves -- no premature optimistic update', async () => {
    let resolveRpc!: (value: any) => void;
    const rpc = vi.fn().mockReturnValue(new Promise((resolve) => { resolveRpc = resolve; }));
    const { setPadlets } = makeSetPadlets(makePadlets());
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });

    mutations.editOwnComment('padlet-1', 'c1', 'still pending');
    await new Promise((r) => setTimeout(r, 0));
    expect(setPadlets).not.toHaveBeenCalled();

    resolveRpc({ data: [{ id: 'c1', text: 'still pending', userId: 'u1', userName: 'A', timestamp: 1 }], error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(setPadlets).toHaveBeenCalledTimes(1);
  });

  it('a delete failure leaves the deleted-looking comment untouched -- no fake success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const initial = makePadlets();
    const { setPadlets, get } = makeSetPadlets(initial);
    const mutations = createCommentModeMutations({ supabase: { rpc } as any, setPadlets });

    mutations.removeOwnComment('padlet-1', 'c1');
    await new Promise((r) => setTimeout(r, 0));

    expect((get()[0].metadata as any).detachedComments).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith('Failed to delete comment');
  });
});

// Negative controls C and D (PATCH 8O.2 spec) target the SERVER-side
// enforcement of "a forged userId cannot impersonate another user" and
// "arbitrary padlet metadata cannot be changed through the commenter write
// path". The comment_mutate RPC these controls target is DRAFTED but NOT
// APPLIED (no local Supabase/db-test harness exists in this repo to run a
// live injection against), so these are structural/design-level proofs
// instead: confirm the client-side RPC payload contract makes forging
// impossible to even ATTEMPT (no identity field exists to forge), and
// confirm the migration's only mutation touches exactly one jsonb path.
describe('structural proof -- negative controls C/D (server-side enforcement, RPC not yet applied)', () => {
  it('C: the RPC payload never includes a client-supplied identity field -- nothing to forge', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await callCommentMutationRpc({ rpc } as any, { padletId: 'p1', operation: 'ADD_COMMENT', text: 'hello' });
    const [, payload] = rpc.mock.calls[0];
    expect(Object.keys(payload)).not.toContain('p_user_id');
    expect(Object.keys(payload)).not.toContain('userId');
    expect(Object.keys(payload).sort()).toEqual([
      'p_background_color',
      'p_comment_id',
      'p_is_strikethrough',
      'p_padlet_id',
      'p_operation',
      'p_text',
      'p_text_color',
    ].sort());
  });

  it('D: the drafted migration performs exactly one UPDATE, touching only metadata.detachedComments', () => {
    const sql = fs.readFileSync('supabase/migrations/20260812_000000_add_comment_mutate_rpc.sql', 'utf8');
    const updateStatements = sql.match(/UPDATE padlets/g) ?? [];
    expect(updateStatements).toHaveLength(1);
    expect(sql).toContain("SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{detachedComments}', v_new_comments)");
    // No other column is ever assigned in that UPDATE.
    const updateBlock = sql.slice(sql.indexOf('UPDATE padlets'), sql.indexOf('WHERE id = p_padlet_id'));
    expect(updateBlock).not.toMatch(/SET\s+(title|content|type|position_x|position_y|width|height|file_url|board_id|canvas_id)\b/);
  });

  it('the function signature itself has no p_user_id / p_userid parameter -- identity can only come from auth.uid()', () => {
    const sql = fs.readFileSync('supabase/migrations/20260812_000000_add_comment_mutate_rpc.sql', 'utf8');
    const signatureStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.comment_mutate(');
    const signatureEnd = sql.indexOf(')', sql.indexOf('RETURNS', signatureStart));
    const signature = sql.slice(signatureStart, signatureEnd).toLowerCase();
    expect(signature).not.toContain('p_user_id');
    expect(sql).toContain("v_user_id uuid := auth.uid();");
    expect(sql).toContain("'userId', v_user_id::text,");
  });
});
