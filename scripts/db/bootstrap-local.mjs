import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

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
  {
    source: '20260820_provision_knowledge_documents_bucket.sql',
    target: '20260820010000_knowledge_documents_bucket.sql',
  },
  {
    source: '20260821_add_knowledge_extraction_lifecycle.sql',
    target: '20260821000000_knowledge_extraction_lifecycle.sql',
  },
  {
    source: '20260822_add_knowledge_processing_lease.sql',
    target: '20260822000000_knowledge_processing_lease.sql',
  },
  {
    source: '20260823_add_knowledge_processing_candidates.sql',
    target: '20260823000000_knowledge_processing_candidates.sql',
  },
  {
    source: '20260824_add_knowledge_chunk_provenance.sql',
    target: '20260824000000_knowledge_chunk_provenance.sql',
  },
  {
    source: '20260825_add_knowledge_chunk_embeddings.sql',
    target: '20260825000000_knowledge_chunk_embeddings.sql',
  },
  {
    source: '20260826_dedupe_knowledge_search_by_document.sql',
    target: '20260826000000_dedupe_knowledge_search_by_document.sql',
  },
];

const REQUIRED_EXTENSIONS_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
`;

const LOCAL_CONFIG = (projectId) => `project_id = "${projectId}"

[api]
enabled = true
port = 56321

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
enabled = true

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
  'knowledge_bucket', EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'knowledge-documents'
      AND name = 'knowledge-documents'
      AND public = false
  ),
  'extraction_rpc', EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'complete_knowledge_extraction'
  ),
  'extraction_rpc_not_public', NOT has_function_privilege('authenticated', (
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'complete_knowledge_extraction'
  ), 'EXECUTE'),
  'lease_columns', (
    SELECT count(*) = 3
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_documents'
      AND column_name IN ('processing_lease_token', 'processing_lease_expires_at', 'processing_attempt')
  ),
  'lease_rpcs_not_public', (
    SELECT count(*) = 4
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'claim_knowledge_extraction',
        'renew_knowledge_processing_lease',
        'complete_knowledge_extraction',
        'fail_knowledge_extraction'
      )
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  'candidate_rpc_not_public', NOT has_function_privilege('authenticated', (
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'list_knowledge_processing_candidates'
  ), 'EXECUTE'),
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

function localStatusEnv(projectRoot) {
  const output = requireSuccess(
    run('supabase', ['status', '-o', 'env', '--workdir', projectRoot]),
    'Local Supabase status lookup',
  ).stdout;
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function assertLoopbackUrl(value, description) {
  const parsed = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`${description} is not loopback: ${parsed.hostname}`);
  }
  return parsed.toString().replace(/\/$/, '');
}

async function storageSmoke(projectRoot, projectId) {
  const values = localStatusEnv(projectRoot);
  const url = assertLoopbackUrl(values.API_URL, 'Local Supabase API URL');
  if (!values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error('Local Supabase status did not provide Storage credentials');
  }

  const serviceClient = createClient(url, values.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousClient = createClient(url, values.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const smokePath = `knowledge/bootstrap-smoke/${projectId}/original.pdf`;
  const bytes = Buffer.from('%PDF-1.7\nbootstrap smoke\n%%EOF', 'utf8');

  let uploaded;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    uploaded = await serviceClient.storage
      .from('knowledge-documents')
      .upload(smokePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (!uploaded.error || !String(uploaded.error.message).includes('fetch failed')) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (uploaded.error) throw new Error(`Local Storage upload failed: ${uploaded.error.message}`);

  const anonymousRead = await anonymousClient.storage
    .from('knowledge-documents')
    .download(smokePath);
  if (!anonymousRead.error) {
    throw new Error('Private Knowledge bucket allowed anonymous download');
  }

  const serviceRead = await serviceClient.storage
    .from('knowledge-documents')
    .download(smokePath);
  if (serviceRead.error || !serviceRead.data) {
    throw new Error(`Service-role Storage read failed: ${serviceRead.error?.message ?? 'no data'}`);
  }
  const stored = Buffer.from(await serviceRead.data.arrayBuffer());
  if (!stored.equals(bytes)) throw new Error('Local Storage PDF bytes were not preserved');

  const removed = await serviceClient.storage.from('knowledge-documents').remove([smokePath]);
  if (removed.error) throw new Error(`Local Storage remove failed: ${removed.error.message}`);

  return {
    bucket: 'knowledge-documents',
    private: true,
    mimeRestriction: 'not-used',
    serviceRoleUploadRemove: true,
  };
}

function localWorkerRuntime() {
  const javaBin = process.env.OPENDATALOADER_JAVA_BIN;
  const jarPath = process.env.OPENDATALOADER_JAR_PATH;
  if (!javaBin || !jarPath) {
    return {
      status: 'blocked',
      reason: 'Set OPENDATALOADER_JAVA_BIN and OPENDATALOADER_JAR_PATH for real P5B execution.',
    };
  }
  if (!path.isAbsolute(javaBin) || !path.isAbsolute(jarPath)) {
    return { status: 'blocked', reason: 'P5B Java and JAR paths must be absolute.' };
  }
  if (!fs.existsSync(javaBin)) return { status: 'blocked', reason: `Java executable is unavailable at ${javaBin}.` };
  if (!fs.existsSync(jarPath)) return { status: 'blocked', reason: `OpenDataLoader JAR is unavailable at ${jarPath}.` };
  const probe = run(javaBin, ['-version']);
  if (probe.error || probe.status !== 0) {
    return { status: 'blocked', reason: 'Configured Java executable could not be invoked.' };
  }
  return { status: 'available', javaBin, jarPath };
}

function generateWorkerFixtures(projectRoot) {
  const fixtureDir = path.join(projectRoot, 'p5-fixtures');
  const result = run(process.execPath, [
    path.join(repoRoot, 'tools', 'pdf-extraction-prototype', 'generate-fixtures.mjs'),
    '--out',
    fixtureDir,
  ]);
  requireSuccess(result, 'P5B deterministic fixture generation');
  return fixtureDir;
}

function writeIntegrationEnv(projectRoot, workerRuntime, fixtureDir) {
  const values = localStatusEnv(projectRoot);
  const url = assertLoopbackUrl(values.API_URL, 'Local Supabase API URL');
  if (!values.SERVICE_ROLE_KEY || !values.ANON_KEY) throw new Error('Local Supabase status did not provide service role credentials');
  const envPath = path.join(repoRoot, 'scripts', '.tmp-p4-env.json');
  fs.writeFileSync(
    envPath,
    JSON.stringify({
      P4_SUPABASE_URL: url,
      P4_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
      P4_ANON_KEY: values.ANON_KEY,
      P4_BOARD_A: '00000000-0000-0000-0000-000000002011',
      P4_BOARD_B: '00000000-0000-0000-0000-000000002012',
      P4_OWNER: '00000000-0000-0000-0000-000000001011',
      P4_EDITOR: '00000000-0000-0000-0000-000000001012',
      P4_VIEWER: '00000000-0000-0000-0000-000000001013',
      P4_UNRELATED: '00000000-0000-0000-0000-000000001014',
      ...(workerRuntime.status === 'available'
        ? {
            P5_JAVA_BIN: workerRuntime.javaBin,
            P5_JAR_PATH: workerRuntime.jarPath,
            P5_FIXTURE_DIR: fixtureDir,
            ...(process.env.P5E_CONTAINER_IMAGE
              ? { P5E_CONTAINER_IMAGE: process.env.P5E_CONTAINER_IMAGE }
              : {}),
          }
        : {}),
    }),
  );
  return envPath;
}

function runKnowledgeIntegrationTests() {
  const testFiles = [
    'lib/infra/knowledge/knowledgeIngestion.integration.test.ts',
    'lib/infra/knowledge/knowledgeDeletion.integration.test.ts',
    'lib/infra/knowledge/knowledgeExtraction.integration.test.ts',
    'workers/knowledge-pdf/knowledgePdfWorker.integration.test.ts',
    'workers/knowledge-pdf/knowledgePdfDispatcher.integration.test.ts',
    'workers/knowledge-pdf/knowledgePdfContainer.integration.test.ts',
    'lib/infra/knowledge/knowledgeEmbedding.integration.test.ts',
  ];
  const outputs = [];
  for (const testFile of testFiles) {
    const result = run(process.execPath, [
      path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      testFile,
    ]);
    if (result.error || result.status !== 0) {
      const detail = `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`.trim();
      throw new Error(
        `Local Knowledge Storage/Postgres integration tests failed${detail ? `: ${detail.slice(-12000)}` : ''}`,
      );
    }
    outputs.push(result.stdout.trim());
  }
  return { stdout: outputs.join('\n') };
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

function integrationFixtureSql() {
  return String.raw`
BEGIN;
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000001011', 'authenticated', 'authenticated', 'p4-owner@example.invalid', 'not-a-password', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001012', 'authenticated', 'authenticated', 'p4-editor@example.invalid', 'not-a-password', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001013', 'authenticated', 'authenticated', 'p4-viewer@example.invalid', 'not-a-password', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001014', 'authenticated', 'authenticated', 'p4-unrelated@example.invalid', 'not-a-password', now(), now(), now());
INSERT INTO public.boards (id, user_id, title)
VALUES
  ('00000000-0000-0000-0000-000000002011', '00000000-0000-0000-0000-000000001011', 'P4D board A'),
  ('00000000-0000-0000-0000-000000002012', '00000000-0000-0000-0000-000000001011', 'P4D board B');
INSERT INTO public.padlets (id, board_id, title, content, type)
VALUES
  ('00000000-0000-0000-0000-000000003011', '00000000-0000-0000-0000-000000002011', 'P4D note A', '', 'text'),
  ('00000000-0000-0000-0000-000000003012', '00000000-0000-0000-0000-000000002012', 'P4D note B', '', 'text');
INSERT INTO public.board_collaborators (user_id, role, board_id)
VALUES
  ('00000000-0000-0000-0000-000000001012', 'editor', '00000000-0000-0000-0000-000000002011'),
  ('00000000-0000-0000-0000-000000001013', 'viewer', '00000000-0000-0000-0000-000000002011');
COMMIT;
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

async function runOnce() {
  assertDocker();
  const { projectRoot, projectId } = createTempProject();
  try {
    startProject(projectRoot);
    const container = dbContainerFor(projectId);
    const schemaOutput = runSql(container, schemaSmokeSql());
    const knowledgeOutput = runSql(container, knowledgeSmokeSql());
    runSql(container, integrationFixtureSql());
    const storageOutput = await storageSmoke(projectRoot, projectId);
    const workerRuntime = localWorkerRuntime();
    const fixtureDir = workerRuntime.status === 'available' ? generateWorkerFixtures(projectRoot) : undefined;
    const integrationEnvPath = writeIntegrationEnv(projectRoot, workerRuntime, fixtureDir);
    let integrationOutput;
    try {
      integrationOutput = runKnowledgeIntegrationTests().stdout.trim().slice(-12000);
    } finally {
      fs.rmSync(integrationEnvPath, { force: true });
    }
    const lint = migrationLint(projectRoot);
    return {
      projectId,
      baselineCutoff: BASELINE_CUTOFF,
      postBaselineMigrations: POST_BASELINE_MIGRATIONS,
      appliedMigrations: appliedMigrations(container),
      schemaOutput: schemaOutput.trim(),
      knowledgeOutput: knowledgeOutput.trim(),
      storageOutput,
      workerIntegration: workerRuntime.status === 'available'
        ? { status: 'pass' }
        : { status: 'blocked', reason: workerRuntime.reason },
      integrationOutput,
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
for (let index = 0; index < runs; index += 1) reports.push(await runOnce());
console.log(JSON.stringify({ strategy: 'BASELINE', runs: reports }, null, 2));
