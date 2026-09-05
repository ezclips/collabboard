/**
 * IMAGE-LIBRARY-1-C1 -- idempotency must not bypass authorization.
 *
 * These run against a DISPOSABLE LOCAL scratch database. Source-string
 * assertions cannot prove an authorization property, and the defect this file
 * exists for slipped past exactly such a test: the first version of the RPC
 * answered a retry before it had established anything about the caller, so a
 * board VIEWER could replay any image card id and receive the CREATOR's private
 * library_items id.
 *
 * Every actor, board and image here is synthetic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const DB = 'image_library_c1_scratch';
const SCRATCH = ADMIN.replace(/\/postgres$/, `/${DB}`);

const OWNER = 'a2000000-0000-0000-0000-0000000000a1';
const EDITOR_A = 'a2000000-0000-0000-0000-0000000000a2';
const EDITOR_B = 'a2000000-0000-0000-0000-0000000000a3';
const VIEWER = 'a2000000-0000-0000-0000-0000000000a4';
const COMMENTER = 'a2000000-0000-0000-0000-0000000000a5';
const STRANGER = 'a2000000-0000-0000-0000-0000000000a6';
const BOARD = 'b2000000-0000-0000-0000-0000000000b1';
const OTHER_BOARD = 'b2000000-0000-0000-0000-0000000000b2';
const IMAGE = 'https://synthetic.test/area.webp';

/** Only what these functions touch, so the scratch database stays small. */
const FIXTURE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.boards (id uuid PRIMARY KEY, title text NOT NULL, user_id uuid);
CREATE TABLE public.board_collaborators (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.library_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, title text, description text, type text, content jsonb,
  thumbnail_url text, is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.padlets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES public.boards(id) ON DELETE CASCADE, canvas_id uuid,
  title text, content text, type varchar DEFAULT 'text',
  position_x double precision, position_y double precision,
  width double precision, height double precision,
  file_url text, metadata jsonb);
INSERT INTO auth.users (id) VALUES
  ('${OWNER}'),('${EDITOR_A}'),('${EDITOR_B}'),('${VIEWER}'),('${COMMENTER}'),('${STRANGER}');
INSERT INTO public.boards VALUES ('${BOARD}','b1','${OWNER}'), ('${OTHER_BOARD}','b2','${EDITOR_A}');
INSERT INTO public.board_collaborators (board_id, user_id, role) VALUES
  ('${BOARD}','${EDITOR_A}','editor'), ('${BOARD}','${EDITOR_B}','editor'),
  ('${BOARD}','${VIEWER}','viewer'), ('${BOARD}','${COMMENTER}','commenter');`;

let admin: Client; let db: Client;

const migration = (file: string) =>
  fs.readFileSync(path.join(ROOT, 'supabase/migrations', file), 'utf8');

/** Returns the library id on success, or the thrown message on refusal. */
async function call(actor: string | null, padletId: string, boardId: string, asUser: string) {
  // `actor` is the JWT subject: null models the trusted route's service_role
  // call, where auth.uid() is absent and p_user_id is the delegated identity.
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor ?? '']);
  try {
    const { rows } = await db.query(
      `SELECT * FROM public.create_image_post_with_library_item($1,$2,$3,'syn','',
       0,0,10,10,$4,'{"imageUrl":"${IMAGE}"}'::jsonb)`,
      [padletId, boardId, asUser, IMAGE],
    );
    return { ok: true as const, libraryItemId: rows[0].library_item_id as string };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

const counts = async () => {
  const { rows } = await db.query(
    'SELECT (SELECT count(*) FROM public.padlets) AS padlets,'
    + ' (SELECT count(*) FROM public.library_items) AS library');
  return { padlets: Number(rows[0].padlets), library: Number(rows[0].library) };
};

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  db = new Client({ connectionString: SCRATCH });
  await db.connect();
  await db.query(FIXTURE);
  // Both migrations, in order: the relationship, then the hardening.
  await db.query(migration('20260905090000_add_padlet_library_item.sql'));
  await db.query(migration('20260905100000_harden_image_post_library_idempotency.sql'));
}, 120_000);

afterAll(async () => {
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin?.end();
});

beforeEach(async () => {
  await db.query('DELETE FROM public.padlets; DELETE FROM public.library_items');
});

const P1 = 'c2000000-0000-0000-0000-000000000001';
const P2 = 'c2000000-0000-0000-0000-000000000002';

describe('IMAGE-LIBRARY-1-C1 RPC authorization', () => {
  it('1-2. an authorized creator may create, and may retry to the SAME pair', async () => {
    for (const actor of [OWNER, EDITOR_A]) {
      await db.query('DELETE FROM public.padlets; DELETE FROM public.library_items');
      const first = await call(actor, P1, BOARD, actor);
      expect(first.ok, actor).toBe(true);
      const retry = await call(actor, P1, BOARD, actor);
      expect(retry.ok, actor).toBe(true);
      // 12. a genuine retry is a no-op, not a second object.
      expect(retry.ok && retry.libraryItemId).toBe(first.ok && first.libraryItemId);
      expect(await counts()).toEqual({ padlets: 1, library: 1 });
    }
  });

  it('3-5. a viewer, commenter or stranger replaying an id is refused, and learns nothing',
    async () => {
      const created = await call(OWNER, P1, BOARD, OWNER);
      expect(created.ok).toBe(true);
      const secret = created.ok ? created.libraryItemId : '';
      for (const actor of [VIEWER, COMMENTER, STRANGER]) {
        const replay = await call(actor, P1, BOARD, actor);
        expect(replay.ok, actor).toBe(false);
        // 11. the refusal discloses no identity at all.
        expect(replay.ok === false && replay.message, actor).not.toContain(secret);
        expect(replay.ok === false && replay.message, actor).not.toContain(OWNER);
        expect(replay.ok === false && replay.message, actor).not.toContain(IMAGE);
      }
      expect(await counts()).toEqual({ padlets: 1, library: 1 });
    });

  it('6. board write permission is not a claim on another creator\'s retry token', async () => {
    // Editor B may write this board, and still may not replay Editor A's id.
    const a = await call(EDITOR_A, P1, BOARD, EDITOR_A);
    expect(a.ok).toBe(true);
    const b = await call(EDITOR_B, P1, BOARD, EDITOR_B);
    expect(b.ok).toBe(false);
    expect(b.ok === false && b.message).not.toContain(a.ok && a.libraryItemId);
  });

  it('7. an authenticated caller may not nominate another user', async () => {
    const forged = await call(EDITOR_A, P1, BOARD, OWNER);
    expect(forged.ok).toBe(false);
    expect(await counts()).toEqual({ padlets: 0, library: 0 });
  });

  it('8-9. service_role delegation is checked, not trusted', async () => {
    // auth.uid() is absent here, exactly as when the route calls in. RLS is not
    // doing the work: the function itself has to authorize the delegated actor.
    for (const actor of [VIEWER, COMMENTER, STRANGER]) {
      expect((await call(null, P1, BOARD, actor)).ok, actor).toBe(false);
    }
    expect((await call(null, P1, BOARD, EDITOR_A)).ok).toBe(true);
    expect((await call(null, P2, BOARD, OWNER)).ok).toBe(true);
  });

  it('10. an existing id from another board is refused, not answered', async () => {
    const created = await call(OWNER, P1, BOARD, OWNER);
    expect(created.ok).toBe(true);
    // Editor A owns OTHER_BOARD, so board authority passes -- the placement
    // simply is not theirs, on this board, to retry.
    const crossBoard = await call(EDITOR_A, P1, OTHER_BOARD, EDITOR_A);
    expect(crossBoard.ok).toBe(false);
    expect(crossBoard.ok === false && crossBoard.message)
      .not.toContain(created.ok && created.libraryItemId);
  });

  it('13-14. creation is still atomic: a failing placement leaves no Library row', async () => {
    await db.query(`CREATE FUNCTION public.c1_boom() RETURNS trigger LANGUAGE plpgsql AS
      $f$ BEGIN RAISE EXCEPTION 'synthetic placement failure'; END $f$`);
    await db.query('CREATE TRIGGER c1_boom BEFORE INSERT ON public.padlets '
      + 'FOR EACH ROW EXECUTE FUNCTION public.c1_boom()');
    try {
      const doomed = await call(OWNER, P1, BOARD, OWNER);
      expect(doomed.ok).toBe(false);
      expect(await counts()).toEqual({ padlets: 0, library: 0 });
    } finally {
      await db.query('DROP TRIGGER c1_boom ON public.padlets');
      await db.query('DROP FUNCTION public.c1_boom()');
    }
    // And the ordinary path still works once the failure is gone.
    expect((await call(OWNER, P1, BOARD, OWNER)).ok).toBe(true);
    expect(await counts()).toEqual({ padlets: 1, library: 1 });
  });
});

describe('IMAGE-LIBRARY-REUSE-LINK-1 placing an existing Library Image', () => {
  const REUSE = 'c2000000-0000-0000-0000-0000000000e1';
  const REUSE2 = 'c2000000-0000-0000-0000-0000000000e2';

  /** What the reuse drop does: a placement row, and NO library_items write. */
  const place = (padletId: string, libraryItemId: string | null) => db.query(
    `INSERT INTO public.padlets (id, board_id, title, type, file_url, metadata, library_item_id)
     VALUES ($1::uuid, $2::uuid, 'reused', 'image', $3, '{}'::jsonb, $4::uuid)`,
    [padletId, BOARD, IMAGE, libraryItemId]);

  it('1-4. reuse links the SAME durable object and never creates a second one', async () => {
    const created = await call(OWNER, P1, BOARD, OWNER);
    expect(created.ok).toBe(true);
    const libraryId = created.ok ? created.libraryItemId : '';
    const before = await counts();
    expect(before.library).toBe(1);

    await place(REUSE, libraryId);
    await place(REUSE2, libraryId);

    const after = await counts();
    // One Library object, three placements (the original plus two reuses).
    expect(after.library).toBe(before.library);
    expect(after.padlets).toBe(before.padlets + 2);
    const { rows } = await db.query(
      'SELECT id, library_item_id, file_url FROM public.padlets WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[REUSE, REUSE2]]);
    expect(rows.map((r) => r.library_item_id)).toEqual([libraryId, libraryId]);
    // Same durable asset on every placement -- nothing was re-uploaded.
    expect(rows.map((r) => r.file_url)).toEqual([IMAGE, IMAGE]);
    // Each placement keeps its own board-local identity.
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('6-7. delete semantics survive reuse in both directions', async () => {
    const created = await call(OWNER, P1, BOARD, OWNER);
    const libraryId = created.ok ? created.libraryItemId : '';
    await place(REUSE, libraryId);
    await place(REUSE2, libraryId);

    // Removing one placement leaves the Library object and the others.
    await db.query('DELETE FROM public.padlets WHERE id = $1::uuid', [REUSE]);
    expect((await counts()).library).toBe(1);
    const still = await db.query(
      'SELECT library_item_id FROM public.padlets WHERE id = $1::uuid', [REUSE2]);
    expect(still.rows[0].library_item_id).toBe(libraryId);

    // Removing the Library object leaves every placement standing, link nulled,
    // and their own snapshot still renderable.
    await db.query('DELETE FROM public.library_items WHERE id = $1::uuid', [libraryId]);
    const after = await db.query(
      'SELECT library_item_id, file_url FROM public.padlets WHERE id = $1::uuid', [REUSE2]);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].library_item_id).toBeNull();
    expect(after.rows[0].file_url).toBe(IMAGE);
  });

  it('a placement with no durable link is still valid', async () => {
    // An older drag, or a snapshot with no row behind it: the column is
    // nullable precisely so this keeps working.
    await place(REUSE, null);
    const { rows } = await db.query(
      'SELECT library_item_id, file_url FROM public.padlets WHERE id = $1::uuid', [REUSE]);
    expect(rows[0].library_item_id).toBeNull();
    expect(rows[0].file_url).toBe(IMAGE);
  });
});
