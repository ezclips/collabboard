import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * PDF-R6K-H2A -- RLS proved against a real Postgres, not asserted about.
 *
 * The schema test reads the policy text; this one exercises it. Every claim
 * about who may read, write or reach across a board is made by an actual
 * authenticated user's JWT hitting actual row-level security.
 *
 * LOCAL ONLY. The stack is the sanctioned disposable one on 127.0.0.1 and the
 * suite skips itself entirely when that is not reachable, so it can never run
 * against anything else. Every row it creates is synthetic and removed again.
 */

const LOCAL_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY
  // The published default key of a local `supabase start` stack. It is not a
  // secret and it is not usable anywhere but this machine's own container.
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function localStackReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(2500),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

const reachable = await localStackReachable();
const admin = createClient(LOCAL_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** A client that carries ONE user's JWT, so RLS sees that user. */
function asUser(accessToken: string): SupabaseClient {
  return createClient(LOCAL_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const stamp = Date.now();
const email = (name: string) => `h2a-${name}-${stamp}@example.test`;
const PASSWORD = 'h2a-synthetic-password-9134';

async function createUser(name: string): Promise<{ id: string; token: string }> {
  const created = await admin.auth.admin.createUser({
    email: email(name), password: PASSWORD, email_confirm: true,
  });
  if (created.error) throw new Error(`${name}: ${created.error.message}`);
  const signedIn = await createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: email(name), password: PASSWORD });
  if (signedIn.error) throw new Error(`${name} sign-in: ${signedIn.error.message}`);
  return { id: created.data.user!.id, token: signedIn.data.session!.access_token };
}

interface World {
  owner: { id: string; token: string };
  editor: { id: string; token: string };
  viewer: { id: string; token: string };
  commenter: { id: string; token: string };
  outsider: { id: string; token: string };
  boardId: string;
  otherBoardId: string;
  documentId: string;
  otherDocumentId: string;
  noteId: string;
  referenceId: string;
}

let world: World;
const PAGE_TEXT = 'Alpha beta gamma delta epsilon.';

beforeAll(async () => {
  if (!reachable) return;

  const [owner, editor, viewer, commenter, outsider] = await Promise.all(
    ['owner', 'editor', 'viewer', 'commenter', 'outsider'].map(createUser),
  );

  const boards = await admin.from('boards').insert([
    { title: 'H2A board', user_id: owner.id },
    { title: 'H2A other board', user_id: outsider.id },
  ]).select('id');
  if (boards.error) throw new Error(boards.error.message);
  const [boardId, otherBoardId] = boards.data!.map((row) => row.id as string);

  const collaborators = await admin.from('board_collaborators').insert([
    { board_id: boardId, user_id: editor.id, role: 'editor' },
    { board_id: boardId, user_id: viewer.id, role: 'viewer' },
    { board_id: boardId, user_id: commenter.id, role: 'commenter' },
  ]);
  if (collaborators.error) throw new Error(collaborators.error.message);

  const documents = await admin.from('knowledge_documents').insert([
    {
      board_id: boardId, created_by: owner.id, original_filename: 'synthetic.pdf',
      file_size_bytes: 1, storage_path: `h2a/${stamp}/a.pdf`, content_sha256: 'a'.repeat(64),
      processing_status: 'ready', page_count: 1,
    },
    {
      board_id: otherBoardId, created_by: outsider.id, original_filename: 'other.pdf',
      file_size_bytes: 1, storage_path: `h2a/${stamp}/b.pdf`, content_sha256: 'b'.repeat(64),
      processing_status: 'ready', page_count: 1,
    },
  ]).select('id');
  if (documents.error) throw new Error(documents.error.message);
  const [documentId, otherDocumentId] = documents.data!.map((row) => row.id as string);

  const pages = await admin.from('knowledge_pages')
    .insert({ document_id: documentId, page_number: 1, text: PAGE_TEXT });
  if (pages.error) throw new Error(pages.error.message);

  const note = await admin.from('padlets')
    .insert({ board_id: boardId, type: 'text', content: 'Synthetic Note' })
    .select('id').single();
  if (note.error) throw new Error(note.error.message);

  const reference = await admin.from('source_references').insert({
    target_padlet_id: note.data!.id, source_document_id: documentId,
    page_start: 1, page_end: 1, quote_text: 'beta', char_start: 6, char_end: 10,
  }).select('id').single();
  if (reference.error) throw new Error(reference.error.message);

  world = {
    owner, editor, viewer, commenter, outsider,
    boardId, otherBoardId, documentId, otherDocumentId,
    noteId: note.data!.id as string, referenceId: reference.data!.id as string,
  };
});

afterAll(async () => {
  if (!reachable || !world) return;
  // Synthetic only, and removed. Boards cascade to padlets, documents,
  // citations and highlights.
  await admin.from('boards').delete().in('id', [world.boardId, world.otherBoardId]);
  for (const user of [world.owner, world.editor, world.viewer, world.commenter, world.outsider]) {
    await admin.auth.admin.deleteUser(user.id);
  }
});

const highlightRow = (over: Record<string, unknown> = {}) => ({
  source_document_id: world.documentId,
  page_number: 1,
  char_start: 6,
  char_end: 10,
  quote_text: 'beta',
  color: '#fde68a',
  ...over,
});

describe.skipIf(!reachable)('PDF-R6K-H2A RLS against local Postgres', () => {
  it('J. an editor may insert, recolour and delete', async () => {
    const client = asUser(world.editor.token);
    const inserted = await client.from('knowledge_source_highlights')
      .insert(highlightRow({ created_by: world.editor.id })).select('id, color').single();
    expect(inserted.error).toBeNull();

    const updated = await client.from('knowledge_source_highlights')
      .update({ color: '#bbf7d0' }).eq('id', inserted.data!.id).select('color').single();
    expect(updated.error).toBeNull();
    expect(updated.data!.color).toBe('#bbf7d0');

    const removed = await client.from('knowledge_source_highlights')
      .delete().eq('id', inserted.data!.id).select('id');
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);
  });

  it('J2. the board owner may do the same', async () => {
    const client = asUser(world.owner.token);
    const inserted = await client.from('knowledge_source_highlights')
      .insert(highlightRow()).select('id').single();
    expect(inserted.error).toBeNull();
    const removed = await client.from('knowledge_source_highlights')
      .delete().eq('id', inserted.data!.id).select('id');
    expect(removed.data).toHaveLength(1);
  });

  it('I. a viewer may read but may not insert, recolour or delete', async () => {
    const seeded = await admin.from('knowledge_source_highlights')
      .insert(highlightRow()).select('id').single();
    expect(seeded.error).toBeNull();

    const client = asUser(world.viewer.token);

    const read = await client.from('knowledge_source_highlights')
      .select('id').eq('id', seeded.data!.id);
    expect(read.error).toBeNull();
    expect(read.data, 'a viewer sees shared annotations').toHaveLength(1);

    const insert = await client.from('knowledge_source_highlights').insert(highlightRow());
    expect(insert.error, 'a viewer must not create shared annotations').not.toBeNull();

    // RLS makes an unauthorized UPDATE/DELETE match no rows rather than raise,
    // so the assertion is that nothing changed -- not that an error appeared.
    await client.from('knowledge_source_highlights')
      .update({ color: '#000000' }).eq('id', seeded.data!.id);
    await client.from('knowledge_source_highlights').delete().eq('id', seeded.data!.id);

    const after = await admin.from('knowledge_source_highlights')
      .select('id, color').eq('id', seeded.data!.id).maybeSingle();
    expect(after.data, 'the row survives a viewer delete').not.toBeNull();
    expect(after.data!.color, 'and keeps its colour').toBe('#fde68a');

    await admin.from('knowledge_source_highlights').delete().eq('id', seeded.data!.id);
  });

  it('I2. a commenter is not an editor either', async () => {
    // `manager` and `readonly` cannot occur: board_collaborators.role is
    // CHECK-constrained to editor|viewer|commenter, so `commenter` is the only
    // other non-editor role that exists to be excluded.
    const insert = await asUser(world.commenter.token)
      .from('knowledge_source_highlights').insert(highlightRow());
    expect(insert.error).not.toBeNull();
  });

  it('K. a stranger can neither read nor write this board document', async () => {
    const seeded = await admin.from('knowledge_source_highlights')
      .insert(highlightRow()).select('id').single();
    const client = asUser(world.outsider.token);

    const read = await client.from('knowledge_source_highlights')
      .select('id').eq('id', seeded.data!.id);
    expect(read.data, 'no cross-board read').toHaveLength(0);

    const insert = await client.from('knowledge_source_highlights').insert(highlightRow());
    expect(insert.error, 'no cross-board write').not.toBeNull();

    await admin.from('knowledge_source_highlights').delete().eq('id', seeded.data!.id);
  });

  it('K2. an editor of THIS board cannot annotate another board document', async () => {
    // WITH CHECK is what refuses this: the caller may write board A, but the
    // row they are leaving behind names a document on board B.
    const insert = await asUser(world.editor.token)
      .from('knowledge_source_highlights')
      .insert(highlightRow({ source_document_id: world.otherDocumentId }));
    expect(insert.error).not.toBeNull();
  });

  it('G. deleting a highlight leaves the citation and the Note standing', async () => {
    const seeded = await admin.from('knowledge_source_highlights')
      .insert(highlightRow({ source_reference_id: world.referenceId })).select('id').single();
    expect(seeded.error).toBeNull();

    const removed = await asUser(world.editor.token)
      .from('knowledge_source_highlights').delete().eq('id', seeded.data!.id).select('id');
    expect(removed.data).toHaveLength(1);

    const citation = await admin.from('source_references')
      .select('id').eq('id', world.referenceId).maybeSingle();
    expect(citation.data, 'the citation survives -- Used in Notes is untouched').not.toBeNull();
    const note = await admin.from('padlets').select('id').eq('id', world.noteId).maybeSingle();
    expect(note.data, 'and so does the Note').not.toBeNull();
  });

  it('H. deleting the Note orphans the highlight but never destroys it', async () => {
    // A second Note and citation, so the shared fixture survives for other tests.
    const note = await admin.from('padlets')
      .insert({ board_id: world.boardId, type: 'text', content: 'Doomed Note' })
      .select('id').single();
    const reference = await admin.from('source_references').insert({
      target_padlet_id: note.data!.id, source_document_id: world.documentId,
      page_start: 1, page_end: 1, quote_text: 'gamma', char_start: 11, char_end: 16,
    }).select('id').single();
    const highlight = await admin.from('knowledge_source_highlights')
      .insert(highlightRow({
        char_start: 11, char_end: 16, quote_text: 'gamma',
        source_reference_id: reference.data!.id,
      })).select('id').single();
    expect(highlight.error).toBeNull();

    // Deleting the Note cascades to its citation -- the coupling this whole
    // slice exists to break.
    await admin.from('padlets').delete().eq('id', note.data!.id);
    const citationGone = await admin.from('source_references')
      .select('id').eq('id', reference.data!.id).maybeSingle();
    expect(citationGone.data, 'the citation cascaded away with the Note').toBeNull();

    const survivor = await admin.from('knowledge_source_highlights')
      .select('id, source_reference_id, quote_text').eq('id', highlight.data!.id).maybeSingle();
    expect(survivor.data, 'the annotation survives').not.toBeNull();
    expect(survivor.data!.source_reference_id, 'orphaned, by ON DELETE SET NULL').toBeNull();
    expect(survivor.data!.quote_text).toBe('gamma');

    await admin.from('knowledge_source_highlights').delete().eq('id', highlight.data!.id);
  });

  it('F. one highlight per citation: a rerun conflicts instead of duplicating', async () => {
    const first = await admin.from('knowledge_source_highlights')
      .insert(highlightRow({ source_reference_id: world.referenceId })).select('id').single();
    expect(first.error).toBeNull();

    const second = await admin.from('knowledge_source_highlights')
      .insert(highlightRow({ source_reference_id: world.referenceId }));
    expect(second.error, 'the unique partial origin index refuses the duplicate').not.toBeNull();
    expect(second.error!.message).toMatch(/duplicate key|unique/i);

    // Plain standalone highlights (NULL origin) are NOT constrained, so several
    // may exist over the same passage.
    const a = await admin.from('knowledge_source_highlights').insert(highlightRow()).select('id').single();
    const b = await admin.from('knowledge_source_highlights').insert(highlightRow()).select('id').single();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();

    await admin.from('knowledge_source_highlights').delete()
      .in('id', [first.data!.id, a.data!.id, b.data!.id]);
  });

  it('column constraints refuse a malformed span or colour', async () => {
    const bad = [
      highlightRow({ char_start: 10, char_end: 10 }),
      highlightRow({ char_start: -1 }),
      highlightRow({ page_number: 0 }),
      highlightRow({ quote_text: '' }),
      highlightRow({ color: 'red' }),
    ];
    for (const row of bad) {
      const insert = await admin.from('knowledge_source_highlights').insert(row);
      expect(insert.error, JSON.stringify(row)).not.toBeNull();
    }
  });
});

describe.skipIf(reachable)('PDF-R6K-H2A RLS (skipped)', () => {
  it('reports that the local stack was not reachable', () => {
    // Visible rather than silent: a green run must never be mistaken for RLS
    // having been proved when nothing actually executed.
    expect(reachable).toBe(false);
  });
});
