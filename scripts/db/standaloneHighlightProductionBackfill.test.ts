/**
 * PDF-R6K-H3B -- the controlled production backfill. Connection guards are pure
 * and tested directly; everything else runs against a DISPOSABLE LOCAL scratch
 * database reached through the internal executor seam, never the production CLI,
 * which rejects local hosts and has no override. Every name, quote and page here
 * is synthetic; no real PDF, Storage object or remote database is touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ATOMIC_WRITER_TOKEN, BACKFILL_URL_ENV, DENY_NAMES_ENV,
  advisoryLockKeys, computePlanHash, createBackfillClient, formatSummary,
  parseDenyList, parseMode, resolveBackfillTarget, runStandaloneHighlightBackfill,
} from './standaloneHighlightProductionBackfill';
import type { BackfillMode, BackfillSession } from './standaloneHighlightProductionBackfill';

const ROOT = process.cwd();
const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const SCRATCH_DB = 'h3b_backfill_scratch';
const SCRATCH = ADMIN.replace(/\/postgres$/, `/${SCRATCH_DB}`);
const DENY = ['synthetic-protected.pdf'];

const DOC = 'cccccccc-0000-0000-0000-000000000001';
const DENIED_DOC = 'cccccccc-0000-0000-0000-000000000002';
const BOARD = 'aaaaaaaa-0000-0000-0000-000000000001';
const NOTE = 'bbbbbbbb-0000-0000-0000-000000000001';
const ACCENT = '#fde68a';
const PAGE_TEXT = 'Alpha beta gamma delta epsilon zeta.';

/** The Knowledge architecture the H3A rollout hangs off, synthetic and minimal. */
const PREREQUISITES = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.boards (id uuid PRIMARY KEY, title text NOT NULL, user_id uuid);
CREATE TABLE public.board_collaborators (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.padlets (id uuid PRIMARY KEY,
  board_id uuid REFERENCES public.boards(id) ON DELETE CASCADE,
  type varchar DEFAULT 'text', content text, metadata jsonb);
CREATE TABLE public.knowledge_documents (id uuid PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  original_filename text NOT NULL, file_size_bytes bigint NOT NULL DEFAULT 1,
  storage_path text NOT NULL DEFAULT 'x', content_sha256 text NOT NULL DEFAULT 'x',
  page_count integer, processing_status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.knowledge_pages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL, text text NOT NULL DEFAULT '',
  UNIQUE (document_id, page_number));
CREATE TABLE public.source_references (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_padlet_id uuid NOT NULL REFERENCES public.padlets(id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  page_start integer NOT NULL, page_end integer NOT NULL,
  quote_text text, quote_hash text, char_start integer, char_end integer, locator jsonb,
  region_x double precision, region_y double precision,
  region_width double precision, region_height double precision,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION public.is_board_member(board_uuid uuid, user_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM board_collaborators
                     WHERE board_id = board_uuid AND user_id = user_uuid) $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;`;

const SEED = `
INSERT INTO public.boards VALUES ('${BOARD}', 'Board A', NULL);
INSERT INTO public.padlets (id, board_id, metadata)
  VALUES ('${NOTE}', '${BOARD}', '{"topStrip":"${ACCENT}"}'::jsonb);
INSERT INTO public.knowledge_documents (id, board_id, original_filename)
  VALUES ('${DOC}', '${BOARD}', 'synthetic-open.pdf'),
         ('${DENIED_DOC}', '${BOARD}', '${DENY[0]}');
INSERT INTO public.knowledge_pages (document_id, page_number, text)
  VALUES ('${DOC}', 1, '${PAGE_TEXT}'), ('${DOC}', 2, 'Second synthetic page.'),
         ('${DENIED_DOC}', 1, 'Protected synthetic page.');`;

/** Records every statement, so "was page text read?" is an observation, not a claim. */
class RecordingSession implements BackfillSession {
  readonly sql: string[] = [];
  readonly pids: number[] = [];
  constructor(private readonly client: Client) {}
  async query(sql: string, values?: readonly unknown[]) {
    this.sql.push(sql);
    if (/^\s*(BEGIN|COMMIT)/i.test(sql) || /^\s*INSERT INTO/i.test(sql)) {
      // Never break the run being observed: inside an aborted transaction an
      // extra SELECT fails, which would swallow the executor's own ROLLBACK.
      try {
        const pid = await this.client.query('SELECT pg_backend_pid() AS pid');
        this.pids.push(Number(pid.rows[0].pid));
      } catch { /* unprobeable; the real error must survive */ }
    }
    const result = await this.client.query(sql, values as unknown[] | undefined);
    return { rows: result.rows as Record<string, unknown>[] };
  }
  /** A DATA read, not a mention: the capability probe names these tables too. */
  readsFrom(table: string) { return this.sql.some((s) => s.includes(`FROM public.${table}`)); }
}

let admin: Client; let client: Client;

async function run(session: BackfillSession, mode: BackfillMode, extra: {
  expectedPlanHash?: string; atomicWriterToken?: string; deny?: readonly string[];
} = {}) {
  return runStandaloneHighlightBackfill(session, {
    mode,
    denyDocumentNames: extra.deny ?? DENY,
    expectedPlanHash: extra.expectedPlanHash,
    atomicWriterToken: extra.atomicWriterToken,
  });
}

const exec = (sql: string) => client.query(sql);
const highlightCount = async () => (await exec(
  'SELECT count(*) FROM public.knowledge_source_highlights')).rows[0].count;

/** One paintable citation: offsets that slice exactly "beta gamma" out of page 1. */
async function seedPaintable(id: string, start = 6, end = 16, hash: string | null = null) {
  await exec(`INSERT INTO public.source_references
    (id, target_padlet_id, source_document_id, page_start, page_end, quote_text, quote_hash,
     char_start, char_end)
    VALUES ('${id}', '${NOTE}', '${DOC}', 1, 1,
            '${PAGE_TEXT.slice(start, end)}', ${hash === null ? 'NULL' : `'${hash}'`},
            ${start}, ${end})`);
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${SCRATCH_DB}`);
  client = new Client({ connectionString: SCRATCH });
  await client.connect();
  await exec(PREREQUISITES);
  await exec(fs.readFileSync(
    path.join(ROOT, 'supabase/production-rollouts/20260904_standalone_pdf_highlights.sql'), 'utf8',
  ));
  await exec(SEED);
}, 120_000);

afterAll(async () => {
  await client?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await admin?.end();
});

beforeEach(async () => {
  await exec('DELETE FROM public.knowledge_source_highlights;'
    + 'DELETE FROM public.source_references');
});

describe('H3B connection guards (pure, no database)', () => {
  const target = (v: string) => ({ [BACKFILL_URL_ENV]: v } as unknown as NodeJS.ProcessEnv);
  it('1-2. requires the dedicated variable and ignores every fallback', () => {
    expect(() => resolveBackfillTarget({} as NodeJS.ProcessEnv)).toThrow(/is required/);
    for (const fallback of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL']) {
      expect(() => resolveBackfillTarget(
        { [fallback]: 'postgres://u:p@prod.example.com:5432/db?sslmode=require' } as NodeJS.ProcessEnv,
      ), fallback).toThrow(/is required/);
    }
  });
  it('3-5. refuses local targets', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'host.docker.internal',
      'supabase_db_collabboard', 'db.local']) {
      expect(() => resolveBackfillTarget(target(`postgres://u:p@${host}:5432/db?sslmode=require`)),
        host).toThrow(/local or test target/);
    }
  });
  it('6. refuses Supavisor transaction mode, which cannot hold one backend session', () => {
    expect(() => resolveBackfillTarget(
      target('postgres://u:p@x.pooler.supabase.com:6543/db?sslmode=require'),
    )).toThrow(/TRANSACTION mode/);
    expect(() => resolveBackfillTarget(
      target('postgres://u:p@x.pooler.supabase.com:7000/db?sslmode=require'),
    )).toThrow(/SESSION-mode port/);
    expect(resolveBackfillTarget(
      target('postgres://u:p@x.pooler.supabase.com:5432/db?sslmode=require'),
    ).host).toBe('x.pooler.supabase.com');
  });
  it('7. refuses connections that are not demonstrably encrypted', () => {
    for (const mode of ['disable', 'allow', 'prefer']) {
      expect(() => resolveBackfillTarget(
        target(`postgres://u:p@prod.example.com:5432/db?sslmode=${mode}`)), mode).toThrow(/sslmode/);
    }
    expect(() => resolveBackfillTarget(target('https://prod.example.com/db'))).toThrow(/postgres:/);
  });
  it('8. has no override flag, and never returns or logs the connection string', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'scripts/db/standaloneHighlightProductionBackfill.ts'), 'utf8');
    for (const escape of ['--allow-local', '--force', '--unsafe', '--skip-target-check',
      '--prod', 'allowLocal', 'skipTargetCheck']) {
      expect(source, escape).not.toContain(escape);
    }
    // A Pool can hand successive statements to different backends.
    expect(source).not.toMatch(/\bnew Pool\(|from 'pg-pool'|Pool[,}]/);
    expect(source).toMatch(/import \{ Client \} from 'pg'/);
    const resolved = resolveBackfillTarget(
      target('postgres://user:secret@db.abc.supabase.co:5432/postgres?sslmode=require'));
    expect(resolved.host).toBe('db.abc.supabase.co');
    const summary = formatSummary({
      mode: 'plan', schemaReady: true, adminRoleReady: true, totalReferences: 0, paintable: 0,
      exactExisting: 0, toCreate: 0, mismatches: 0, skippedPageOnly: 0, skippedRegion: 0,
      skippedCrossPage: 0, skippedUnresolved: 0, skippedNoPageText: 0, protectedBlocked: 0,
      documentsConsidered: 0, pagesConsidered: 0, planHash: 'h', inserted: 0, committed: false,
      mutated: false, rendererBackfillReady: false, noWork: false,
    });
    expect(summary).not.toContain('secret');
  });

  it('defaults to PLAN, parses the denylist, and builds a Client', () => {
    expect([parseMode([]), parseMode(['verify'])]).toEqual(['plan', 'verify']);
    expect(() => parseMode(['delete'])).toThrow();
    expect(parseDenyList({ [DENY_NAMES_ENV]: 'a.pdf, b.pdf\nc.pdf' } as unknown as
      NodeJS.ProcessEnv)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(createBackfillClient(resolveBackfillTarget(
      target('postgres://u:p@prod.example.com:5432/db?sslmode=require')))).toBeInstanceOf(Client);
  });
});

describe('H3B administrative capability gate', () => {
  it('9. refuses the application data-API roles', async () => {
    for (const role of ['authenticated', 'anon']) {
      await exec(`SET ROLE ${role}`);
      try {
        await expect(run(new RecordingSession(client), 'plan')).rejects
          .toThrow(/ADMIN_ROLE_READY=NO/);
      } finally { await exec('RESET ROLE'); }
    }
  });

  it('10. refuses a role without the trusted maintenance capability', async () => {
    await exec(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'h3b_weak') THEN
        CREATE ROLE h3b_weak NOLOGIN;
      END IF; END $$`);
    await exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO h3b_weak');
    await exec('GRANT INSERT ON public.knowledge_source_highlights TO h3b_weak');
    await exec('GRANT h3b_weak TO CURRENT_USER');
    await exec('SET ROLE h3b_weak');
    // It can read and even insert, but it is not a BYPASSRLS/superuser maintenance role.
    try {
      await expect(run(new RecordingSession(client), 'plan')).rejects
        .toThrow(/ADMIN_ROLE_READY=NO. Missing capabilities: .*trusted_maintenance/);
    } finally { await exec('RESET ROLE'); }
  });

  it('11. accepts the trusted maintenance connection, and never elevates', async () => {
    const session = new RecordingSession(client);
    const summary = await run(session, 'plan');
    expect(summary.adminRoleReady).toBe(true);
    expect(formatSummary(summary)).toContain('ADMIN_ROLE_READY=YES');
    for (const forbidden of ['SET ROLE', 'GRANT ', 'ALTER ROLE', 'DISABLE ROW LEVEL']) {
      expect(session.sql.some((s) => s.includes(forbidden)), forbidden).toBe(false);
    }
  });
});

describe('H3B schema fingerprint', () => {
  it('12. aborts on H3A drift BEFORE any page text is read', async () => {
    await exec('ALTER TABLE public.knowledge_source_highlights '
      + 'ALTER COLUMN created_by DROP DEFAULT');
    const session = new RecordingSession(client);
    try {
      await expect(run(session, 'plan')).rejects.toThrow(/creator_default/);
      expect(session.readsFrom('knowledge_pages')).toBe(false);
      expect(session.readsFrom('source_references')).toBe(false);
    } finally {
      await exec('ALTER TABLE public.knowledge_source_highlights '
        + 'ALTER COLUMN created_by SET DEFAULT auth.uid()');
    }
    await expect(run(new RecordingSession(client), 'plan')).resolves.toBeTruthy();
  });

  it('names the weakened grant rather than proceeding', async () => {
    await exec('GRANT UPDATE ON public.knowledge_source_highlights TO authenticated');
    try {
      await expect(run(new RecordingSession(client), 'plan')).rejects.toThrow(/no_table_write/);
    } finally {
      await exec('REVOKE UPDATE ON public.knowledge_source_highlights FROM authenticated');
      await exec('GRANT UPDATE (color) ON public.knowledge_source_highlights TO authenticated');
    }
  });
});

describe('H3B session and transaction contract', () => {
  it('13-14. PLAN and VERIFY are READ ONLY and roll back', async () => {
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    for (const mode of ['plan', 'verify'] as const) {
      const session = new RecordingSession(client);
      const summary = await run(session, mode);
      expect(session.sql[0], mode).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      expect(session.sql.at(-1), mode).toBe('ROLLBACK');
      expect(session.sql.some((s) => s.startsWith('COMMIT')), mode).toBe(false);
      expect(summary.mutated, mode).toBe(false);
      expect(summary.toCreate, mode).toBe(1);
    }
    expect(await highlightCount()).toBe('0');
  });

  it('15-16. one pg.Client owns the whole run: the backend PID never changes', async () => {
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    const before = (await exec('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const session = new RecordingSession(client);
    await run(session, 'execute', {
      expectedPlanHash: (await run(new RecordingSession(client), 'plan')).planHash,
      atomicWriterToken: ATOMIC_WRITER_TOKEN,
    });
    const after = (await exec('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    expect(session.pids.length).toBeGreaterThan(2);
    expect(new Set(session.pids).size).toBe(1);
    expect(String(session.pids[0])).toBe(String(before));
    expect(String(after)).toBe(String(before));
  });

  it('17. refuses to wait: a held advisory lock aborts EXECUTE with no write', async () => {
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    const plan = await run(new RecordingSession(client), 'plan');
    const rival = new Client({ connectionString: SCRATCH });
    await rival.connect();
    try {
      const [a, b] = advisoryLockKeys();
      await rival.query('BEGIN');
      const held = await rival.query('SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS ok',
        [a, b]);
      expect(held.rows[0].ok).toBe(true);
      await expect(run(new RecordingSession(client), 'execute', {
        expectedPlanHash: plan.planHash, atomicWriterToken: ATOMIC_WRITER_TOKEN,
      })).rejects.toThrow(/advisory lock/);
      expect(await highlightCount()).toBe('0');
    } finally {
      await rival.query('ROLLBACK');
      await rival.end();
    }
  });
});

describe('H3B plan hash', () => {
  const decision = (id: string, cls: string) => ({
    referenceId: id, classification: cls, documentId: DOC, page: 1, charStart: 0, charEnd: 5,
    color: ACCENT, quoteDigest: 'd', existingHighlightId: null, reason: null,
  }) as never;

  it('18-20. is deterministic and covers the whole decision set', async () => {
    const a = computePlanHash([decision('a', 'TO_CREATE'), decision('b', 'EXACT_EXISTING')]);
    expect(a).toBe(computePlanHash([decision('b', 'EXACT_EXISTING'), decision('a', 'TO_CREATE')]));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    // A changed classification, an added candidate, and a changed SKIP all move it.
    expect(a).not.toBe(computePlanHash([decision('a', 'TO_CREATE'), decision('b', 'MISMATCH')]));
    expect(a).not.toBe(computePlanHash([decision('a', 'TO_CREATE'),
      decision('b', 'EXACT_EXISTING'), decision('c', 'SKIPPED')]));
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    const first = await run(new RecordingSession(client), 'plan');
    expect((await run(new RecordingSession(client), 'plan')).planHash).toBe(first.planHash);
    await exec(`INSERT INTO public.source_references
      (id, target_padlet_id, source_document_id, page_start, page_end)
      VALUES ('dddddddd-0000-0000-0000-00000000000f', '${NOTE}', '${DOC}', 2, 2)`);
    expect((await run(new RecordingSession(client), 'plan')).planHash).not.toBe(first.planHash);
  });

  it('21. refuses to execute a plan the data has drifted away from', async () => {
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    const stale = (await run(new RecordingSession(client), 'plan')).planHash;
    await seedPaintable('dddddddd-0000-0000-0000-000000000002', 17, 22);
    await expect(run(new RecordingSession(client), 'execute', {
      expectedPlanHash: stale, atomicWriterToken: ATOMIC_WRITER_TOKEN,
    })).rejects.toThrow(/does not match the expected plan hash/);
    expect(await highlightCount()).toBe('0');
  });
});

describe('H3B reconciliation', () => {
  const REF = 'dddddddd-0000-0000-0000-000000000001';
  async function seedHighlight(overrides: Partial<Record<string, string>> = {}) {
    await exec(`INSERT INTO public.knowledge_source_highlights
      (source_document_id, page_number, char_start, char_end, quote_text, quote_hash, color,
       created_by, source_reference_id)
      VALUES ('${overrides.doc ?? DOC}', ${overrides.page ?? 1}, ${overrides.start ?? 6},
              ${overrides.end ?? 16}, '${overrides.quote ?? PAGE_TEXT.slice(6, 16)}',
              ${overrides.hash ?? 'NULL'}, '${overrides.color ?? ACCENT}', NULL, '${REF}')`);
  }

  it('22. an existing row that matches canonically is EXACT_EXISTING', async () => {
    await seedPaintable(REF);
    await seedHighlight();
    const summary = await run(new RecordingSession(client), 'plan');
    expect([summary.exactExisting, summary.toCreate, summary.mismatches]).toEqual([1, 0, 0]);
  });

  it('23. a row that differs is MISMATCH, and EXECUTE refuses rather than repairing', async () => {
    for (const bad of [{ start: '7' }, { color: '#bfdbfe' }, { quote: 'not the page slice' }]) {
      await exec('DELETE FROM public.knowledge_source_highlights;'
        + 'DELETE FROM public.source_references');
      await seedPaintable(REF);
      await seedHighlight(bad);
      const summary = await run(new RecordingSession(client), 'plan');
      expect(summary.mismatches, JSON.stringify(bad)).toBe(1);
      expect(summary.toCreate).toBe(0);
      await expect(run(new RecordingSession(client), 'execute', {
        expectedPlanHash: summary.planHash, atomicWriterToken: ATOMIC_WRITER_TOKEN,
      })).rejects.toThrow(/disagree with the plan/);
      const row = (await exec('SELECT * FROM public.knowledge_source_highlights')).rows;
      expect(row).toHaveLength(1);
      if (bad.start) expect(row[0].char_start).toBe(7);
      if (bad.color) expect(row[0].color).toBe('#bfdbfe');
    }
  });

  it('24. more than one origin row fails closed', async () => {
    await seedPaintable(REF);
    await seedHighlight();
    // The unique partial origin index should make this unreachable; prove the
    // code does not depend on that being true.
    await exec('DROP INDEX IF EXISTS public.knowledge_source_highlights_origin_uidx');
    await seedHighlight({ start: '1', end: '5', quote: PAGE_TEXT.slice(1, 5) });
    try {
      const summary = await run(new RecordingSession(client), 'plan');
      expect(summary.mismatches).toBe(1);
      expect(summary.toCreate).toBe(0);
    } finally {
      // The duplicates must go before the unique index can come back.
      await exec('DELETE FROM public.knowledge_source_highlights');
      await exec('CREATE UNIQUE INDEX knowledge_source_highlights_origin_uidx ON '
        + 'public.knowledge_source_highlights(source_reference_id) '
        + 'WHERE source_reference_id IS NOT NULL');
    }
  });

  it('25-28. quote_hash corroborates: NULL tolerates, two different values do not', async () => {
    const cases: [string | null, string | null, number][] = [
      [null, 'h1', 1], ['h1', null, 1], ['h1', 'h1', 1], ['h1', 'h2', 0],
    ];
    for (const [existingHash, citationHash, expectedExact] of cases) {
      await exec('DELETE FROM public.knowledge_source_highlights;'
        + 'DELETE FROM public.source_references');
      await seedPaintable(REF, 6, 16, citationHash);
      await seedHighlight({ hash: existingHash === null ? 'NULL' : `'${existingHash}'` });
      const summary = await run(new RecordingSession(client), 'plan');
      const label = `existing=${existingHash} citation=${citationHash}`;
      expect(summary.exactExisting, label).toBe(expectedExact);
      expect(summary.mismatches, label).toBe(1 - expectedExact);
    }
  });
});

describe('H3B skip taxonomy', () => {
  it('35-40. reports each non-paintable shape in its own bucket', async () => {
    await exec(`INSERT INTO public.source_references
      (id, target_padlet_id, source_document_id, page_start, page_end, quote_text, char_start, char_end,
       region_x, region_y, region_width, region_height) VALUES
      ('dddddddd-0000-0000-0000-0000000000a1','${NOTE}','${DOC}',1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
      ('dddddddd-0000-0000-0000-0000000000a2','${NOTE}','${DOC}',1,1,NULL,NULL,NULL,0.1,0.1,0.2,0.2),
      ('dddddddd-0000-0000-0000-0000000000a3','${NOTE}','${DOC}',1,2,'x',0,3,NULL,NULL,NULL,NULL),
      ('dddddddd-0000-0000-0000-0000000000a4','${NOTE}','${DOC}',1,1,'nowhere on the page',0,3,NULL,NULL,NULL,NULL),
      ('dddddddd-0000-0000-0000-0000000000a5','${NOTE}','${DOC}',9,9,'x',0,3,NULL,NULL,NULL,NULL)`);
    const s = await run(new RecordingSession(client), 'plan');
    expect({
      pageOnly: s.skippedPageOnly, region: s.skippedRegion, crossPage: s.skippedCrossPage,
      unresolved: s.skippedUnresolved, noPageText: s.skippedNoPageText,
    }).toEqual({ pageOnly: 1, region: 1, crossPage: 1, unresolved: 1, noPageText: 1 });
    expect(s.paintable).toBe(0);
    expect(s.toCreate).toBe(0);
  });

  it('37. the REGION bucket is reporting only -- it never changes paintability', async () => {
    // The same citation, with and without region metadata: non-paintable either
    // way, and the only difference is which counter it lands in.
    const insert = (id: string, region: string) => exec(`INSERT INTO public.source_references
      (id, target_padlet_id, source_document_id, page_start, page_end, quote_text,
       char_start, char_end, region_x, region_width)
      VALUES ('${id}','${NOTE}','${DOC}',1,1,NULL,NULL,NULL,${region})`);
    await insert('dddddddd-0000-0000-0000-0000000000b1', 'NULL, NULL');
    const plain = await run(new RecordingSession(client), 'plan');
    await exec('DELETE FROM public.source_references');
    await insert('dddddddd-0000-0000-0000-0000000000b2', '0.1, 0.2');
    const regioned = await run(new RecordingSession(client), 'plan');
    expect(plain.skippedPageOnly).toBe(1);
    expect(regioned.skippedRegion).toBe(1);
    for (const s of [plain, regioned]) {
      expect(s.paintable).toBe(0);
      expect(s.toCreate).toBe(0);
      expect(s.mismatches).toBe(0);
      expect(s.rendererBackfillReady).toBe(true);
    }
  });
});

describe('H3B protected documents', () => {
  it('41-43. a denied document with candidates blocks before its page text is read', async () => {
    await exec(`INSERT INTO public.source_references
      (id, target_padlet_id, source_document_id, page_start, page_end, quote_text,
       char_start, char_end)
      VALUES ('dddddddd-0000-0000-0000-0000000000c1','${NOTE}','${DENIED_DOC}',1,1,'Protected',0,9)`);
    const session = new RecordingSession(client);
    await expect(run(session, 'plan')).rejects.toThrow(/protected document/);
    expect(session.readsFrom('knowledge_pages')).toBe(false);
    expect(session.sql.some((s) => s.includes('quote_text'))).toBe(false);
    for (const secret of [DENY[0], 'Protected synthetic page', 'Protected']) {
      expect(session.sql.join('\n'), secret).not.toContain(secret);
    }
  });

  it('requires a non-empty denylist, and never names a document in its output', async () => {
    await expect(run(new RecordingSession(client), 'plan', { deny: [] })).rejects
      .toThrow(/must name at least one protected document/);
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    const summary = await run(new RecordingSession(client), 'plan');
    const printed = formatSummary(summary);
    for (const secret of [DENY[0], 'synthetic-open.pdf', PAGE_TEXT, ACCENT]) {
      expect(printed, secret).not.toContain(secret);
    }
    expect(printed).toContain('PROTECTED_BLOCKED=0');
  });
});

describe('H3B execute', () => {
  const REF = 'dddddddd-0000-0000-0000-000000000001';

  it('refuses to mutate without both operator acknowledgements', async () => {
    await seedPaintable(REF);
    const plan = await run(new RecordingSession(client), 'plan');
    await expect(run(new RecordingSession(client), 'execute', { expectedPlanHash: plan.planHash }))
      .rejects.toThrow(/ATOMIC-WRITER-ACTIVE/);
    await expect(run(new RecordingSession(client), 'execute',
      { expectedPlanHash: plan.planHash, atomicWriterToken: 'yes' }))
      .rejects.toThrow(/ATOMIC-WRITER-ACTIVE/);
    await expect(run(new RecordingSession(client), 'execute',
      { atomicWriterToken: ATOMIC_WRITER_TOKEN })).rejects.toThrow(/EXPECTED_PLAN_HASH/);
    expect(await highlightCount()).toBe('0');
  });

  it('29-33. inserts only the planned highlights, with NULL authorship and hash', async () => {
    await seedPaintable(REF, 6, 16, 'citation-hash');
    const digest = async (t: string, a: string) => (await exec(
      `SELECT md5(string_agg(${a}::text, '|' ORDER BY ${a}.id::text)) AS h FROM public.${t} ${a}`
    )).rows[0].h;
    const refsBefore = await digest('source_references', 'r');
    const notesBefore = await digest('padlets', 'p');
    const plan = await run(new RecordingSession(client), 'plan');
    const session = new RecordingSession(client);
    const summary = await run(session, 'execute', {
      expectedPlanHash: plan.planHash, atomicWriterToken: ATOMIC_WRITER_TOKEN,
    });
    expect([summary.inserted, summary.committed, summary.mutated]).toEqual([1, true, true]);
    expect(session.sql.at(-1)).toBe('COMMIT');
    const row = (await exec('SELECT * FROM public.knowledge_source_highlights')).rows[0];
    expect(row.created_by).toBeNull();
    expect(row.quote_hash).toBeNull();
    expect(row.char_start).toBe(6);
    expect(row.char_end).toBe(16);
    expect(row.quote_text).toBe(PAGE_TEXT.slice(6, 16));
    expect(row.color).toBe(ACCENT);
    expect(row.source_reference_id).toBe(REF);
    // The only write, and nothing else moved.
    // A write STARTS with a write verb; the fingerprint and capability probes
    // merely quote 'INSERT'/'UPDATE' as privilege names.
    const writes = session.sql.filter(
      (s) => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/i.test(s));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/INSERT INTO public\.knowledge_source_highlights/);
    expect(await digest('source_references', 'r')).toBe(refsBefore);
    expect(await digest('padlets', 'p')).toBe(notesBefore);
  });

  it('32. a failure part-way through rolls the whole backfill back', async () => {
    await seedPaintable(REF);
    await seedPaintable('dddddddd-0000-0000-0000-000000000002', 17, 22);
    await seedPaintable('dddddddd-0000-0000-0000-000000000003', 23, 27);
    const plan = await run(new RecordingSession(client), 'plan');
    expect(plan.toCreate).toBe(3);
    await exec(`CREATE FUNCTION public.h3b_boom() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN IF NEW.char_start = 23 THEN RAISE EXCEPTION 'synthetic failure'; END IF;
      RETURN NEW; END $$`);
    await exec('CREATE TRIGGER h3b_boom BEFORE INSERT ON public.knowledge_source_highlights '
      + 'FOR EACH ROW EXECUTE FUNCTION public.h3b_boom()');
    try {
      await expect(run(new RecordingSession(client), 'execute', {
        expectedPlanHash: plan.planHash, atomicWriterToken: ATOMIC_WRITER_TOKEN,
      })).rejects.toThrow(/synthetic failure/);
      expect(await highlightCount()).toBe('0');
    } finally {
      await exec('DROP TRIGGER h3b_boom ON public.knowledge_source_highlights');
      await exec('DROP FUNCTION public.h3b_boom()');
    }
  });
});

describe('H3B convergence, readiness and idempotence', () => {
  it('44-47. legacy and atomic-writer citations converge, then the rerun is a no-op', async () => {
    // A: the legacy shape -- a citation with no standalone highlight.
    await seedPaintable('dddddddd-0000-0000-0000-000000000001', 6, 16);
    // B: what the atomic writer produces, through the reviewed RPC itself.
    await exec(`SELECT public.create_knowledge_source_citation('${NOTE}'::uuid, '${DOC}'::uuid,
      1, 1, '${PAGE_TEXT.slice(17, 22)}', NULL, 17, 22, NULL, NULL, NULL, NULL, '${ACCENT}')`);
    const plan = await run(new RecordingSession(client), 'plan');
    expect([plan.paintable, plan.toCreate, plan.exactExisting, plan.mismatches])
      .toEqual([2, 1, 1, 0]);
    expect(plan.rendererBackfillReady).toBe(false);
    const done = await run(new RecordingSession(client), 'execute', {
      expectedPlanHash: plan.planHash, atomicWriterToken: ATOMIC_WRITER_TOKEN,
    });
    expect(done.inserted).toBe(1);
    const verify = await run(new RecordingSession(client), 'verify');
    expect([verify.toCreate, verify.mismatches, verify.protectedBlocked]).toEqual([0, 0, 0]);
    expect(verify.exactExisting).toBe(2);
    expect(verify.rendererBackfillReady).toBe(true);
    expect(formatSummary(verify)).toContain('RENDERER_BACKFILL_READY=YES');
    // A new atomic write lands complete, so readiness survives it.
    await exec(`SELECT public.create_knowledge_source_citation('${NOTE}'::uuid, '${DOC}'::uuid,
      1, 1, '${PAGE_TEXT.slice(23, 27)}', NULL, 23, 27, NULL, NULL, NULL, NULL, '${ACCENT}')`);
    const afterAtomic = await run(new RecordingSession(client), 'verify');
    expect(afterAtomic.toCreate).toBe(0);
    expect(afterAtomic.rendererBackfillReady).toBe(true);
    // Idempotent: nothing left to do, and a second EXECUTE writes nothing.
    const second = await run(new RecordingSession(client), 'plan');
    expect(second.toCreate).toBe(0);
    const rerun = await run(new RecordingSession(client), 'execute', {
      expectedPlanHash: second.planHash, atomicWriterToken: ATOMIC_WRITER_TOKEN,
    });
    expect([rerun.inserted, rerun.noWork, rerun.mutated]).toEqual([0, true, false]);
    expect(await highlightCount()).toBe('3');
  });

  it('readiness is refused while any paintable citation is still missing', async () => {
    await seedPaintable('dddddddd-0000-0000-0000-000000000001');
    const verify = await run(new RecordingSession(client), 'verify');
    expect(verify.toCreate).toBe(1);
    expect(verify.rendererBackfillReady).toBe(false);
    expect(formatSummary(verify)).toContain('RENDERER_BACKFILL_READY=NO');
  });
});

describe('H3B leaves the local-only runner alone', () => {
  it('48. the reviewed local runner still refuses every non-local host', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'scripts/db/knowledgeSourceHighlightBackfillRunner.ts'), 'utf8');
    expect(source).toContain("['127.0.0.1', 'localhost', '::1'].includes(hostname)");
    expect(source).toContain('This backfill is LOCAL ONLY');
    for (const escape of ['--prod', '--remote', '--force-production', 'allowlist', 'allow-production']) {
      expect(source, escape).not.toContain(escape);
    }
  });
});
