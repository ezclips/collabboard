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
      // F9-B1 region rows carry no quote_text, so the marker sweep cannot see them.
      await service.from('source_references').delete().in('target_padlet_id', [padletA, padletB]);
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

  /**
   * P6J-F9-B1. The region columns carry their own invariants, and PostgreSQL
   * must enforce every one of them without the application layer's help. The
   * CHECK cases run as service role on purpose: RLS is bypassed there, so a
   * rejection can only be the constraint.
   */
  describe('P6J-F9-B1 page region columns', () => {
    const REGION = { region_x: 0.25, region_y: 0.1, region_width: 0.5, region_height: 0.4 };

    const regionRow = (overrides: Record<string, unknown> = {}) => ({
      target_padlet_id: padletA,
      source_document_id: documentA,
      page_start: 1,
      page_end: 1,
      quote_text: null,
      quote_hash: null,
      char_start: null,
      char_end: null,
      ...REGION,
      ...overrides,
    });

    /** Service role: no RLS in the way, so only a CHECK can refuse the row. */
    const serviceInsert = (overrides: Record<string, unknown> = {}) =>
      service.from('source_references').insert(regionRow(overrides)).select('id').single();

    const regionIds: string[] = [];

    afterAll(async () => {
      if (regionIds.length > 0) await service.from('source_references').delete().in('id', regionIds);
    });

    it('D1: the migration added the four region columns as nullable double precision', () => {
      const rows = catalogQuery(
        "SELECT column_name || '|' || data_type || '|' || is_nullable"
        + " FROM information_schema.columns WHERE table_schema = 'public'"
        + " AND table_name = 'source_references' AND column_name LIKE 'region\\_%'"
        + ' ORDER BY column_name',
      ).split('\n').map((line) => line.trim()).filter(Boolean);

      expect(rows).toEqual([
        'region_height|double precision|YES',
        'region_width|double precision|YES',
        'region_x|double precision|YES',
        'region_y|double precision|YES',
      ]);
    });

    it('D1: all four region CHECK constraints exist on the table', () => {
      const names = catalogQuery(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'public.source_references'::regclass"
        + " AND contype = 'c' AND conname LIKE '%region%' ORDER BY conname",
      ).split('\n').map((line) => line.trim()).filter(Boolean);

      expect(names).toEqual([
        'source_references_region_bounds_check',
        'source_references_region_complete_check',
        'source_references_region_single_page_check',
        'source_references_region_text_exclusion_check',
      ]);
    });

    it('D2: a legacy reference with no region still inserts and reads back null', async () => {
      const { data, error } = await service
        .from('source_references')
        .insert({
          target_padlet_id: padletA,
          source_document_id: documentA,
          page_start: 1,
          page_end: 2,
          // Deliberately NOT the RUN marker prefix: this row must not be
          // counted by the write-accounting test above.
          quote_text: 'f9b1-legacy-no-region',
          quote_hash: null,
          char_start: null,
          char_end: null,
        })
        .select('id, region_x, region_y, region_width, region_height')
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        region_x: null, region_y: null, region_width: null, region_height: null,
      });
    });

    it('D3: the board owner and a board editor may both write a region', async () => {
      for (const [role, user] of [['owner', owner], ['editor', editor]] as const) {
        const { data, error } = await user.client
          .from('source_references')
          .insert(regionRow())
          .select('id, region_x, region_y, region_width, region_height')
          .single();

        expect(error, `${role} region insert`).toBeNull();
        expect(data).toMatchObject(REGION);
        regionIds.push((data as { id: string }).id);
      }
    });

    it('D4/D5: a viewer and a cross-board pairing are still refused a region', async () => {
      const asViewer = await viewer.client.from('source_references').insert(regionRow()).select('id').single();
      expect(asViewer.error, 'viewer region write').not.toBeNull();

      const crossDocument = await owner.client
        .from('source_references')
        .insert(regionRow({ source_document_id: documentB }))
        .select('id').single();
      expect(crossDocument.error, 'cross-board document region write').not.toBeNull();

      const crossPadlet = await owner.client
        .from('source_references')
        .insert(regionRow({ target_padlet_id: padletB }))
        .select('id').single();
      expect(crossPadlet.error, 'cross-board padlet region write').not.toBeNull();
    });

    it.each([
      ['D6 a missing width', { region_width: null }],
      ['D6 only an x', { region_y: null, region_width: null, region_height: null }],
      ['D7 a region beside char offsets', { char_start: 3, char_end: 9 }],
      ['D8 a negative x', { region_x: -0.1 }],
      ['D8 a zero width', { region_width: 0 }],
      ['D8 an x beyond the page', { region_x: 1.5 }],
      ['D8 a rectangle running off the right edge', { region_x: 0.7, region_width: 0.5 }],
      ['D8 a rectangle running off the bottom edge', { region_y: 0.7, region_height: 0.5 }],
      ['D8 a NaN edge', { region_x: Number.NaN }],
      ['D8 an infinite width', { region_width: Number.POSITIVE_INFINITY }],
      ['D9 a region spanning two pages', { page_start: 1, page_end: 2 }],
    ])('rejects %s at the database, not merely in the application', async (_label, overrides) => {
      const { data, error } = await serviceInsert(overrides);
      expect(error, 'the CHECK must refuse this row').not.toBeNull();
      // 23514 is check_violation: proof it was a constraint and not RLS.
      expect(error?.code).toBe('23514');
      expect(data).toBeNull();
    });

    it('accepts an edge-touching region, which the float tolerance exists for', async () => {
      const { data, error } = await serviceInsert({
        region_x: 0.5, region_y: 0.5, region_width: 0.5, region_height: 0.5,
      });
      expect(error).toBeNull();
      regionIds.push((data as { id: string }).id);
    });

    it('D10: deleting the target padlet still cascades a region reference away', async () => {
      const padletId = randomUUID();
      const created = await service.from('padlets').insert({
        id: padletId, board_id: boardA, title: `F9B1 cascade ${RUN}`, content: '', type: 'text',
      });
      expect(created.error).toBeNull();

      const inserted = await service
        .from('source_references')
        .insert(regionRow({ target_padlet_id: padletId }))
        .select('id').single();
      expect(inserted.error).toBeNull();
      const referenceId = (inserted.data as { id: string }).id;

      await service.from('padlets').delete().eq('id', padletId);

      const remaining = await service.from('source_references').select('id').eq('id', referenceId);
      expect(remaining.error).toBeNull();
      expect(remaining.data ?? []).toEqual([]);
    });
  });
});
