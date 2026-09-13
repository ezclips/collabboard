/**
 * SYNCED_NOTE_PAIR_ATOMIC_UPDATE_1 -- the pair moves atomically, or not at all.
 *
 * These run against a DISPOSABLE LOCAL scratch database, as a NON-SUPERUSER
 * (`authenticated`) with row level security ENABLED on padlets. That matters:
 * the function is SECURITY INVOKER, so a suite run as `postgres` would silently
 * bypass every policy and prove nothing about the thing being claimed.
 *
 * Source-string assertions cannot establish atomicity, rollback or the absence
 * of a deadlock. Every case below is a real transaction against a real engine.
 *
 * SCOPE OF THE RLS FIXTURE: the `board_id` branches of the production
 * padlets_update / padlets_select policies, which are the branches that govern
 * a board-scoped Note. The canvas_id branches are `canvas_id IS NOT NULL AND
 * ...` and are false for every row here, so they are omitted rather than
 * approximated. Every actor, board and Note is synthetic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const DB = 'synced_note_pair_scratch';
const SCRATCH = ADMIN.replace(/\/postgres$/, `/${DB}`);

const ROLLOUT = 'supabase/production-rollouts/20260913120000_synced_note_pair_atomic_update.sql';
const VERIFY = 'supabase/production-rollouts/20260913120000_synced_note_pair_atomic_update_verify.sql';
const MIGRATION = 'supabase/migrations/20260913120000_update_synced_note_pair.sql';
const OWNER = 'a4000000-0000-4000-8000-0000000000a1';
const EDITOR = 'a4000000-0000-4000-8000-0000000000a2';
const VIEWER = 'a4000000-0000-4000-8000-0000000000a3';
const STRANGER = 'a4000000-0000-4000-8000-0000000000a4';const BOARD = 'b4000000-0000-4000-8000-0000000000b1';
const OTHER_BOARD = 'b4000000-0000-4000-8000-0000000000b2';
const A = 'c4000000-0000-4000-8000-0000000000c1';
const B = 'c4000000-0000-4000-8000-0000000000c2';
const LONE = 'c4000000-0000-4000-8000-0000000000c3';

/** Only what the function touches, so the scratch database stays small. */
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
  file_url text, metadata jsonb);
INSERT INTO auth.users (id) VALUES ('${OWNER}'),('${EDITOR}'),('${VIEWER}'),('${STRANGER}');
INSERT INTO public.boards VALUES ('${BOARD}','b1','${OWNER}'), ('${OTHER_BOARD}','b2','${OWNER}');
INSERT INTO public.board_collaborators (board_id, user_id, role) VALUES
  ('${BOARD}','${EDITOR}','editor'), ('${BOARD}','${VIEWER}','viewer');

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON auth.users TO authenticated;

-- The board_id branches of the production policies, verbatim in structure.
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

let admin: Client; let db: Client; let second: Client;

const read = (file: string) =>
  fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

type Outcome =
  | { ok: true; rows: Array<{ id: string; title: string; content: string; metadata: Record<string, unknown> }> }
  | { ok: false; code: string; message: string };

async function call(
  client: Client, actor: string | null, padletId: string, boardId: string,
  shared: Record<string, unknown> = {}, sourceOnly: Record<string, unknown> = {},
  title = 'synced title', content = 'synced body',
): Promise<Outcome> {
  await client.query('RESET ROLE');
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor ?? '']);
  await client.query('SET ROLE authenticated');
  try {
    const { rows } = await client.query(
      'SELECT * FROM public.update_synced_note_pair($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb)',
      [padletId, boardId, title, content, JSON.stringify(shared), JSON.stringify(sourceOnly)],
    );
    return { ok: true, rows };
  } catch (error) {
    const e = error as { code?: string; message: string };
    return { ok: false, code: e.code ?? '', message: e.message };
  } finally { await client.query('RESET ROLE'); }
}

/** Every row, read with full privilege, so a policy cannot hide a mutation. */
async function snapshot() {
  await db.query('RESET ROLE');
  const { rows } = await db.query(
    'SELECT id, title, content, metadata, board_id, type FROM public.padlets ORDER BY id');
  return rows as Array<{ id: string; title: string; content: string; metadata: Record<string, unknown> }>;
}
const byId = (rows: Awaited<ReturnType<typeof snapshot>>, id: string) => rows.find((r) => r.id === id)!;

const seed = async () => {
  await db.query('RESET ROLE');
  await db.query('DELETE FROM public.padlets');
  await db.query(
    `INSERT INTO public.padlets (id, board_id, title, content, type, metadata) VALUES
     ($1::uuid,$3::uuid,'A','body a','text',
       jsonb_build_object('syncedWith',$2::text,'parentId','container-a','cardColor','#aaaaaa',
                          'reactions',jsonb_build_array('a'),'start_date','2026-01-01')),
     ($2::uuid,$3::uuid,'B','body b','text',
       jsonb_build_object('syncedWith',$1::text,'parentId','container-b','cardColor','#bbbbbb',
                          'reactions',jsonb_build_array('b'),'sectionId','sec-b')),
     ($4::uuid,$3::uuid,'Lone','body lone','text', '{}'::jsonb)`,
    [A, B, BOARD, LONE]);
};

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  db = new Client({ connectionString: SCRATCH });
  second = new Client({ connectionString: SCRATCH });
  await db.connect();
  await second.connect();
  await db.query(FIXTURE);
  // The PRODUCTION ROLLOUT is what ships, so it is what is exercised here.
  await db.query(read(ROLLOUT));
}, 120_000);

afterAll(async () => {
  await db?.end(); await second?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin?.end();
});

beforeEach(seed);

describe('1. a valid reciprocal pair updates together', () => {
  it('title and content land on BOTH members, and both rows come back', async () => {
    const result = await call(db, OWNER, A, BOARD);
    expect(result.ok).toBe(true);
    expect(result.ok && result.rows.map((r) => r.id).sort()).toEqual([A, B].sort());

    const rows = await snapshot();
    for (const id of [A, B]) {
      expect(byId(rows, id).title, id).toBe('synced title');
      expect(byId(rows, id).content, id).toBe('synced body');
    }
    expect(byId(rows, LONE).title, 'an unrelated Note is untouched').toBe('Lone');
  });

  it('shared appearance reaches both; placement and excluded keys stay distinct', async () => {
    await call(db, OWNER, A, BOARD,
      { cardColor: '#cccccc', topStrip: '#111111', parentId: 'HIJACK', syncedWith: 'HIJACK' },
      { reactions: ['edited'], badgeColor: '#facc15' });

    const rows = await snapshot();
    // Synchronized.
    for (const id of [A, B]) {
      expect(byId(rows, id).metadata.cardColor, id).toBe('#cccccc');
      expect(byId(rows, id).metadata.topStrip, id).toBe('#111111');
    }
    // Per-record: the edited member only.
    expect(byId(rows, A).metadata.reactions).toEqual(['edited']);
    expect(byId(rows, B).metadata.reactions).toEqual(['b']);
    expect(byId(rows, A).metadata.badgeColor).toBe('#facc15');
    expect(byId(rows, B).metadata.badgeColor).toBeUndefined();
    // Placement, scheduling and structure: each row keeps its own, and a
    // caller cannot write them through either allowlist.
    expect(byId(rows, A).metadata.parentId).toBe('container-a');
    expect(byId(rows, B).metadata.parentId).toBe('container-b');
    expect(byId(rows, A).metadata.start_date).toBe('2026-01-01');
    expect(byId(rows, B).metadata.sectionId).toBe('sec-b');
    // The link itself is never rewritten from the other member's object.
    expect(byId(rows, A).metadata.syncedWith).toBe(B);
    expect(byId(rows, B).metadata.syncedWith).toBe(A);
  });

  it('scheduler dates are source-only: the twin neither loses, nor inherits, nor is dated by proxy',
    async () => {
      // Phase 1: B already owns a DIFFERENT pair of dates, as two
      // independently scheduled Notes would. Both facts survive one save.
      await db.query(`UPDATE public.padlets SET metadata = metadata
        || '{"start_date":"2099-01-01T00:00:00.000Z","end_date":"2099-01-01T01:00:00.000Z"}'::jsonb
        WHERE id=$1::uuid`, [B]);
      const dates = { start_date: '2026-03-01T09:00:00.000Z', end_date: '2026-03-01T10:00:00.000Z' };
      expect((await call(db, OWNER, A, BOARD, {}, dates)).ok).toBe(true);

      let rows = await snapshot();
      expect(byId(rows, A).metadata.start_date, 'the edited member takes its own defaults').toBe(dates.start_date);
      expect(byId(rows, A).metadata.end_date).toBe(dates.end_date);
      // B keeps ITS dates: not overwritten, and not cleared.
      expect(byId(rows, B).metadata.start_date, 'the twin keeps its own').toBe('2099-01-01T00:00:00.000Z');
      expect(byId(rows, B).metadata.end_date).toBe('2099-01-01T01:00:00.000Z');

      // Phase 2: an UNDATED twin, with the dates offered through the SHARED
      // argument as well -- the one that would reach it if these keys were
      // ever synchronized. They are not, so it must stay undated.
      await seed();
      expect((await call(db, OWNER, A, BOARD, dates, dates)).ok).toBe(true);
      rows = await snapshot();
      expect(byId(rows, A).metadata.start_date).toBe(dates.start_date);
      expect(byId(rows, B).metadata.start_date, 'not dated by proxy').toBeUndefined();
      expect(byId(rows, B).metadata.end_date).toBeUndefined();
      expect(byId(rows, B).metadata.sectionId, 'and keeps its own section').toBe('sec-b');
    });

  it('neither argument can write a structural key onto either member', async () => {
    // The same hostile payload offered through BOTH patches at once.
    const hostile = {
      parentId: 'HIJACK', sectionId: 'HIJACK', syncedWith: LONE,
      childPadletIds: ['HIJACK'], position_x: 999, zIndex: 99, locked: true,
      file_url: 'https://evil.test/x', board_id: OTHER_BOARD,
    };
    const result = await call(db, OWNER, A, BOARD, hostile, hostile);
    expect(result.ok).toBe(true);

    const rows = await snapshot();
    for (const [id, parent] of [[A, 'container-a'], [B, 'container-b']] as const) {
      expect(byId(rows, id).metadata.parentId, id).toBe(parent);
      expect(byId(rows, id).metadata.childPadletIds, id).toBeUndefined();
      expect(byId(rows, id).metadata.position_x, id).toBeUndefined();
      expect(byId(rows, id).metadata.zIndex, id).toBeUndefined();
      expect(byId(rows, id).metadata.locked, id).toBeUndefined();
      expect(byId(rows, id).metadata.file_url, id).toBeUndefined();
    }
    // The link itself is the one that would be catastrophic to let through.
    expect(byId(rows, A).metadata.syncedWith).toBe(B);
    expect(byId(rows, B).metadata.syncedWith).toBe(A);
    expect(byId(rows, B).metadata.sectionId, 'the twin keeps its own section').toBe('sec-b');
  });

  it('a JSON null clears a shared key on both, and only that key', async () => {
    await call(db, OWNER, A, BOARD, { cardColor: null });
    const rows = await snapshot();
    expect(byId(rows, A).metadata.cardColor).toBeUndefined();
    expect(byId(rows, B).metadata.cardColor).toBeUndefined();
    expect(byId(rows, A).metadata.parentId).toBe('container-a');
  });

  it('either member may initiate, and a retry writes the same two rows, creating nothing',
    async () => {
      const before = (await snapshot()).length;
      for (const from of [A, B, A]) {
        expect((await call(db, OWNER, from, BOARD)).ok, from).toBe(true);
      }
      const rows = await snapshot();
      expect(rows.length, 'no row was created by any call').toBe(before);
      expect(byId(rows, A).title).toBe('synced title');
      expect(byId(rows, B).title).toBe('synced title');
    });
});

describe('2. every malformed or foreign pair fails closed, changing nothing', () => {
  const unchanged = async () => {
    const rows = await snapshot();
    expect(byId(rows, A).title, 'A untouched').toBe('A');
    expect(byId(rows, B).title, 'B untouched').toBe('B');
    expect(byId(rows, A).content).toBe('body a');
    expect(byId(rows, B).content).toBe('body b');
  };

  // Each row corrupts the pair one way, then saves. The SQL is data, so the
  // whole table reads as a list of ways a pair can be wrong.
  const cases: Array<[name: string, sql: string, params: unknown[], from: string]> = [
    ['missing twin', 'DELETE FROM public.padlets WHERE id=$1::uuid', [B], A],
    ['non-reciprocal link', "UPDATE public.padlets SET metadata = metadata - 'syncedWith' WHERE id=$1::uuid", [B], A],
    ['twin points at a third record', "UPDATE public.padlets SET metadata = jsonb_set(metadata,'{syncedWith}', to_jsonb($2::text)) WHERE id=$1::uuid", [B, LONE], A],
    ['self-link', "UPDATE public.padlets SET metadata = jsonb_set(metadata,'{syncedWith}', to_jsonb($1::text)) WHERE id=$1::uuid", [A], A],
    ['cross-board pair', 'UPDATE public.padlets SET board_id=$1::uuid WHERE id=$2::uuid', [OTHER_BOARD, B], A],
    ['wrong type on the twin', "UPDATE public.padlets SET type='image' WHERE id=$1::uuid", [B], A],
    ['wrong type on the edited member', "UPDATE public.padlets SET type='drawing' WHERE id=$1::uuid", [A], A],
    ['a NULL type', 'UPDATE public.padlets SET type=NULL WHERE id=$1::uuid', [B], A],
    ['a malformed twin id', `UPDATE public.padlets SET metadata = jsonb_set(metadata,'{syncedWith}','"not-a-uuid"') WHERE id=$1::uuid`, [A], A],
    ['no declared twin at all', '', [], LONE],
  ];

  for (const [name, sql, params, from] of cases) {
    it(`${name}: refused, and neither row changes`, async () => {
      await db.query('RESET ROLE');
      if (sql) await db.query(sql, params);
      const result = await call(db, OWNER, from, BOARD);
      expect(result.ok, name).toBe(false);
      // A legacy pair fails closed. It is NOT repaired or unlinked here.
      expect(!result.ok && result.code, name).toBe('22023');
      expect(!result.ok && result.message, 'the refusal enumerates nothing').toBe(
        'synced_note_pair_invalid');
      if (name !== 'missing twin') await unchanged();
    });
  }
});

describe('2b. what phase 1 enforces about a pair, and what it does not', () => {
  // DELIBERATE AND DOCUMENTED SCOPE. This function enforces a LOCAL invariant:
  // two distinct same-board Notes that point at each other. It does NOT enforce
  // global uniqueness of syncedWith -- no unbounded scan, no uniqueness
  // constraint -- so a stale third record still pointing at a member of a
  // healthy pair neither breaks that pair nor is repaired here. Making
  // syncedWith globally one-to-one belongs to atomic synced-copy creation,
  // paste/import sanitation, and legacy diagnostics.
  const claimA = () => db.query(`UPDATE public.padlets
    SET metadata = jsonb_set(metadata, '{syncedWith}', to_jsonb($2::text))
    WHERE id=$1::uuid`, [LONE, A]);

  it('a stale C->A pointer neither blocks the A<->B save nor is touched by it', async () => {
    await db.query('RESET ROLE');
    // LONE claims A, which never claimed it back. A and B stay reciprocal.
    await claimA();
    expect((await call(db, OWNER, A, BOARD)).ok, 'the healthy pair still saves').toBe(true);
    const rows = await snapshot();
    expect(byId(rows, A).title, 'A moved').toBe('synced title');
    expect(byId(rows, B).title, 'B moved with it').toBe('synced title');
    // The squatter is not updated, not cleared, and not repaired.
    expect(byId(rows, LONE).title, 'C is untouched').toBe('Lone');
    expect(byId(rows, LONE).content).toBe('body lone');
    expect(byId(rows, LONE).metadata.syncedWith, 'and keeps its stale claim').toBe(A);
  });

  it('editing C itself fails, because its claimed target does not point back', async () => {
    await db.query('RESET ROLE');
    await claimA();
    const result = await call(db, OWNER, LONE, BOARD);
    expect(!result.ok && result.code, 'refused as an invalid pair').toBe('22023');
    const rows = await snapshot();
    for (const id of [A, B, LONE]) {
      expect(byId(rows, id).title, `${id} unchanged`).not.toBe('synced title');
    }
  });
});

describe('2c. a patch that is not an object is refused before anything is read', () => {
  // jsonb_each raises on a non-object, which would put a database message where
  // this function's own generic refusal belongs. The explicit guard runs first.
  const rawCall = async (shared: string, source: string) => {
    await db.query('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [OWNER]);
    await db.query('SET ROLE authenticated');
    try {
      await db.query(`SELECT * FROM public.update_synced_note_pair(
        $1::uuid,$2::uuid,'t','c',$3::jsonb,$4::jsonb)`, [A, BOARD, shared, source]);
      return null;
    } catch (error) {
      const e = error as { code?: string; message: string };
      return { code: e.code ?? '', message: e.message };
    } finally {
      await db.query('RESET ROLE');
    }
  };

  it('every non-object shared or source patch is refused, and writes nothing', async () => {
    for (const raw of ['[1,2]', '"a string"', '7', 'true', 'null']) {
      for (const slot of ['shared', 'source'] as const) {
        const at = `${slot} ${raw}`;
        const outcome = await rawCall(slot === 'shared' ? raw : '{}', slot === 'source' ? raw : '{}');
        expect(outcome, `${at} was refused`).not.toBeNull();
        expect(outcome!.code, at).toBe('22023');
        // This function's own token, not PostgreSQL's "cannot call jsonb_each".
        expect(outcome!.message, at).toBe('synced_note_pair_invalid');
        const rows = await snapshot();
        expect(byId(rows, A).title, `${at}: zero writes`).toBe('A');
        expect(byId(rows, B).title).toBe('B');
      }
    }
  });
});

describe('3. authority is the board, asked of auth.uid() alone', () => {
  it('the owner and a board editor may save; a viewer, a stranger and an anonymous caller may not',
    async () => {
      expect((await call(db, OWNER, A, BOARD)).ok, 'owner').toBe(true);
      await seed();
      expect((await call(db, EDITOR, A, BOARD)).ok, 'editor').toBe(true);

      for (const actor of [VIEWER, STRANGER, null]) {
        await seed();
        const refused = await call(db, actor, A, BOARD);
        expect(refused.ok, String(actor)).toBe(false);
        expect(!refused.ok && refused.code, String(actor)).toBe('42501');
        expect(!refused.ok && refused.message).toBe('synced_note_pair_denied');
        const rows = await snapshot();
        expect(byId(rows, A).title, String(actor)).toBe('A');
        expect(byId(rows, B).title, String(actor)).toBe('B');
      }
    });

  it('naming a board the caller does control does not reach a pair on another board',
    async () => {
      // The owner owns OTHER_BOARD too, so authority passes -- and the pair
      // still is not on the board that was named.
      const result = await call(db, OWNER, A, OTHER_BOARD);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe('22023');
      const rows = await snapshot();
      expect(byId(rows, A).title).toBe('A');
      expect(byId(rows, B).title).toBe('B');
    });
});

describe('4. RLS is still the authority, not a formality', () => {
  it('row level security is enabled on padlets, and these callers are not superusers',
    async () => {
      await db.query('RESET ROLE');
      const { rows } = await db.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.padlets')");
      expect(rows[0].relrowsecurity).toBe(true);
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [VIEWER]);
      await db.query('SET ROLE authenticated');
      const { rows: su } = await db.query('SELECT usesuper FROM pg_user WHERE usename = current_user');
      expect(su[0]?.usesuper ?? false, 'the acting role must not bypass policies').toBe(false);
      // A viewer's DIRECT update is filtered to nothing by the policy alone.
      const direct = await db.query("UPDATE public.padlets SET title='hijacked' WHERE id=$1::uuid", [A]);
      expect(direct.rowCount).toBe(0);
      await db.query('RESET ROLE');
      expect(byId(await snapshot(), A).title).toBe('A');
    });

  it('with the update policy removed, an authorized editor writes nothing at all',
    async () => {
      await db.query('RESET ROLE');
      await db.query('DROP POLICY padlets_update ON public.padlets');
      try {
        const result = await call(db, OWNER, A, BOARD);
        // The function's own board check PASSES here -- the owner really does
        // own this board. The policy is what stops it, and it stops it at the
        // row lock: `FOR UPDATE` is itself subject to the UPDATE policy, so
        // the two rows are filtered out before any write is attempted and the
        // pair count check refuses. RLS is load-bearing, not decorative.
        expect(result.ok).toBe(false);
        expect(!result.ok && result.code).toBe('22023');
        const rows = await snapshot();
        expect(byId(rows, A).title, 'no half-applied write').toBe('A');
        expect(byId(rows, B).title).toBe('B');
      } finally {
        await db.query(`CREATE POLICY padlets_update ON public.padlets FOR UPDATE TO authenticated USING (
          (board_id IS NOT NULL AND board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()))
          OR (board_id IS NOT NULL AND board_id IN (
                SELECT board_id FROM public.board_collaborators
                 WHERE user_id = auth.uid() AND role = 'editor')))`);
      }
      expect((await call(db, OWNER, A, BOARD)).ok, 'and the ordinary path still works').toBe(true);
    });
});

describe('5. atomicity and concurrency', () => {
  it('a failure on the SECOND member rolls the first one back', async () => {
    await db.query('RESET ROLE');
    await db.query(`CREATE FUNCTION public.snp_boom() RETURNS trigger LANGUAGE plpgsql AS
      $f$ BEGIN IF NEW.id = '${B}'::uuid THEN RAISE EXCEPTION 'synthetic twin failure'; END IF;
          RETURN NEW; END $f$`);
    await db.query('CREATE TRIGGER snp_boom BEFORE UPDATE ON public.padlets '
      + 'FOR EACH ROW EXECUTE FUNCTION public.snp_boom()');
    try {
      const doomed = await call(db, OWNER, A, BOARD);
      expect(doomed.ok).toBe(false);
      const rows = await snapshot();
      expect(byId(rows, A).title, 'the first member is NOT left updated').toBe('A');
      expect(byId(rows, A).content).toBe('body a');
      expect(byId(rows, B).title).toBe('B');
    } finally {
      await db.query('DROP TRIGGER snp_boom ON public.padlets');
      await db.query('DROP FUNCTION public.snp_boom()');
    }
    expect((await call(db, OWNER, A, BOARD)).ok, 'and the pair saves once the fault is gone') .toBe(true);
  });

  it('opposite members saving at once serialize, and never leave the pair divergent',
    async () => {
      for (let round = 0; round < 4; round += 1) {
        await seed();
        const [first, secondResult] = await Promise.all([
          call(db, OWNER, A, BOARD, { cardColor: '#111111' }, {}, 'from-a', 'body-from-a'),
          call(second, EDITOR, B, BOARD, { cardColor: '#222222' }, {}, 'from-b', 'body-from-b'),
        ]);
        // Last write wins is acceptable. Persisted divergence is not.
        expect(first.ok && secondResult.ok, `round ${round}: neither deadlocked`).toBe(true);
        const rows = await snapshot();
        expect(byId(rows, A).title, `round ${round}`).toBe(byId(rows, B).title);
        expect(byId(rows, A).content, `round ${round}`).toBe(byId(rows, B).content);
        expect(byId(rows, A).metadata.cardColor, `round ${round}`) .toBe(byId(rows, B).metadata.cardColor);
        // And each still owns its own placement through the contention.
        expect(byId(rows, A).metadata.parentId).toBe('container-a');
        expect(byId(rows, B).metadata.parentId).toBe('container-b');
      }
    });
});

describe('6. the shipped artifacts agree, and verification passes', () => {
  it('the rollout defines byte-identical function source to the reviewed migration', async () => {
    await db.query('RESET ROLE');
    const digest = async () => (await db.query(
      "SELECT md5(prosrc) AS d FROM pg_proc WHERE proname = 'update_synced_note_pair'")).rows[0].d;
    const fromRollout = await digest();
    await db.query(read(MIGRATION));
    expect(await digest(), 'migration and rollout are the same function').toBe(fromRollout);
  });

  it('the read-only verification reports readiness, with every invariant passing', async () => {
    await db.query('RESET ROLE');
    await db.query('BEGIN READ ONLY');
    try {
      const { rows } = await db.query(read(VERIFY));
      expect(rows.length, 'the verification produced invariants').toBeGreaterThan(15);
      const failed = rows.filter((r) => r.pass !== true) .map((r) => `${r.ord} ${r.check_name} => ${r.actual}`);
      expect(failed).toEqual([]);
      expect(rows.every((r) => r.rollout_readiness === true)).toBe(true);
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
