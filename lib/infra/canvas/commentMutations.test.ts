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
    const sql = fs.readFileSync('.fable5/drafts/comment_mutate_rpc_20260812.sql', 'utf8');
    const updateStatements = sql.match(/UPDATE public\.padlets/g) ?? [];
    expect(updateStatements).toHaveLength(1);
    expect(sql).toContain("SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{detachedComments}', v_new_comments)");
    // No other column is ever assigned in that UPDATE.
    const updateBlock = sql.slice(sql.indexOf('UPDATE public.padlets'), sql.indexOf('WHERE id = p_padlet_id'));
    expect(updateBlock).not.toMatch(/SET\s+(title|content|type|position_x|position_y|width|height|file_url|board_id|canvas_id)\b/);
  });

  it('the function signature itself has no p_user_id / p_userid parameter -- identity can only come from auth.uid()', () => {
    const sql = fs.readFileSync('.fable5/drafts/comment_mutate_rpc_20260812.sql', 'utf8');
    const signatureStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.comment_mutate(');
    const signatureEnd = sql.indexOf(')', sql.indexOf('RETURNS', signatureStart));
    const signature = sql.slice(signatureStart, signatureEnd).toLowerCase();
    expect(signature).not.toContain('p_user_id');
    expect(sql).toContain("v_user_id uuid := auth.uid();");
    expect(sql).toContain("'userId', v_user_id::text,");
  });
});

// PATCH 8O.2a -- DeepSeek security review hardening. These are structural/
// source-level proofs only (see the file header on why: no local Supabase/
// db-test harness exists to run a live grant/revoke check against) -- they
// prove the DRAFT text has the intended privilege/hardening properties, not
// that a deployed database actually enforces them. Runtime enforcement can
// only be confirmed after the migration is reviewed and applied (see the
// migration's own "REQUIRED HUMAN REVIEW BEFORE APPLYING" checklist).
describe('structural proof -- 8O.2a hardening (EXECUTE privilege + search_path)', () => {
  const sqlPath = '.fable5/drafts/comment_mutate_rpc_20260812.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const signature = 'public.comment_mutate(uuid, text, uuid, text, text, text, boolean)';

  it('1: REVOKE EXECUTE ... FROM PUBLIC exists for the exact function signature', () => {
    expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC;`);
  });

  it('2: GRANT EXECUTE ... TO authenticated exists for the exact function signature', () => {
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`);
  });

  it('3: no GRANT EXECUTE to anon exists anywhere in the file', () => {
    expect(sql).not.toMatch(/GRANT\s+EXECUTE[\s\S]*?TO\s+anon\b/i);
  });

  it('4: SECURITY DEFINER remains on the function', () => {
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('5: search_path is hardened to the empty string, not merely set to public', () => {
    expect(sql).toContain("SET search_path = ''");
    expect(sql).not.toMatch(/SET search_path = 'public'/);
  });

  it('6: auth.uid() remains the sole identity source', () => {
    expect(sql).toContain('v_user_id uuid := auth.uid();');
  });

  it("7: the only metadata key ever written is detachedComments (jsonb_set targets '{detachedComments}' only)", () => {
    const jsonbSetCalls = sql.match(/jsonb_set\(/g) ?? [];
    expect(jsonbSetCalls.length).toBeGreaterThan(0);
    // Every jsonb_set call in the file must target the same single key path.
    const otherKeyTargets = sql.match(/jsonb_set\([^)]*'\{(?!detachedComments)[a-zA-Z]+\}'/g) ?? [];
    expect(otherKeyTargets).toEqual([]);
  });

  it('8: exactly the intended single padlet UPDATE remains (public.padlets, WHERE id = p_padlet_id)', () => {
    const updateStatements = sql.match(/UPDATE public\.padlets/g) ?? [];
    expect(updateStatements).toHaveLength(1);
    expect(sql).toContain('WHERE id = p_padlet_id;');
  });

  it('9: FOR UPDATE row-locking remains on the padlet read', () => {
    expect(sql).toContain('FOR UPDATE');
  });

  it('10: the four-operation whitelist remains unchanged', () => {
    expect(sql).toContain("IF p_operation NOT IN ('ADD_COMMENT', 'EDIT_OWN_COMMENT', 'STYLE_OWN_COMMENT', 'DELETE_OWN_COMMENT') THEN");
  });

  it('every non-built-in object reference is schema-qualified under the hardened search_path', () => {
    // With search_path = '', only pg_catalog is implicitly searched -- every
    // application table/function/type this function touches must be
    // schema-qualified, or it would fail to resolve at CREATE/EXECUTE time.
    expect(sql).toContain('FROM public.padlets');
    expect(sql).toContain('public.get_board_permission(');
    expect(sql).toContain('FROM public.boards');
    expect(sql).toContain('FROM public.board_collaborators');
    expect(sql).toContain('FROM public.profiles');
    expect(sql).toContain('v_permission public.board_permission_level;');
    expect(sql).toContain("'admin'::public.board_permission_level");
  });
});

// PATCH 8O.3 -- deployment guard. The COMMENT tier has no live permission
// producer (see COMMENT_UI_CONTRACT_V1.md's "Live status"), and the drafted
// comment_mutate RPC's permission-resolution logic is known-wrong for the
// live boards/padlets model (it targets the dead `canvases` vertical / a
// board_collaborators fallback that live workspace-authorized users
// routinely lack rows for) -- see the preserved file's own DORMANT banner.
// It must never live under supabase/migrations/, where migration tooling
// could apply it automatically. This test is the tripwire: it fails loudly
// if anyone (human or model) ever copies/reintroduces the file there without
// an intentional governance decision to reverse the quarantine.
describe('deployment guard -- comment_mutate must stay quarantined (PATCH 8O.3)', () => {
  it('does NOT exist under supabase/migrations/ (would be auto-deployable)', () => {
    expect(fs.existsSync('supabase/migrations/20260812_000000_add_comment_mutate_rpc.sql')).toBe(false);
  });

  it('the preserved dormant draft DOES exist at its quarantine location', () => {
    expect(fs.existsSync('.fable5/drafts/comment_mutate_rpc_20260812.sql')).toBe(true);
  });

  it('the quarantined draft is marked DORMANT / NOT DEPLOYABLE at its own top', () => {
    const sql = fs.readFileSync('.fable5/drafts/comment_mutate_rpc_20260812.sql', 'utf8');
    expect(sql.slice(0, 500)).toContain('DORMANT / NOT DEPLOYABLE');
  });

  it('no other file under supabase/migrations/ defines comment_mutate', () => {
    const migrationFiles = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
    for (const file of migrationFiles) {
      const content = fs.readFileSync(`supabase/migrations/${file}`, 'utf8');
      expect(content).not.toMatch(/CREATE (OR REPLACE )?FUNCTION\s+(public\.)?comment_mutate\(/i);
    }
  });
});
