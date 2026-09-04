import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * PDF-R6K-H2A-C1 -- the three security-review blockers, proved closed by
 * execution against a real Postgres.
 *
 * These are DIRECT table calls, deliberately bypassing the typed repository,
 * because the finding was precisely that the repository is not a boundary. If
 * these ever pass through, the grant or trigger has regressed.
 *
 * LOCAL ONLY. Skips itself when 127.0.0.1 is not reachable; all fixtures are
 * synthetic and removed again.
 */

const LOCAL_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function reachableStack(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY }, signal: AbortSignal.timeout(2500),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

const reachable = await reachableStack();
const admin = createClient(LOCAL_URL, SERVICE_KEY, { auth: { persistSession: false } });
const asUser = (token: string): SupabaseClient => createClient(LOCAL_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});

const stamp = Date.now();
const PASSWORD = 'c1-synthetic-password-9134';
async function createUser(name: string): Promise<{ id: string; token: string }> {
  const email = `c1i-${name}-${stamp}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw new Error(`${name}: ${created.error.message}`);
  const signedIn = await createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error(`${name}: ${signedIn.error.message}`);
  return { id: created.data.user!.id, token: signedIn.data.session!.access_token };
}

const T = 'knowledge_source_highlights';

interface World {
  owner: { id: string; token: string };
  editor: { id: string; token: string };
  viewer: { id: string; token: string };
  commenter: { id: string; token: string };
  boardA: string; boardB: string;
  docA: string; docB: string;
  refA: string; refB: string;
  noteA: string;
}
let world: World;

beforeAll(async () => {
  if (!reachable) return;
  const [owner, editor, viewer, commenter] = await Promise.all(
    ['owner', 'editor', 'viewer', 'commenter'].map(createUser),
  );

  const boards = await admin.from('boards').insert([
    { title: `c1i A ${stamp}`, user_id: owner.id },
    { title: `c1i B ${stamp}`, user_id: owner.id },
  ]).select('id');
  if (boards.error) throw new Error(boards.error.message);
  const [boardA, boardB] = boards.data!.map((r) => r.id as string);

  // The editor legitimately edits BOTH boards. That is what makes the
  // cross-document origin case a test of DOCUMENT consistency rather than of
  // board isolation -- RLS alone cannot refuse it.
  const collab = await admin.from('board_collaborators').insert([
    { board_id: boardA, user_id: editor.id, role: 'editor' },
    { board_id: boardB, user_id: editor.id, role: 'editor' },
    { board_id: boardA, user_id: viewer.id, role: 'viewer' },
    { board_id: boardA, user_id: commenter.id, role: 'commenter' },
  ]);
  if (collab.error) throw new Error(collab.error.message);

  const docs = await admin.from('knowledge_documents').insert([
    { board_id: boardA, original_filename: 'a.pdf', file_size_bytes: 1, storage_path: `c1i/${stamp}/a`, content_sha256: 'a'.repeat(64), processing_status: 'ready', page_count: 1 },
    { board_id: boardB, original_filename: 'b.pdf', file_size_bytes: 1, storage_path: `c1i/${stamp}/b`, content_sha256: 'b'.repeat(64), processing_status: 'ready', page_count: 1 },
  ]).select('id');
  if (docs.error) throw new Error(docs.error.message);
  const [docA, docB] = docs.data!.map((r) => r.id as string);

  const noteA = await admin.from('padlets').insert({ board_id: boardA, type: 'text', content: 'N' }).select('id').single();
  const noteB = await admin.from('padlets').insert({ board_id: boardB, type: 'text', content: 'N' }).select('id').single();
  const refA = await admin.from('source_references').insert({ target_padlet_id: noteA.data!.id, source_document_id: docA, page_start: 1, page_end: 1, quote_text: 'beta', char_start: 6, char_end: 10 }).select('id').single();
  const refB = await admin.from('source_references').insert({ target_padlet_id: noteB.data!.id, source_document_id: docB, page_start: 1, page_end: 1, quote_text: 'beta', char_start: 6, char_end: 10 }).select('id').single();

  world = {
    owner, editor, viewer, commenter, boardA, boardB, docA, docB,
    refA: refA.data!.id as string, refB: refB.data!.id as string,
    noteA: noteA.data!.id as string,
  };
});

afterAll(async () => {
  if (!reachable || !world) return;
  await admin.from('boards').delete().in('id', [world.boardA, world.boardB]);
  for (const u of [world.owner, world.editor, world.viewer, world.commenter]) {
    await admin.auth.admin.deleteUser(u.id);
  }
});

const draft = (over: Record<string, unknown> = {}) => ({
  source_document_id: world.docA, page_number: 1, char_start: 6, char_end: 10,
  quote_text: 'beta', color: '#fde68a', ...over,
});

describe.skipIf(!reachable)('PDF-R6K-H2A-C1 column authority', () => {
  it('C1. an editor may still recolour through the intended path', async () => {
    const made = await asUser(world.editor.token).from(T).insert(draft()).select('id').single();
    expect(made.error).toBeNull();
    const recoloured = await asUser(world.editor.token)
      .from(T).update({ color: '#bbf7d0' }).eq('id', made.data!.id).select('color').single();
    expect(recoloured.error).toBeNull();
    expect(recoloured.data!.color).toBe('#bbf7d0');
  });

  it('C2-C9. every other column refuses a direct UPDATE', async () => {
    const seeded = await admin.from(T).insert(draft({ created_by: null })).select('*').single();
    const id = seeded.data!.id;
    const attempts: Array<[string, unknown]> = [
      ['char_start', 0],
      ['char_end', 99],
      ['page_number', 42],
      ['quote_text', 'REWRITTEN'],
      ['quote_hash', 'forged'],
      ['created_by', world.viewer.id],
      ['source_reference_id', world.refB],
      ['source_document_id', world.docB],
    ];
    for (const [column, value] of attempts) {
      const attempt = await asUser(world.editor.token)
        .from(T).update({ [column]: value }).eq('id', id);
      expect(attempt.error, `${column} must be refused`).not.toBeNull();
      const after = await admin.from(T).select('*').eq('id', id).single();
      expect(after.data![column], `${column} must be unchanged`).toEqual(seeded.data![column]);
    }
  });
});

describe.skipIf(!reachable)('PDF-R6K-H2A-C1 truthful authorship', () => {
  it('I1. omitting created_by fills in the caller identity', async () => {
    const made = await asUser(world.editor.token).from(T).insert(draft())
      .select('created_by').single();
    expect(made.error).toBeNull();
    expect(made.data!.created_by).toBe(world.editor.id);
  });

  it('I2-I3. naming created_by at all is refused, forged uuid or explicit NULL', async () => {
    // Both fail the same way: the caller has no INSERT privilege on the column,
    // so mentioning it is the error -- there is no value that succeeds.
    const forged = await asUser(world.editor.token).from(T).insert(draft({ created_by: world.viewer.id }));
    expect(forged.error).not.toBeNull();
    const nulled = await asUser(world.editor.token).from(T).insert(draft({ created_by: null }));
    expect(nulled.error).not.toBeNull();
  });

  it('B1. service authority may still write NULL, so legacy backfill stays honest', async () => {
    // source_references records no citation author, and inventing one would be
    // a fabrication -- NULL has to remain writable for migrated rows.
    const legacy = await admin.from(T).insert(draft({ created_by: null }))
      .select('created_by').single();
    expect(legacy.error).toBeNull();
    expect(legacy.data!.created_by).toBeNull();
  });

  it('I4-I5. viewer and commenter still cannot create at all', async () => {
    expect((await asUser(world.viewer.token).from(T).insert(draft())).error).not.toBeNull();
    expect((await asUser(world.commenter.token).from(T).insert(draft())).error).not.toBeNull();
  });
});

describe.skipIf(!reachable)('PDF-R6K-H2A-C1 origin integrity', () => {
  it('O1. a citation of the SAME document is accepted', async () => {
    const made = await asUser(world.editor.token)
      .from(T).insert(draft({ source_reference_id: world.refA })).select('id').single();
    expect(made.error).toBeNull();
    await admin.from(T).delete().eq('id', made.data!.id);
  });

  it('O2. a citation of ANOTHER document is refused, even when the caller edits both boards', async () => {
    // The decisive case. RLS cannot refuse this -- the caller may write both
    // boards -- so only a database integrity rule can.
    const attempt = await asUser(world.editor.token)
      .from(T).insert(draft({ source_reference_id: world.refB }));
    expect(attempt.error).not.toBeNull();
    expect(attempt.error!.message).toMatch(/does not belong to this source document/);
  });

  it('O3. a citation that does not exist is refused, and says no more than that', async () => {
    const attempt = await asUser(world.editor.token)
      .from(T).insert(draft({ source_reference_id: '00000000-0000-4000-8000-000000000000' }));
    expect(attempt.error).not.toBeNull();
    // Same message as O2: a caller must not be able to tell "wrong document"
    // from "no such citation" and probe for ids.
    expect(attempt.error!.message).toMatch(/does not belong to this source document/);
  });

  it('O4. the integrity rule does not block ON DELETE SET NULL', async () => {
    const highlight = await admin.from(T).insert(draft({
      created_by: null, source_reference_id: world.refA,
    })).select('id').single();
    expect(highlight.error).toBeNull();

    // Deleting the Note cascades to its citation, which nulls the origin. A
    // trigger that checked NULLs would turn that into a failure and make the
    // Note undeletable -- the opposite of the independence being protected.
    await admin.from('padlets').delete().eq('id', world.noteA);

    const survivor = await admin.from(T).select('id, source_reference_id')
      .eq('id', highlight.data!.id).maybeSingle();
    expect(survivor.data, 'the annotation survives').not.toBeNull();
    expect(survivor.data!.source_reference_id).toBeNull();
  });

  it('O5. the unique origin index still refuses a duplicate', async () => {
    const first = await admin.from(T).insert(draft({
      created_by: null, source_document_id: world.docB, source_reference_id: world.refB,
    })).select('id').single();
    expect(first.error).toBeNull();
    const second = await admin.from(T).insert(draft({
      created_by: null, source_document_id: world.docB, source_reference_id: world.refB,
    }));
    expect(second.error).not.toBeNull();
    expect(second.error!.message).toMatch(/duplicate key|unique/i);
    await admin.from(T).delete().eq('id', first.data!.id);
  });
});

describe.skipIf(reachable)('PDF-R6K-H2A-C1 hardening (skipped)', () => {
  it('reports that the local stack was not reachable', () => {
    // Visible rather than silent: a green run must never be mistaken for these
    // boundaries having been proved when nothing executed.
    expect(reachable).toBe(false);
  });
});
