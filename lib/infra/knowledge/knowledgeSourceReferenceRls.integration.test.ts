import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * P6J-F4-C: database-level proof that source_references RLS protects the write
 * path on its own. F4-A owns the domain authorization and F4-B composes the
 * authenticated client; neither is invoked here. Every access-control assertion
 * runs through a real local JWT session so a regression in the application layer
 * would still be stopped by PostgreSQL.
 *
 * Bootstrap (scripts/db/bootstrap-local.mjs) owns the disposable stack: it
 * starts it, writes the env file, runs this test, and destroys the project.
 * Without that env file the suite skips, exactly like its Knowledge siblings.
 */
const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack
  ? JSON.parse(fs.readFileSync(envPath, 'utf8'))
  : {};

const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost'];

/** Fails closed: no client may be constructed against a non-loopback host. */
function requireLoopbackUrl(value: string): string {
  const { hostname } = new URL(value);
  if (!LOOPBACK_HOSTNAMES.includes(hostname)) {
    throw new Error(`Refusing a non-loopback Supabase URL: ${hostname}`);
  }
  return value;
}

/**
 * pg_catalog is not reachable through PostgREST, so RLS metadata is read the
 * same way the bootstrap reads it: psql inside the disposable container. Read
 * only -- this test never alters a policy.
 */
function disposableDatabaseContainer(): string {
  const output = execFileSync(
    'docker',
    ['ps', '--filter', 'name=supabase_db_collabboard-baseline-', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  const name = output.trim().split(/\r?\n/).find(Boolean);
  if (!name) throw new Error('No disposable local Supabase database container is running');
  return name;
}

function catalogQuery(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', disposableDatabaseContainer(), 'psql', '-U', 'postgres', '-d', 'postgres',
      '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

/** One run's marker namespace, so row accounting can never see another run. */
const RUN = randomUUID();
const PASSWORD = `Pw-${randomUUID()}-9z`;
const marker = (role: string) => `${RUN}:${role}`;

interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly client: SupabaseClient;
}

const RLS_DENIED = '42501';

describe.skipIf(!hasLocalStack)('P6J-F4-C source_references RLS -- authenticated local Supabase', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  const createdUserIds: string[] = [];

  const boardA = randomUUID();
  const boardB = randomUUID();
  const padletA = randomUUID();
  const padletB = randomUUID();
  const documentA = randomUUID();
  const documentB = randomUUID();

  /**
   * The harness fixture users carry encrypted_password='not-a-password' and so
   * cannot sign in. Real sessions require users minted through the local Admin
   * API, which is the only reason service role appears in setup at all.
   */
  async function createAuthenticatedUser(role: string): Promise<TestUser> {
    const email = `f4c-${role}-${RUN}@example.invalid`;
    const created = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    expect(created.error, `${role} user creation`).toBeNull();
    const id = created.data.user?.id;
    expect(id, `${role} user id`).toBeTruthy();
    createdUserIds.push(id as string);

    const client = createClient(env.P4_SUPABASE_URL, env.P4_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const session = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(session.error, `${role} sign-in`).toBeNull();
    expect(session.data.session?.access_token, `${role} access token`).toBeTruthy();
    expect(session.data.user?.id, `${role} session identity`).toBe(id);

    return { id: id as string, email, client };
  }

  async function attemptInsert(user: TestUser, role: string, padletId: string, documentId: string) {
    return user.client
      .from('source_references')
      .insert({
        target_padlet_id: padletId,
        source_document_id: documentId,
        page_start: 1,
        page_end: 1,
        quote_text: marker(role),
        quote_hash: null,
        char_start: null,
        char_end: null,
        locator: null,
      })
      .select('id, target_padlet_id, source_document_id, page_start, page_end, quote_text')
      .single();
  }

  /** Verification authority: what the database actually holds, RLS aside. */
  async function markerRows(): Promise<Array<{ id: string; quote_text: string }>> {
    const { data, error } = await service
      .from('source_references')
      .select('id, quote_text')
      .like('quote_text', `${RUN}%`);
    expect(error).toBeNull();
    return (data ?? []) as Array<{ id: string; quote_text: string }>;
  }

  async function visibleMarkers(user: TestUser): Promise<string[]> {
    const { data, error } = await user.client
      .from('source_references')
      .select('quote_text')
      .like('quote_text', `${RUN}%`);
    expect(error).toBeNull();
    return ((data ?? []) as Array<{ quote_text: string }>).map((row) => row.quote_text).sort();
  }

  beforeAll(async () => {
    const url = requireLoopbackUrl(env.P4_SUPABASE_URL);
    service = createClient(url, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    owner = await createAuthenticatedUser('owner');
    editor = await createAuthenticatedUser('editor');
    viewer = await createAuthenticatedUser('viewer');
    outsider = await createAuthenticatedUser('outsider');

    // Both boards belong to OWNER on purpose: the cross-board controls then
    // isolate the same-board rule from the permission rule, because the caller
    // has full write rights on each board taken separately.
    const boards = await service.from('boards').insert([
      { id: boardA, user_id: owner.id, title: `F4C board A ${RUN}` },
      { id: boardB, user_id: owner.id, title: `F4C board B ${RUN}` },
    ]);
    expect(boards.error).toBeNull();

    const collaborators = await service.from('board_collaborators').insert([
      { board_id: boardA, user_id: editor.id, role: 'editor' },
      { board_id: boardA, user_id: viewer.id, role: 'viewer' },
    ]);
    expect(collaborators.error).toBeNull();

    const padlets = await service.from('padlets').insert([
      { id: padletA, board_id: boardA, title: `F4C note A ${RUN}`, content: '', type: 'text' },
      { id: padletB, board_id: boardB, title: `F4C note B ${RUN}`, content: '', type: 'text' },
    ]);
    expect(padlets.error).toBeNull();

    const documents = await service.from('knowledge_documents').insert([
      {
        id: documentA, board_id: boardA, created_by: owner.id, original_filename: `f4c-a-${RUN}.pdf`,
        mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `f4c/${documentA}.pdf`,
        content_sha256: 'a'.repeat(64), processing_status: 'ready', page_count: 3,
      },
      {
        id: documentB, board_id: boardB, created_by: owner.id, original_filename: `f4c-b-${RUN}.pdf`,
        mime_type: 'application/pdf', file_size_bytes: 0, storage_path: `f4c/${documentB}.pdf`,
        content_sha256: 'b'.repeat(64), processing_status: 'ready', page_count: 3,
      },
    ]);
    expect(documents.error).toBeNull();
  });

  afterAll(async () => {
    if (!service) return;
    try {
      await service.from('source_references').delete().like('quote_text', `${RUN}%`);
      await service.from('knowledge_documents').delete().in('id', [documentA, documentB]);
      await service.from('padlets').delete().in('id', [padletA, padletB]);
      await service.from('board_collaborators').delete().in('board_id', [boardA, boardB]);
      await service.from('boards').delete().in('id', [boardA, boardB]);
      for (const userId of createdUserIds) await service.auth.admin.deleteUser(userId);
    } finally {
      const remaining = await service.from('source_references').select('id').like('quote_text', `${RUN}%`);
      expect(remaining.data ?? []).toEqual([]);
      const boards = await service.from('boards').select('id').in('id', [boardA, boardB]);
      expect(boards.data ?? []).toEqual([]);
    }
  });

  it('refuses any Supabase URL that is not loopback', () => {
    expect(LOOPBACK_HOSTNAMES).toContain(new URL(env.P4_SUPABASE_URL).hostname);
    for (const remote of [
      'https://atkgocwwqbjjhitpavei.supabase.co',
      'https://example.supabase.co',
      'http://10.0.0.5:54321',
      'http://localhost.evil.example',
    ]) {
      expect(() => requireLoopbackUrl(remote), remote).toThrow(/non-loopback/);
    }
    expect(requireLoopbackUrl('http://127.0.0.1:56321')).toBe('http://127.0.0.1:56321');
  });

  it('has row level security enabled and both policies present on source_references', () => {
    const output = catalogQuery(`
      SELECT
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.source_references'::regclass)::text,
        (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'source_references'
            AND policyname = 'source_references_select')::text,
        (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'source_references'
            AND policyname = 'source_references_write')::text;
    `);

    const [rowSecurity, selectPolicy, writePolicy] = output.split('|');
    expect(rowSecurity, 'source_references relrowsecurity').toBe('true');
    expect(selectPolicy, 'source_references_select policy').toBe('1');
    expect(writePolicy, 'source_references_write policy').toBe('1');
  });

  it('lets the board owner insert a same-board reference', async () => {
    const { data, error } = await attemptInsert(owner, 'owner', padletA, documentA);

    expect(error).toBeNull();
    expect(data).toMatchObject({
      target_padlet_id: padletA,
      source_document_id: documentA,
      page_start: 1,
      page_end: 1,
      quote_text: marker('owner'),
    });

    const persisted = await owner.client
      .from('source_references')
      .select('id')
      .eq('quote_text', marker('owner'));
    expect(persisted.error).toBeNull();
    expect(persisted.data).toHaveLength(1);
  });

  it('lets a board editor insert a same-board reference', async () => {
    const { data, error } = await attemptInsert(editor, 'editor', padletA, documentA);

    expect(error).toBeNull();
    expect(data).toMatchObject({ quote_text: marker('editor'), source_document_id: documentA });

    const persisted = await editor.client
      .from('source_references')
      .select('id')
      .eq('quote_text', marker('editor'));
    expect(persisted.error).toBeNull();
    expect(persisted.data).toHaveLength(1);
  });

  it('blocks a viewer from writing while leaving the read intact', async () => {
    const { error } = await attemptInsert(viewer, 'viewer', padletA, documentA);

    // 42501 specifically: an RLS refusal, not a broken fixture (which would
    // surface as a foreign-key or not-null violation instead).
    expect(error?.code).toBe(RLS_DENIED);
    expect((await markerRows()).some((row) => row.quote_text === marker('viewer'))).toBe(false);

    // The same viewer is still a legitimate reader of the board's references.
    expect(await visibleMarkers(viewer)).toEqual([marker('editor'), marker('owner')].sort());
  });

  it('blocks an outsider from writing and hides the board entirely', async () => {
    const { error } = await attemptInsert(outsider, 'outsider', padletA, documentA);

    expect(error?.code).toBe(RLS_DENIED);
    expect((await markerRows()).some((row) => row.quote_text === marker('outsider'))).toBe(false);
    expect(await visibleMarkers(outsider)).toEqual([]);
  });

  it('rejects a source document from another board even for that board owner', async () => {
    const { error } = await attemptInsert(owner, 'cross-source', padletA, documentB);

    expect(error?.code).toBe(RLS_DENIED);
    expect((await markerRows()).some((row) => row.quote_text === marker('cross-source'))).toBe(false);
  });

  it('rejects a target padlet from another board even for that board owner', async () => {
    const { error } = await attemptInsert(owner, 'cross-padlet', padletB, documentA);

    expect(error?.code).toBe(RLS_DENIED);
    expect((await markerRows()).some((row) => row.quote_text === marker('cross-padlet'))).toBe(false);
  });

  it('shows the intended read matrix: members read, outsider sees nothing', async () => {
    const expected = [marker('editor'), marker('owner')].sort();

    expect(await visibleMarkers(owner)).toEqual(expected);
    expect(await visibleMarkers(editor)).toEqual(expected);
    expect(await visibleMarkers(viewer)).toEqual(expected);
    expect(await visibleMarkers(outsider)).toEqual([]);
  });

  it('accounts for every attempted write exactly', async () => {
    const rows = await markerRows();
    const count = (role: string) => rows.filter((row) => row.quote_text === marker(role)).length;

    expect(count('owner')).toBe(1);
    expect(count('editor')).toBe(1);
    expect(count('viewer')).toBe(0);
    expect(count('outsider')).toBe(0);
    expect(count('cross-source')).toBe(0);
    expect(count('cross-padlet')).toBe(0);
    expect(rows).toHaveLength(2);
  });
});
