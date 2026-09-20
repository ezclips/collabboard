/**
 * MEDIA_SOURCES_STAGE_1 -- the knowledge tables stop assuming every source is
 * a PDF.
 *
 * Against a real engine, like its siblings, because every claim here is a
 * claim about what PostgreSQL enforces. "A pageless chunk is refused before
 * and accepted after", "a page_start of 0 is still refused", "the rollback
 * will not delete a user's source to narrow a schema" -- none of those is a
 * source assertion, and none of them can be checked by reading a file.
 *
 * THE VERIFY FILE IS EXECUTED HERE, AGAINST AN APPLIED ROLLOUT, AND PROVED TO
 * GO RED. That is not ceremony. A verify file is only exercisable after an
 * apply, so a broken row is invisible to review -- this project has shipped a
 * row that could only ever be red, and a column REVOKE that was present in a
 * file and inert against the server. Executed plus discriminating is the only
 * combination that means anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const DB = 'knowledge_sources_beyond_pdf_scratch';
const SCRATCH = ADMIN.replace(/\/postgres$/, `/${DB}`);

const MIGRATION = 'supabase/migrations/20260920120000_knowledge_sources_beyond_pdf.sql';
const ROLLOUT = 'supabase/production-rollouts/20260920120000_knowledge_sources_beyond_pdf.sql';
const VERIFY = 'supabase/production-rollouts/20260920120000_knowledge_sources_beyond_pdf_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260920120000_knowledge_sources_beyond_pdf_rollback.sql';
const PRIOR_SEARCH = 'supabase/migrations/20260918180000_board_search_minimal_evidence_rank.sql';
const FOUNDATION = 'supabase/migrations/20260820_create_knowledge_data_foundation.sql';
const LOCATORS = 'supabase/migrations/20260824_add_knowledge_chunk_provenance.sql';

const BOARD = 'b7000000-0000-4000-8000-0000000000c1';
const DOC = 'd7000000-0000-4000-8000-0000000000c2';

const read = (file: string) =>
  fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

/**
 * The two tables EXACTLY as the 20260820 foundation declares them, lifted from
 * that file rather than retyped -- a hand-copied fixture that drifts from the
 * real prior state would make every before/after below a test of the fixture.
 * The foreign keys to boards and auth.users are dropped because neither table
 * exists here and neither participates in any constraint under test.
 */
function priorTables(): string {
  const sql = read(FOUNDATION);
  const start = sql.indexOf('CREATE TABLE IF NOT EXISTS public.knowledge_documents');
  const docsEnd = sql.indexOf('CREATE TABLE IF NOT EXISTS public.knowledge_pages');
  const chunkStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.knowledge_chunks');
  const chunkEnd = sql.indexOf('CREATE TABLE IF NOT EXISTS public.source_references');
  const docs = sql.slice(start, docsEnd);
  const chunks = sql.slice(chunkStart, chunkEnd);
  const tables = `${docs}\n${chunks}`
    .replace(/\s*REFERENCES public\.boards\(id\) ON DELETE CASCADE/g, '')
    .replace(/\s*REFERENCES auth\.users\(id\) ON DELETE SET NULL/g, '')
    .replace(/\s*REFERENCES public\.knowledge_documents\(id\) ON DELETE CASCADE/g, '');
  // source_locators arrived after the foundation, in 20260824, and the shared
  // search function selects it. Taken from that migration for the same reason
  // the tables are taken from theirs: a retyped column that drifted would make
  // the Decision 6 assertions a test of this fixture.
  return `${tables}\n${read(LOCATORS).slice(
    read(LOCATORS).indexOf('ALTER TABLE'),
    read(LOCATORS).indexOf(';', read(LOCATORS).indexOf('source_locators jsonb')) + 1,
  )}`;
}

/** The shared retrieval function, with its comment, as it ships today. */
function priorSearch(): string {
  const sql = read(PRIOR_SEARCH);
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks_text');
  const end = sql.indexOf('REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text');
  return sql.slice(start, end);
}

let admin: Client;
let db: Client;

/** What the engine said when the PRE-migration schema was asked for each. */
const before = { pagelessChunk: '', textKind: '', filelessDoc: '' };

async function refusal(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
    return '';
  } catch (error) {
    // The rollback file opens its own transaction and RAISEs inside it, which
    // leaves this connection in an aborted transaction that swallows every
    // later statement. Outside a transaction this is a harmless no-op warning.
    await db.query('ROLLBACK').catch(() => undefined);
    return (error as { message: string }).message;
  }
}

const insertDoc = (id: string, kind: string, nulls = false) => db.query(
  `INSERT INTO public.knowledge_documents
     (id, board_id, kind, original_filename, mime_type, file_size_bytes, storage_path,
      content_sha256, processing_status)
   VALUES ($1, $2, $3, 'notes.txt', ${nulls ? 'NULL, NULL, NULL' : `'text/plain', 12, 'p/${id}'`},
      'sha-1', 'ready')`,
  [id, BOARD, kind],
);

const insertChunk = (
  documentId: string, index: number, text: string,
  pageStart: number | null, pageEnd: number | null,
  charStart: number | null = null, charEnd: number | null = null,
) => db.query(
  `INSERT INTO public.knowledge_chunks
     (document_id, page_start, page_end, text, char_start, char_end, text_hash, chunk_index)
   VALUES ($1, $2, $3, $4, $5, $6, 'h', $7)`,
  [documentId, pageStart, pageEnd, text, charStart, charEnd, index],
);

async function runVerify() {
  const { rows } = await db.query(read(VERIFY));
  return rows as Array<{ ord: number; check_name: string; actual: string; pass: boolean; rollout_readiness: boolean }>;
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  db = new Client({ connectionString: SCRATCH });
  await db.connect();
  await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await db.query(priorTables());
  await db.query(priorSearch());

  // THE PRE-MIGRATION STATE, recorded before anything is applied. Without
  // these three, every "it works now" below could be true of the old schema
  // as well and the migration would be untested.
  await insertDoc(DOC, 'pdf');
  before.pagelessChunk = await refusal(
    `INSERT INTO public.knowledge_chunks
       (document_id, page_start, page_end, text, text_hash, chunk_index)
     VALUES ($1, NULL, NULL, 'x', 'h', 900)`, [DOC]);
  before.textKind = await refusal(
    `INSERT INTO public.knowledge_documents
       (board_id, kind, original_filename, mime_type, file_size_bytes, storage_path,
        content_sha256, processing_status)
     VALUES ($1, 'text', 'a.txt', 'text/plain', 1, 'p/a', 'sha', 'ready')`, [BOARD]);
  before.filelessDoc = await refusal(
    `INSERT INTO public.knowledge_documents
       (board_id, kind, original_filename, content_sha256, processing_status)
     VALUES ($1, 'pdf', 'a.pdf', 'sha', 'ready')`, [BOARD]);

  // The PRODUCTION ROLLOUT is what ships, so it is what is exercised.
  await db.query(read(ROLLOUT));

  // Captured BEFORE anything below ingests. Row 16 asserts the migration
  // admits no rows by itself, which is true at apply and false the moment a
  // test writes a pageless chunk -- so the only honest place to read it is
  // here, in the state the PM will apply into.
  atApply = (await db.query(read(VERIFY))).rows;
}, 180_000);

let atApply: Array<{ ord: number; check_name: string; actual: string; pass: boolean; rollout_readiness: boolean }> = [];

afterAll(async () => {
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin?.end();
});

describe('the rollout is the migration, byte for byte', () => {
  it('ships the same text it was reviewed as', () => {
    // Two files, one artifact. A rollout that drifted from its migration is a
    // schema nobody reviewed.
    expect(read(ROLLOUT)).toBe(read(MIGRATION));
  });
});

describe('what the migration changes', () => {
  it('a pageless chunk was REFUSED before, and is accepted now', async () => {
    expect(before.pagelessChunk).toMatch(/null value in column "page_start"|violates not-null/i);
    await expect(insertChunk(DOC, 1, 'a paragraph', null, null, 0, 11)).resolves.toBeTruthy();
    const { rows } = await db.query(
      'SELECT page_start, page_end FROM public.knowledge_chunks WHERE chunk_index = 1');
    expect(rows[0]).toEqual({ page_start: null, page_end: null });
  });

  it("a 'text' document was REFUSED before, and is accepted now", async () => {
    expect(before.textKind).toMatch(/knowledge_documents_kind_check/);
    await expect(insertDoc('d7000000-0000-4000-8000-0000000000c3', 'text')).resolves.toBeTruthy();
  });

  it('a document with no file columns was REFUSED before, and is accepted now', async () => {
    expect(before.filelessDoc).toMatch(/not-null|null value in column/i);
    await expect(insertDoc('d7000000-0000-4000-8000-0000000000c4', 'text', true)).resolves.toBeTruthy();
  });

  it('a paged chunk still stores its pages -- PDFs are unaffected', async () => {
    await insertChunk(DOC, 2, 'page three', 3, 3);
    const { rows } = await db.query(
      'SELECT page_start, page_end FROM public.knowledge_chunks WHERE chunk_index = 2');
    expect(rows[0]).toEqual({ page_start: 3, page_end: 3 });
  });
});

describe('what it still refuses -- the relaxation is narrow', () => {
  it('a page number below 1 is still refused', async () => {
    // page_end is 5 so that ONLY the start check can fire -- with 0,0 the
    // message named page_end_check and the assertion was reading whichever
    // constraint the engine happened to evaluate first.
    expect(await refusal(
      `INSERT INTO public.knowledge_chunks (document_id, page_start, page_end, text, text_hash, chunk_index)
       VALUES ($1, 0, 5, 'x', 'h', 10)`, [DOC])).toMatch(/page_start_check/);
  });

  it('a page range that runs backwards is still refused', async () => {
    expect(await refusal(
      `INSERT INTO public.knowledge_chunks (document_id, page_start, page_end, text, text_hash, chunk_index)
       VALUES ($1, 5, 2, 'x', 'h', 11)`, [DOC])).toMatch(/page_range_check/);
  });

  it('HALF a page range is refused -- both ends or neither', async () => {
    // A chunk with a start and no end is not a partial locator, it is a broken
    // one. Same shape the adjacent char_range check already enforced.
    expect(await refusal(
      `INSERT INTO public.knowledge_chunks (document_id, page_start, page_end, text, text_hash, chunk_index)
       VALUES ($1, 2, NULL, 'x', 'h', 12)`, [DOC])).toMatch(/page_pair_check/);
  });

  it('the char range check is untouched -- half a char range is still refused', async () => {
    expect(await refusal(
      `INSERT INTO public.knowledge_chunks
         (document_id, page_start, page_end, text, char_start, char_end, text_hash, chunk_index)
       VALUES ($1, NULL, NULL, 'x', 4, NULL, 'h', 13)`, [DOC])).toMatch(/char_range_check/);
  });

  it('a kind no stage has shipped is refused', async () => {
    // 'docx' and 'youtube' arrive with the code that can create them. A CHECK
    // that admits a kind nothing writes is a promise the schema cannot keep.
    for (const kind of ['docx', 'youtube', 'anything']) {
      expect(await refusal(
        `INSERT INTO public.knowledge_documents
           (board_id, kind, original_filename, content_sha256, processing_status)
         VALUES ($1, $2, 'a', 'sha', 'ready')`, [BOARD, kind])).toMatch(/kind_check/);
    }
  });

  it('original_filename stays NOT NULL -- it is the display name every citation reads', async () => {
    expect(await refusal(
      `INSERT INTO public.knowledge_documents
         (board_id, kind, content_sha256, processing_status)
       VALUES ($1, 'text', 'sha', 'ready')`, [BOARD])).toMatch(/original_filename/);
  });

  it('a chunk without text is still refused', async () => {
    expect(await refusal(
      `INSERT INTO public.knowledge_chunks (document_id, page_start, page_end, text_hash, chunk_index)
       VALUES ($1, NULL, NULL, 'h', 14)`, [DOC])).toMatch(/not-null|null value in column "text"/i);
  });
});

describe('retrieval is untouched, and already tolerates a pageless chunk', () => {
  it('the function still has its original signature and result type', async () => {
    const { rows } = await db.query(
      `SELECT pg_get_function_result(
                to_regprocedure('public.search_board_knowledge_chunks_text(uuid, text, integer)')) AS result`);
    expect(rows[0].result).toContain('source_locators jsonb');
    expect(rows[0].result).toContain('page_start integer');
    // Decision 6: locators live in jsonb, so no typed seconds column exists.
    // A typed column would have meant DROP and CREATE of the function both
    // consumers retrieve through, because CREATE OR REPLACE cannot change a
    // RETURNS TABLE.
    expect(rows[0].result).not.toContain('seconds');
  });

  it('a pageless chunk is returned by search, with a NULL page', async () => {
    // This is the engine-level half of the claim the passage builder already
    // makes in TypeScript: page_start is number | null and pageNumber is
    // spread only when it is present.
    const { rows } = await db.query(
      `SELECT page_start, page_end, text FROM public.search_board_knowledge_chunks_text($1::uuid, $2, 10)`,
      [BOARD, 'paragraph']);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].page_start).toBeNull();
    expect(rows[0].page_end).toBeNull();
    expect(rows[0].text).toContain('paragraph');
  });

  it('a paged chunk still comes back with its pages', async () => {
    const { rows } = await db.query(
      `SELECT page_start, page_end FROM public.search_board_knowledge_chunks_text($1::uuid, $2, 10)`,
      [BOARD, 'three']);
    expect(rows[0]).toMatchObject({ page_start: 3, page_end: 3 });
  });
});

describe('the verify file, executed against the applied rollout', () => {
  beforeAll(async () => {
    // The tests above deliberately ingest pageless chunks and text documents.
    // Row 16 is a point-in-time acceptance, not an invariant, so the widened
    // rows are cleared here and the discriminations below run against a clean
    // corpus. The rollback suite re-creates what it needs.
    await db.query('DELETE FROM public.knowledge_chunks WHERE page_start IS NULL');
    await db.query(`DELETE FROM public.knowledge_documents
                     WHERE kind <> 'pdf' OR storage_path IS NULL OR mime_type IS NULL OR file_size_bytes IS NULL`);
  });

  it('was green AT APPLY, before anything used the new width', () => {
    const failed = atApply.filter((row) => !row.pass);
    expect(failed.map((row) => `${row.ord}. ${row.check_name} -> ${row.actual}`)).toEqual([]);
    expect(atApply.every((row) => row.rollout_readiness)).toBe(true);
    expect(atApply.length).toBeGreaterThanOrEqual(16);
  });

  it('every row passes and readiness is true', async () => {
    const rows = await runVerify();
    const failed = rows.filter((row) => !row.pass);
    expect(failed.map((row) => `${row.ord}. ${row.check_name} -> ${row.actual}`)).toEqual([]);
    expect(rows.every((row) => row.rollout_readiness)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(16);
  });

  it('ROW 16 IS A REAL ASSERTION -- one pageless chunk turns it red', async () => {
    // The row that protects the PM's before/after battery comparison: if
    // anything wrote through an unreviewed path between the two runs, the two
    // measurements are of different corpora.
    await insertChunk(DOC, 800, 'transient', null, null, 0, 9);
    const red = await runVerify();
    expect(red.some((row) => row.ord === 16 && !row.pass)).toBe(true);
    await db.query('DELETE FROM public.knowledge_chunks WHERE chunk_index = 800');
    expect((await runVerify()).every((row) => row.rollout_readiness)).toBe(true);
  });

  it('readiness is the conjunction on EVERY row, not a separate roll-up', async () => {
    const rows = await runVerify();
    const distinct = new Set(rows.map((row) => row.rollout_readiness));
    expect(distinct.size).toBe(1);
  });

  it('IT CAN GO RED on a schema regression', async () => {
    // Row 8 is the both-or-neither guard. Drop it and readiness must fall.
    await db.query('ALTER TABLE public.knowledge_chunks DROP CONSTRAINT knowledge_chunks_page_pair_check');
    const red = await runVerify();
    expect(red.some((row) => row.ord === 8 && !row.pass)).toBe(true);
    expect(red.every((row) => row.rollout_readiness)).toBe(false);

    await db.query(`ALTER TABLE public.knowledge_chunks
      ADD CONSTRAINT knowledge_chunks_page_pair_check CHECK ((page_start IS NULL) = (page_end IS NULL))`);
    expect((await runVerify()).every((row) => row.rollout_readiness)).toBe(true);
  });

  it('IT CAN GO RED on the retrieval function being replaced', async () => {
    // The row that guards this unit's central claim. Change the function's
    // comment back and row 15 must fall -- which is the cheapest proof that
    // rows 13-15 are reading the server rather than asserting nothing.
    await db.query(`COMMENT ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
                    IS 'Full-text search the PDF chunks of one board.'`);
    const red = await runVerify();
    expect(red.some((row) => row.ord === 15 && !row.pass)).toBe(true);
    expect(red.every((row) => row.rollout_readiness)).toBe(false);

    await db.query(read(ROLLOUT));
    expect((await runVerify()).every((row) => row.rollout_readiness)).toBe(true);
  });

  it('the rollout is re-runnable -- applying it twice changes nothing', async () => {
    await db.query(read(ROLLOUT));
    expect((await runVerify()).every((row) => row.rollout_readiness)).toBe(true);
  });
});

describe('the rollback refuses to destroy data to narrow a schema', () => {
  beforeAll(async () => {
    // The state a real rollback would meet: a board that has used the width.
    await insertChunk(DOC, 900, 'an ingested paragraph', null, null, 0, 21);
    await insertDoc('d7000000-0000-4000-8000-0000000000c9', 'text', true);
  });

  it('REFUSES while pageless chunks and text documents exist, and says which', async () => {
    const message = await refusal(read(ROLLBACK));
    expect(message).toMatch(/Refusing to roll back/);
    expect(message).toMatch(/pageless chunk/);
    expect(message).toMatch(/non-pdf document/);
    // Nothing was deleted on the way to refusing.
    const { rows } = await db.query(
      `SELECT (SELECT count(*) FROM public.knowledge_chunks WHERE page_start IS NULL) AS chunks,
              (SELECT count(*) FROM public.knowledge_documents WHERE kind <> 'pdf') AS docs`);
    expect(Number(rows[0].chunks)).toBeGreaterThan(0);
    expect(Number(rows[0].docs)).toBeGreaterThan(0);
  });

  it('succeeds once the widened rows are gone, and restores the old schema', async () => {
    await db.query(`DELETE FROM public.knowledge_chunks WHERE page_start IS NULL`);
    await db.query(`DELETE FROM public.knowledge_documents
                     WHERE kind <> 'pdf' OR storage_path IS NULL OR mime_type IS NULL OR file_size_bytes IS NULL`);
    await db.query(read(ROLLBACK));

    const { rows } = await db.query(
      `SELECT a.attname, a.attnotnull
         FROM pg_attribute AS a
        WHERE a.attrelid = to_regclass('public.knowledge_chunks')
          AND a.attname IN ('page_start', 'page_end')`);
    expect(rows.every((row: { attnotnull: boolean }) => row.attnotnull)).toBe(true);

    const { rows: kind } = await db.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'knowledge_documents_kind_check'`);
    expect(kind[0].def).toContain("'pdf'");
    expect(kind[0].def).not.toContain("'text'");
  });

  it('and the verify then reports NOT ready -- the rollback is observable', async () => {
    const rows = await runVerify();
    expect(rows.every((row) => row.rollout_readiness)).toBe(false);
  });
});
