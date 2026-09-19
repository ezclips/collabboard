/**
 * SYNCED_NOTE_PAIR_UPDATED_AT_1 -- a synced Note save moves the row's change
 * signal.
 *
 * `padlets.updated_at` is the only signal a post carries that it changed, and
 * there is no trigger on padlets that supplies one. The pair function set
 * title, content and metadata and left it alone, so an edited synced Note read
 * as unedited to every consumer that watches the column.
 *
 * WHY THIS RUNS AGAINST A REAL ENGINE, like its 20260913120000 sibling. A
 * source assertion can say the file contains `updated_at = now()`. It cannot
 * say the server ends up executing it, that BOTH members take the stamp, or
 * that a refused call leaves every timestamp where it was -- and the grant
 * defect on 20260919120000 was precisely a statement that was present in the
 * file, matched by a source assertion, and inert against the server.
 *
 * The fixture is the 20260913120000 one plus the column under test. Actors,
 * boards and Notes are synthetic; RLS is on and the role is `authenticated`,
 * because the function is SECURITY INVOKER and a superuser run would prove
 * nothing.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const DB = 'synced_note_pair_stamp_scratch';
const SCRATCH = ADMIN.replace(/\/postgres$/, `/${DB}`);

const MIGRATION = 'supabase/migrations/20260919130000_synced_note_pair_stamps_updated_at.sql';
const ROLLOUT = 'supabase/production-rollouts/20260919130000_synced_note_pair_stamps_updated_at.sql';
const VERIFY = 'supabase/production-rollouts/20260919130000_synced_note_pair_stamps_updated_at_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260919130000_synced_note_pair_stamps_updated_at_rollback.sql';
const PRIOR = 'supabase/migrations/20260913120000_update_synced_note_pair.sql';
const PRIOR_VERIFY = 'supabase/production-rollouts/20260913120000_synced_note_pair_atomic_update_verify.sql';

const OWNER = 'a5000000-0000-4000-8000-0000000000a1';
const EDITOR = 'a5000000-0000-4000-8000-0000000000a2';
const VIEWER = 'a5000000-0000-4000-8000-0000000000a3';
const BOARD = 'b5000000-0000-4000-8000-0000000000b1';
const A = 'c5000000-0000-4000-8000-0000000000c1';
const B = 'c5000000-0000-4000-8000-0000000000c2';
const LONE = 'c5000000-0000-4000-8000-0000000000c3';

/** A time far enough back that no clock skew could produce it. */
const STALE = '2020-01-01T00:00:00Z';

const read = (file: string) =>
  fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

/**
 * prosrc is stored verbatim as whatever sits between the dollar quotes -- the
 * leading and trailing newlines included. Calibrated against the digests the
 * 20260913120000 verify file already carries, which this suite re-derives
 * below rather than trusting.
 */
const bodyOf = (sql: string) => sql.slice(sql.indexOf('AS $$') + 5, sql.lastIndexOf('$$;'));
const digestsOf = (sql: string) => {
  const lf = bodyOf(sql);
  return [
    createHash('md5').update(lf, 'utf8').digest('hex'),
    createHash('md5').update(lf.replace(/\n/g, '\r\n'), 'utf8').digest('hex'),
  ];
};
/** The md5 literals a verify file accepts, in file order. */
const acceptedDigests = (verify: string) =>
  (verify.match(/'([0-9a-f]{32})'/g) ?? []).map((q) => q.slice(1, -1));

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
CREATE TABLE public.padlets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES public.boards(id) ON DELETE CASCADE, canvas_id uuid,
  title text, content text, type varchar(50) DEFAULT 'text',
  position_x double precision, position_y double precision,
  width double precision, height double precision,
  file_url text, metadata jsonb,
  -- The column under test, with the production default and type. NO TRIGGER:
  -- production has none either, which is the whole reason the statement has to
  -- carry the stamp itself.
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
INSERT INTO auth.users (id) VALUES ('${OWNER}'),('${EDITOR}'),('${VIEWER}');
INSERT INTO public.boards VALUES ('${BOARD}','b1','${OWNER}');
INSERT INTO public.board_collaborators (board_id, user_id, role) VALUES
  ('${BOARD}','${EDITOR}','editor'), ('${BOARD}','${VIEWER}','viewer');

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON auth.users TO authenticated;

ALTER TABLE public.padlets ENABLE ROW LEVEL SECURITY;
CREATE POLICY padlets_select ON public.padlets FOR SELECT TO authenticated USING (
  (board_id IS NOT NULL AND board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()))
  OR (board_id IS NOT NULL AND board_id IN (
        SELECT board_id FROM public.board_collaborators WHERE user_id = auth.uid())));
CREATE POLICY padlets_update ON public.padlets FOR UPDATE TO authenticated USING (
  (board_id IS NOT NULL AND board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()))
  OR (board_id IS NOT NULL AND board_id IN (
        SELECT board_id FROM public.board_collaborators
         WHERE user_id = auth.uid() AND role = 'editor')));
`;

let admin: Client;
let db: Client;

async function call(actor: string, padletId: string, title = 'synced title', content = 'synced body') {
  await db.query('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor]);
  await db.query('SET ROLE authenticated');
  try {
    await db.query(
      'SELECT * FROM public.update_synced_note_pair($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb)',
      [padletId, BOARD, title, content, '{}', '{}'],
    );
    return { ok: true as const, code: '' };
  } catch (error) {
    return { ok: false as const, code: (error as { code?: string }).code ?? '' };
  } finally {
    await db.query('RESET ROLE');
  }
}

/** Read with full privilege, so no policy can hide a mutation. */
async function stamps() {
  await db.query('RESET ROLE');
  const { rows } = await db.query(
    'SELECT id, title, updated_at FROM public.padlets ORDER BY id',
  );
  return new Map((rows as Array<{ id: string; title: string; updated_at: Date }>).map((r) => [r.id, r]));
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  db = new Client({ connectionString: SCRATCH });
  await db.connect();
  await db.query(FIXTURE);
  // The PRODUCTION ROLLOUT is what ships, so it is what is exercised.
  await db.query(read(ROLLOUT));
}, 120_000);

afterAll(async () => {
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin?.end();
});

beforeEach(async () => {
  await db.query('RESET ROLE');
  await db.query('DELETE FROM public.padlets');
  await db.query(
    `INSERT INTO public.padlets (id, board_id, title, content, type, metadata, updated_at) VALUES
     ($1::uuid,$3::uuid,'A','body a','text',
       jsonb_build_object('syncedWith',$2::text,'parentId','container-a'),$5::timestamptz),
     ($2::uuid,$3::uuid,'B','body b','text',
       jsonb_build_object('syncedWith',$1::text,'parentId','container-b'),$5::timestamptz),
     ($4::uuid,$3::uuid,'Lone','body lone','text','{}'::jsonb,$5::timestamptz)`,
    [A, B, BOARD, LONE, STALE],
  );
});

describe('the stamp, against a real engine', () => {
  it('BOTH members of the pair take a new updated_at', async () => {
    const before = await stamps();
    expect(before.get(A)!.updated_at.toISOString()).toBe(new Date(STALE).toISOString());

    const result = await call(OWNER, A);
    expect(result.ok).toBe(true);

    const after = await stamps();
    for (const id of [A, B]) {
      expect(
        after.get(id)!.updated_at.getTime(),
        `${id} moved forward`,
      ).toBeGreaterThan(before.get(id)!.updated_at.getTime());
    }
  });

  it('both stamps are the SAME instant -- one transaction, one truth', async () => {
    await call(OWNER, A);
    const after = await stamps();
    // now() is transaction time, not statement or clock time. A pair that
    // moves together must not record two different moments of moving.
    expect(after.get(A)!.updated_at.getTime()).toBe(after.get(B)!.updated_at.getTime());
  });

  it('the edit still lands -- the stamp did not displace title or content', async () => {
    await call(OWNER, A, 'edited title', 'edited body');
    const { rows } = await db.query('SELECT id, title, content FROM public.padlets ORDER BY id');
    for (const row of rows as Array<{ id: string; title: string; content: string }>) {
      if (row.id === LONE) continue;
      expect(row.title).toBe('edited title');
      expect(row.content).toBe('edited body');
    }
  });

  it('an unrelated Note keeps its timestamp', async () => {
    const before = await stamps();
    await call(OWNER, A);
    const after = await stamps();
    expect(after.get(LONE)!.updated_at.getTime()).toBe(before.get(LONE)!.updated_at.getTime());
  });

  it('an editor collaborator stamps too -- authority, not ownership, is the test', async () => {
    const before = await stamps();
    expect((await call(EDITOR, A)).ok).toBe(true);
    const after = await stamps();
    expect(after.get(A)!.updated_at.getTime()).toBeGreaterThan(before.get(A)!.updated_at.getTime());
  });

  it('a REFUSED call moves no timestamp at all', async () => {
    const before = await stamps();
    const result = await call(VIEWER, A);
    expect(result.ok).toBe(false);
    expect(result.code, 'refused as insufficient privilege').toBe('42501');

    const after = await stamps();
    // The refusal is the point: a stamp that survived a rejected save would be
    // a change signal with no change behind it, which is worse than none.
    for (const id of [A, B, LONE]) {
      expect(after.get(id)!.updated_at.getTime(), id).toBe(before.get(id)!.updated_at.getTime());
    }
  });
});

describe('the artifacts cannot drift apart', () => {
  it('the migration and the production rollout are byte-identical', () => {
    expect(read(ROLLOUT)).toBe(read(MIGRATION));
  });

  it("the verify file's digests are the migration body's, in BOTH line endings", () => {
    // The digest is the whole authority of that verify file. If it is ever
    // computed from a body nobody applied, every row below it is decoration.
    expect(acceptedDigests(read(VERIFY))).toEqual(digestsOf(read(MIGRATION)));
  });

  it('the verify file does NOT accept the pre-stamp body', () => {
    const accepted = acceptedDigests(read(VERIFY));
    for (const stale of digestsOf(read(PRIOR))) {
      expect(accepted, 'the body without the stamp must fail this verify').not.toContain(stale);
    }
  });

  it('the rollback restores exactly the previously reviewed body', () => {
    // Not "an earlier body" -- the one the 20260913120000 verify file already
    // vouches for, so a rolled-back database passes that file unchanged.
    expect(digestsOf(read(ROLLBACK))).toEqual(digestsOf(read(PRIOR)));
    expect(acceptedDigests(read(PRIOR_VERIFY))).toEqual(digestsOf(read(ROLLBACK)));
  });

  it('the stamp is one added assignment, and nothing else changed in the body', () => {
    // The authorization argument is inherited from the reviewed body, so the
    // diff has to be small enough that inheriting it is honest.
    const stripped = bodyOf(read(MIGRATION))
      .replace(/^.*SYNCED_NOTE_PAIR_UPDATED_AT_1.*$\n/m, '')
      .replace(/^\s*--.*$\n/gm, '')
      .replace(/^\s*updated_at = now\(\)\n/m, '')
      .replace(/metadata = n\.meta,\n/, 'metadata = n.meta\n');
    const prior = bodyOf(read(PRIOR)).replace(/^\s*--.*$\n/gm, '');
    expect(stripped).toBe(prior);
  });
});
