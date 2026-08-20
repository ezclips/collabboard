import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const baselineSnapshot = path.join(repoRoot, 'supabase', 'baseline', 'schema_snapshot_2026-07-05.sql');
const sourceMigrations = path.join(repoRoot, 'supabase', 'migrations');
const tempRootPrefix = path.join(os.tmpdir(), 'collabboard-supabase-baseline-');

export const BASELINE_CUTOFF = '2026-07-05';

/**
 * The snapshot already contains the net effects of the 20260706-20260709 and
 * 20260711 changes. The 20260710 board-section repair is the exception: its
 * corrected policies are absent from the snapshot and must be applied here.
 * These are the only migrations not represented by the snapshot and required
 * to reach the current repository schema before P3.
 *
 * The target names use 14-digit Supabase migration versions while the source
 * files retain their historical names. This makes the temporary migration
 * history deterministic without rewriting archival files.
 */
export const POST_BASELINE_MIGRATIONS = [
  {
    source: '20260710_fix_board_sections_wrong_table_rls.sql',
    target: '20260710000000_board_sections_rls.sql',
  },
  {
    source: '20260713_fix_kanban_board_member_policy_recursion.sql',
    target: '20260713000000_kanban_member_rls.sql',
  },
  {
    source: '20260726_add_canvas_line_coord_space.sql',
    target: '20260726000000_canvas_line_coord_space.sql',
  },
  {
    source: '20260820_create_knowledge_data_foundation.sql',
    target: '20260820000000_knowledge_data_foundation.sql',
  },
];

const REQUIRED_EXTENSIONS_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
`;

const LOCAL_CONFIG = (projectId) => `project_id = "${projectId}"

[api]
enabled = false

[db]
port = 56322
shadow_port = 56320
major_version = 17

[db.migrations]
enabled = true

[db.seed]
enabled = false

[realtime]
enabled = false

[studio]
enabled = false

[storage]
enabled = false

[auth]
enabled = true

[edge_runtime]
enabled = false

[analytics]
enabled = false
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    input: options.input,
  });
  return {
    command,
    args,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}

function requireSuccess(result, description) {
  if (result.error || result.status !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.trim();
    throw new Error(`${description} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function assertDocker() {
  const result = run('docker', ['info']);
  requireSuccess(result, 'Docker daemon check');
}

function writeMigrationSet(projectRoot) {
  const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.copyFileSync(baselineSnapshot, path.join(migrationsDir, '20260705000000_baseline_snapshot.sql'));
  fs.writeFileSync(path.join(migrationsDir, '20260704000000_required_extensions.sql'), REQUIRED_EXTENSIONS_SQL);

  for (const migration of POST_BASELINE_MIGRATIONS) {
    fs.copyFileSync(
      path.join(sourceMigrations, migration.source),
      path.join(migrationsDir, migration.target),
    );
  }
}

function createTempProject() {
  const projectRoot = fs.mkdtempSync(tempRootPrefix);
  const projectId = `collabboard-baseline-${crypto.randomBytes(5).toString('hex')}`;
  const supabaseRoot = path.join(projectRoot, 'supabase');
  fs.mkdirSync(supabaseRoot, { recursive: true });
  fs.writeFileSync(path.join(supabaseRoot, 'config.toml'), LOCAL_CONFIG(projectId));
  writeMigrationSet(projectRoot);
  return { projectRoot, projectId };
}

function dbContainerFor(projectId) {
  const result = requireSuccess(
    run('docker', ['ps', '--filter', `name=supabase_db_${projectId}`, '--format', '{{.Names}}']),
    'Local database container lookup',
  );
  const name = result.stdout.trim().split(/\r?\n/).find(Boolean);
  if (!name) throw new Error(`No local Supabase database container found for ${projectId}`);
  return name;
}

function runSql(container, sql) {
  return requireSuccess(
    run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: sql,
    }),
    'Local SQL validation',
  ).stdout;
}

function schemaSmokeSql() {
  return String.raw`
SELECT json_build_object(
  'core_tables', (
    SELECT count(*) = 8
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('boards', 'padlets', 'board_collaborators', 'canvases', 'canvas_lines', 'board_sections', 'knowledge_documents', 'knowledge_pages')
  ),
  'postgis_extension', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis'),
  'padlet_location_geog', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'padlets' AND column_name = 'location_geog'
  ),
  'coord_space', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'canvas_lines' AND column_name = 'coord_space'
  ),
  'knowledge_tables', (
    SELECT count(*) = 4
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('knowledge_documents', 'knowledge_pages', 'knowledge_chunks', 'source_references')
  ),
  'knowledge_rls', (
    SELECT count(*) = 4
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('knowledge_documents', 'knowledge_pages', 'knowledge_chunks', 'source_references')
      AND relrowsecurity
  ),
  'knowledge_policies', (
    SELECT count(*) >= 8
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('knowledge_documents', 'knowledge_pages', 'knowledge_chunks', 'source_references')
  ),
  'p3_constraints', (
    SELECT count(*) >= 8
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conname IN (
        'knowledge_pages_page_number_check',
        'knowledge_pages_document_page_key',
        'knowledge_chunks_page_start_check',
        'knowledge_chunks_page_range_check',
        'knowledge_chunks_document_index_key',
        'source_references_page_start_check',
        'source_references_page_range_check',
        'knowledge_documents_processing_status_check'
      )
  )
) AS validation;
`;
}

function knowledgeSmokeSql() {
  return String.raw`
BEGIN;
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'baseline-test@example.invalid', 'not-a-password', now(), now(), now());
INSERT INTO public.boards (id, user_id, title)
VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'baseline smoke board');
INSERT INTO public.padlets (id, board_id, title, content, type)
VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'baseline smoke note', '', 'text');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
INSERT INTO public.knowledge_documents (
  id, board_id, created_by, original_filename, file_size_bytes, storage_path, content_sha256
)
VALUES (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  'smoke.pdf', 10, 'boards/smoke/smoke.pdf', repeat('a', 64)
);
INSERT INTO public.knowledge_pages (document_id, page_number, width_points, height_points, text)
VALUES ('00000000-0000-0000-0000-000000000401', 1, 612, 792, 'Smoke page');
INSERT INTO public.knowledge_chunks (document_id, page_start, page_end, text, text_hash, chunk_index)
VALUES ('00000000-0000-0000-0000-000000000401', 1, 1, 'Smoke chunk', repeat('b', 64), 0);
INSERT INTO public.source_references (target_padlet_id, source_document_id, page_start, page_end, quote_text)
VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', 1, 1, 'Smoke page');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.knowledge_pages WHERE document_id = '00000000-0000-0000-0000-000000000401') <> 1
     OR (SELECT count(*) FROM public.knowledge_chunks WHERE document_id = '00000000-0000-0000-0000-000000000401') <> 1
     OR (SELECT count(*) FROM public.source_references WHERE source_document_id = '00000000-0000-0000-0000-000000000401') <> 1
  THEN
    RAISE EXCEPTION 'Knowledge smoke inserts were not visible through RLS';
  END IF;
END $$;

DELETE FROM public.knowledge_documents WHERE id = '00000000-0000-0000-0000-000000000401';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.knowledge_pages WHERE document_id = '00000000-0000-0000-0000-000000000401')
     OR EXISTS (SELECT 1 FROM public.knowledge_chunks WHERE document_id = '00000000-0000-0000-0000-000000000401')
     OR EXISTS (SELECT 1 FROM public.source_references WHERE source_document_id = '00000000-0000-0000-0000-000000000401')
  THEN
    RAISE EXCEPTION 'Knowledge derived rows did not cascade on document delete';
  END IF;
END $$;
ROLLBACK;
`;
}

function migrationLint(projectRoot) {
  const result = run('supabase', ['db', 'lint', '--local', '--level', 'warning', '--fail-on', 'none', '--workdir', projectRoot]);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const findingCount = (output.match(/\b(?:ERROR|WARNING|NOTICE)\b/gi) ?? []).length;
  return { status: result.status, findingCount, output: output.slice(0, 12000) };
}

function appliedMigrations(container) {
  const sql = `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`;
  return runSql(container, sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\s*$/.test(line))
    .map((line) => line.trim());
}

function startProject(projectRoot) {
  const result = run('supabase', ['start', '--workdir', projectRoot]);
  return requireSuccess(result, 'Local Supabase baseline bootstrap');
}

function stopProject(projectId) {
  run('supabase', ['stop', '--project-id', projectId, '--no-backup']);
}

function runOnce() {
  assertDocker();
  const { projectRoot, projectId } = createTempProject();
  try {
    startProject(projectRoot);
    const container = dbContainerFor(projectId);
    const schemaOutput = runSql(container, schemaSmokeSql());
    const knowledgeOutput = runSql(container, knowledgeSmokeSql());
    const lint = migrationLint(projectRoot);
    return {
      projectId,
      baselineCutoff: BASELINE_CUTOFF,
      postBaselineMigrations: POST_BASELINE_MIGRATIONS,
      appliedMigrations: appliedMigrations(container),
      schemaOutput: schemaOutput.trim(),
      knowledgeOutput: knowledgeOutput.trim(),
      lint,
    };
  } finally {
    stopProject(projectId);
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const runs = Number(process.argv[2] ?? '2');
if (!Number.isInteger(runs) || runs < 1) throw new Error('Usage: node scripts/db/bootstrap-local.mjs [runs>=1]');

const reports = [];
for (let index = 0; index < runs; index += 1) reports.push(runOnce());
console.log(JSON.stringify({ strategy: 'BASELINE', runs: reports }, null, 2));
