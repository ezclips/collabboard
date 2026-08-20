import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const baselineSnapshot = path.join(repoRoot, 'supabase', 'baseline', 'schema_snapshot_2026-07-05.sql');
const sourceMigrations = path.join(repoRoot, 'supabase', 'migrations');
const rolloutPath = path.join(repoRoot, 'supabase', 'production-rollouts', '20260820_knowledge_pdf_v1.sql');
const verifyPath = path.join(repoRoot, 'supabase', 'production-rollouts', '20260820_knowledge_pdf_v1_verify.sql');
const tempRootPrefix = path.join(os.tmpdir(), 'collabboard-knowledge-rollout-');

const PREREQUISITE_MIGRATIONS = [
  ['20260710_fix_board_sections_wrong_table_rls.sql', '20260710000000_board_sections_rls.sql'],
  ['20260713_fix_kanban_board_member_policy_recursion.sql', '20260713000000_kanban_member_rls.sql'],
  ['20260726_add_canvas_line_coord_space.sql', '20260726000000_canvas_line_coord_space.sql'],
];

const REQUIRED_EXTENSIONS_SQL = String.raw`
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
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
    const detail = (result.stderr + '\\n' + result.stdout).trim();
    throw new Error(description + ' failed' + (detail ? ': ' + detail : ''));
  }
  return result;
}

function localConfig(projectId) {
  return [
    'project_id = "' + projectId + '"',
    '',
    '[api]',
    'enabled = true',
    'port = 56321',
    '',
    '[db]',
    'port = 56322',
    'shadow_port = 56320',
    'major_version = 17',
    '',
    '[db.migrations]',
    'enabled = true',
    '',
    '[db.seed]',
    'enabled = false',
    '',
    '[realtime]',
    'enabled = false',
    '',
    '[studio]',
    'enabled = false',
    '',
    '[storage]',
    'enabled = true',
    '',
    '[auth]',
    'enabled = true',
    '',
    '[edge_runtime]',
    'enabled = false',
    '',
    '[analytics]',
    'enabled = false',
  ].join('\n') + '\n';
}

function createDisposableProject() {
  const projectRoot = fs.mkdtempSync(tempRootPrefix);
  const projectId = 'collabboard-knowledge-rollout-' + crypto.randomBytes(5).toString('hex');
  const supabaseRoot = path.join(projectRoot, 'supabase');
  const migrationsDir = path.join(supabaseRoot, 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.writeFileSync(path.join(supabaseRoot, 'config.toml'), localConfig(projectId));
  fs.copyFileSync(baselineSnapshot, path.join(migrationsDir, '20260705000000_baseline_snapshot.sql'));
  fs.writeFileSync(path.join(migrationsDir, '20260704000000_required_extensions.sql'), REQUIRED_EXTENSIONS_SQL);

  for (const [source, target] of PREREQUISITE_MIGRATIONS) {
    fs.copyFileSync(path.join(sourceMigrations, source), path.join(migrationsDir, target));
  }

  return { projectRoot, projectId };
}

function databaseContainer(projectId) {
  const result = requireSuccess(
    run('docker', ['ps', '--filter', 'name=supabase_db_' + projectId, '--format', '{{.Names}}']),
    'Local database container lookup',
  );
  const name = result.stdout.trim().split(/\r?\n/).find(Boolean);
  if (!name) throw new Error('No local database container found for ' + projectId);
  return name;
}

function runSqlResult(container, sql, extraArgs = []) {
  return run(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extraArgs],
    { input: sql },
  );
}

function runSql(container, sql, description = 'Local SQL validation') {
  return requireSuccess(runSqlResult(container, sql), description).stdout;
}

function localStatus(projectRoot) {
  const result = requireSuccess(
    run('supabase', ['status', '-o', 'env', '--workdir', projectRoot]),
    'Local Supabase status lookup',
  );
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  const hostname = new URL(values.API_URL).hostname;
  if (!['127.0.0.1', 'localhost'].includes(hostname)) {
    throw new Error('Refusing non-loopback Supabase URL: ' + hostname);
  }
  return values;
}

function snapshotSql() {
  return String.raw`
SELECT json_build_object(
    'knowledge_tables', (
        SELECT count(*)
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'knowledge_documents',
              'knowledge_pages',
              'knowledge_chunks',
              'source_references'
          )
          AND c.relkind = 'r'
    ),
    'knowledge_bucket', EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'knowledge-documents'
    ),
    'knowledge_rpcs', (
        SELECT count(*)
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'complete_knowledge_extraction',
              'claim_knowledge_extraction',
              'renew_knowledge_processing_lease',
              'fail_knowledge_extraction',
              'list_knowledge_processing_candidates'
          )
    )
)::text AS snapshot;
`;
}

function dataSnapshotSql() {
  return String.raw`
SELECT json_build_object(
    'documents', (SELECT count(*) FROM public.knowledge_documents),
    'pages', (SELECT count(*) FROM public.knowledge_pages),
    'chunks', (SELECT count(*) FROM public.knowledge_chunks),
    'references', (SELECT count(*) FROM public.source_references)
)::text AS data_snapshot;
`;
}

function productionSmokeSql() {
  return String.raw`
DO $smoke$
DECLARE
    smoke_document_id constant uuid := '00000000-0000-0000-0000-000000009001';
    smoke_board_id constant uuid := '00000000-0000-0000-0000-000000009002';
    smoke_user_id constant uuid := '00000000-0000-0000-0000-000000009003';
    smoke_padlet_id constant uuid := '00000000-0000-0000-0000-000000009004';
    first_claim jsonb;
    second_claim jsonb;
    completed jsonb;
    lease_token uuid;
    candidate_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'knowledge-documents' AND public = false
    ) THEN
        RAISE EXCEPTION 'P4 storage smoke failed: Knowledge bucket is not private';
    END IF;

    INSERT INTO auth.users (
        id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
    )
    VALUES (
        smoke_user_id, 'authenticated', 'authenticated',
        'knowledge-rollout@example.invalid', 'not-a-password',
        now(), now(), now()
    );

    INSERT INTO public.boards (id, user_id, title)
    VALUES (smoke_board_id, smoke_user_id, 'Knowledge rollout smoke board');

    INSERT INTO public.padlets (id, board_id, title, content, type)
    VALUES (smoke_padlet_id, smoke_board_id, 'Knowledge rollout smoke note', '', 'text');

    INSERT INTO public.knowledge_documents (
        id, board_id, created_by, original_filename, file_size_bytes,
        storage_path, content_sha256
    )
    VALUES (
        smoke_document_id, smoke_board_id, smoke_user_id, 'smoke.pdf', 10,
        'knowledge-rollout-smoke/original.pdf', repeat('a', 64)
    );

    first_claim := public.claim_knowledge_extraction(smoke_document_id, 60);
    IF first_claim->>'status' <> 'claimed' THEN
        RAISE EXCEPTION 'P5C claim smoke failed: %', first_claim;
    END IF;

    lease_token := (first_claim->>'leaseToken')::uuid;
    IF (public.renew_knowledge_processing_lease(smoke_document_id, lease_token, 60)->>'status') <> 'renewed' THEN
        RAISE EXCEPTION 'P5C renew smoke failed';
    END IF;

    SELECT count(*) INTO candidate_count
    FROM public.list_knowledge_processing_candidates(100) AS candidates
    WHERE candidates.document_id = smoke_document_id;
    IF candidate_count <> 0 THEN
        RAISE EXCEPTION 'P5D active-lease discovery smoke failed';
    END IF;

    UPDATE public.knowledge_documents
       SET processing_lease_expires_at = now() - interval '1 second'
     WHERE id = smoke_document_id;

    SELECT count(*) INTO candidate_count
    FROM public.list_knowledge_processing_candidates(100) AS candidates
    WHERE candidates.document_id = smoke_document_id;
    IF candidate_count <> 1 THEN
        RAISE EXCEPTION 'P5D expired-lease discovery smoke failed';
    END IF;

    second_claim := public.claim_knowledge_extraction(smoke_document_id, 60);
    IF second_claim->>'status' <> 'claimed'
       OR (second_claim->>'attempt')::integer <> 2 THEN
        RAISE EXCEPTION 'P5C reclaim smoke failed: %', second_claim;
    END IF;

    completed := public.complete_knowledge_extraction(
        smoke_document_id,
        (second_claim->>'leaseToken')::uuid,
        1,
        '[{"page_number":1,"width_points":612,"height_points":792,"rotation":0,"text":"rollout smoke","text_hash":"smoke"}]'::jsonb,
        'rollout-smoke-parser',
        '1',
        NULL,
        NULL,
        repeat('a', 64)
    );

    IF completed->>'status' <> 'completed'
       OR NOT EXISTS (
           SELECT 1
           FROM public.knowledge_documents
           WHERE id = smoke_document_id AND processing_status = 'ready'
       )
       OR (SELECT count(*) FROM public.knowledge_pages WHERE document_id = smoke_document_id) <> 1 THEN
        RAISE EXCEPTION 'P5A completion smoke failed: %', completed;
    END IF;

    DELETE FROM public.knowledge_documents WHERE id = smoke_document_id;
    DELETE FROM public.padlets WHERE id = smoke_padlet_id;
    DELETE FROM public.boards WHERE id = smoke_board_id;
    DELETE FROM auth.users WHERE id = smoke_user_id;
END
$smoke$;
`;
}

function runRollout(projectRoot, projectId) {
  requireSuccess(run('supabase', ['start', '--workdir', projectRoot]), 'Disposable Supabase start');
  const container = databaseContainer(projectId);
  localStatus(projectRoot);

  const before = runSql(container, snapshotSql(), 'Pre-rollout snapshot').trim();
  const rollout = fs.readFileSync(rolloutPath, 'utf8');
  requireSuccess(runSqlResult(container, rollout), 'Production-style Knowledge rollout');

  const verify = fs.readFileSync(verifyPath, 'utf8');
  const verificationOutput = runSql(container, verify, 'Production rollout verification');
  if (!verificationOutput.includes('rollout_readiness')) {
    throw new Error('Verification SQL did not emit rollout_readiness');
  }

  runSql(container, productionSmokeSql(), 'Post-rollout functional SQL smoke');
  const dataAfterFirstRun = runSql(container, dataSnapshotSql(), 'Post-rollout data snapshot').trim();

  const secondRun = runSqlResult(container, rollout);
  if (secondRun.status === 0) {
    throw new Error('Second rollout unexpectedly succeeded');
  }
  if (!/preflight failed/i.test(secondRun.stdout + '\\n' + secondRun.stderr)) {
    throw new Error('Second rollout did not fail at preflight: ' + secondRun.stderr);
  }

  const after = runSql(container, snapshotSql(), 'Post-rerun snapshot').trim();
  if (before === after) {
    throw new Error('Rollout snapshot did not change after the first application');
  }

  const finalDataSnapshot = runSql(container, dataSnapshotSql(), 'Final data snapshot').trim();
  if (dataAfterFirstRun !== finalDataSnapshot) {
    throw new Error('Second rollout changed table data');
  }

  return {
    projectId,
    localApiVerified: true,
    preRolloutSnapshot: before,
    verificationRan: true,
    functionalSmoke: true,
    secondRunRefusedAtPreflight: true,
    secondRunSnapshotUnchanged: true,
    secondRunDataUnchanged: true,
  };
}

function stopProject(projectId) {
  run('supabase', ['stop', '--project-id', projectId, '--no-backup']);
}

const { projectRoot, projectId } = createDisposableProject();
try {
  const report = runRollout(projectRoot, projectId);
  console.log(JSON.stringify(report, null, 2));
} finally {
  stopProject(projectId);
  fs.rmSync(projectRoot, { recursive: true, force: true });
}
