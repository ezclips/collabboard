import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WIKI UNIT 1 -- page storage, pinned in SQL.
 *
 * Three of the things this migration promises are invisible at runtime until
 * the day they are violated, so they are asserted here rather than trusted to a
 * comment:
 *
 *   1. THE ACCESS STORY. "Follows the knowledge tables' pattern" is not a
 *      specification. Who may reach these tables, and who may not, is stated in
 *      grants and policies and checked here.
 *   2. OVERWRITE-IMPOSSIBILITY IS STRUCTURAL. "Recompilation proposes and never
 *      overwrites" is true because the page has exactly ONE content column and
 *      compile output lands in a different table -- not because the application
 *      is careful. A second content column, or a trigger, would make it false
 *      with nothing else in the system noticing.
 *   3. THE SOURCE SET IS CONTENT, NOT FOREIGN KEYS. A FK from `sources` to
 *      knowledge_documents would be the "obvious" improvement and would destroy
 *      the gone state: ON DELETE CASCADE is why `source_references` cannot be
 *      reused here in the first place.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260919120000_create_board_wiki_pages.sql';
const ROLLOUT = 'supabase/production-rollouts/20260919120000_create_board_wiki_pages.sql';
const VERIFY = 'supabase/production-rollouts/20260919120000_create_board_wiki_pages_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260919120000_create_board_wiki_pages_rollback.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verify = read(VERIFY);
const rollback = read(ROLLBACK);

/** Statements only: an assertion about what the SQL DOES must ignore prose. */
const executable = (sql: string) => sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '');

const statements = executable(migration);

describe('the four files travel together', () => {
  it('the rollout is byte-identical to the migration', () => {
    // A rollout that drifted from the migration is a rollout nobody tested.
    expect(rollout).toBe(migration);
  });

  it('every file names the same timestamp', () => {
    for (const [name, text] of [['verify', verify], ['rollback', rollback]] as const) {
      expect(text, name).toContain('20260919120000_create_board_wiki_pages');
    }
  });

  it('the rollback says it DESTROYS authored content, because it does', () => {
    // Every other rollback in this project restores an earlier function body and
    // loses nothing. This one drops tables, and a reader who assumes the usual
    // shape would run it expecting a revert.
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.board_wiki_page_proposals/);
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.board_wiki_pages/);
    expect(rollback.toLowerCase()).toContain('export first');
    expect(rollback.toLowerCase()).toContain('authored content');
  });

  it('the rollback drops the proposals table FIRST', () => {
    // Proposals reference pages, so the reverse order fails on the FK.
    expect(statements).toContain('REFERENCES public.board_wiki_pages(id)');
    expect(rollback.indexOf('DROP TABLE IF EXISTS public.board_wiki_page_proposals'))
      .toBeLessThan(rollback.indexOf('DROP TABLE IF EXISTS public.board_wiki_pages'));
  });
});

describe('1. the access story, stated rather than inferred', () => {
  it('enables RLS on both tables', () => {
    expect(statements).toContain('ALTER TABLE public.board_wiki_pages ENABLE ROW LEVEL SECURITY');
    expect(statements).toContain('ALTER TABLE public.board_wiki_page_proposals ENABLE ROW LEVEL SECURITY');
  });

  it('gives anon nothing on either table', () => {
    // RLS filters rows; grants decide whether a role reaches the table at all,
    // and the two fail independently.
    expect(statements).toContain('REVOKE ALL ON public.board_wiki_pages FROM anon');
    expect(statements).toContain('REVOKE ALL ON public.board_wiki_page_proposals FROM anon');
  });

  it('writes are owner-or-editor, and reads are any board member', () => {
    // Read: viewers included -- reading a wiki is a read.
    expect(statements).toMatch(/board_wiki_pages_select[\s\S]*?is_board_member\(board_id, auth\.uid\(\)\)/);
    // Write: every writing policy tests role = 'editor', never is_board_member.
    for (const policy of ['board_wiki_pages_insert', 'board_wiki_pages_update', 'board_wiki_pages_delete']) {
      const body = statements.slice(statements.indexOf(`CREATE POLICY ${policy}`));
      const clause = body.slice(0, body.indexOf(';'));
      expect(clause, policy).toContain("role = 'editor'");
      expect(clause, policy).not.toContain('is_board_member');
    }
  });

  it('an UPDATE can neither reach nor create a row on a board the caller cannot write', () => {
    // USING gates which rows may be updated; WITH CHECK gates what they become.
    const update = statements.slice(statements.indexOf('CREATE POLICY board_wiki_pages_update'));
    const clause = update.slice(0, update.indexOf(';'));
    expect(clause).toContain('USING');
    expect(clause).toContain('WITH CHECK');
  });

  it('a page cannot be moved to another board or have its authorship rewritten', () => {
    expect(statements).toContain(
      'REVOKE UPDATE (board_id, created_by, created_at) ON public.board_wiki_pages FROM authenticated',
    );
  });

  it('says where authorization actually lives, so the policies are not mistaken for the gate', () => {
    // The service role bypasses every policy above. If the comment stops saying
    // so, the next reader will believe RLS is the primary gate.
    expect(migration).toMatch(/authorization lives[\s\S]{0,400}application/i);
    expect(migration.toLowerCase()).toContain('defence in depth');
  });
});

describe('2. overwrite-impossibility is structural, not procedural', () => {
  it('the page has EXACTLY ONE column that can hold page prose', () => {
    // A `compiled_content` or `draft_content` column is how "recompilation
    // proposes" quietly becomes "recompilation writes somewhere the page picks
    // up", with nothing else in the system noticing.
    const table = statements.slice(
      statements.indexOf('CREATE TABLE IF NOT EXISTS public.board_wiki_pages'),
      statements.indexOf('CREATE INDEX IF NOT EXISTS board_wiki_pages_board_idx'),
    );
    const contentColumns = [...table.matchAll(/^\s{4}(\w*content\w*)\s+text/gim)].map((m) => m[1]);
    expect(contentColumns).toEqual(['content']);
  });

  it('compile output lands in a DIFFERENT table', () => {
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS public.board_wiki_page_proposals');
    expect(statements).toMatch(/board_wiki_page_proposals[\s\S]*?content text NOT NULL/);
  });

  it('creates no trigger, which is the other path a proposal could promote itself by', () => {
    expect(statements).not.toMatch(/CREATE\s+(OR REPLACE\s+)?TRIGGER/i);
    expect(statements).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION/i);
  });

  it('a proposal cannot be edited in place, by anyone', () => {
    // A proposal is a record of what a compilation said at a moment.
    expect(statements).not.toContain('CREATE POLICY board_wiki_page_proposals_update');
    expect(statements).toContain('REVOKE UPDATE ON public.board_wiki_page_proposals FROM authenticated');
    const grant = statements.match(/GRANT ([A-Z, ]+) ON public\.board_wiki_page_proposals TO authenticated/);
    expect(grant?.[1]).not.toContain('UPDATE');
  });
});

describe('3. the source set is content, and staleness is derived', () => {
  it('sources carries no foreign key to a source table', () => {
    // The FK would be the "obvious" improvement and would destroy the gone
    // state: source_references cannot be reused here precisely because its FKs
    // are ON DELETE CASCADE, so a deleted source takes the row with it.
    const table = statements.slice(
      statements.indexOf('CREATE TABLE IF NOT EXISTS public.board_wiki_pages'),
      statements.indexOf('CREATE INDEX IF NOT EXISTS board_wiki_pages_board_idx'),
    );
    expect(table).toContain('sources jsonb NOT NULL');
    expect(table).not.toMatch(/sources[^,]*REFERENCES/);
    expect(table).not.toContain('REFERENCES public.knowledge_documents');
    expect(table).not.toContain('REFERENCES public.padlets');
  });

  it('stores no staleness flag, because a stored flag goes stale itself', () => {
    expect(statements).not.toMatch(/\bis_stale\b/);
    expect(statements).not.toMatch(/\bstale\s+boolean\b/i);
  });

  it('records the CONSERVATIVE comparison semantics where a later reader will find them', () => {
    // The rule most likely to be "fixed" into a per-cited-page comparison, whose
    // failure mode is silent: a page that really did change reads as current.
    expect(migration.toLowerCase()).toContain('even when the cited page itself did not');
    expect(migration.toLowerCase()).toContain('flag, do not bury');
  });

  it('a page always has an array of sources, never NULL', () => {
    // So a reader never has to tell "unsourced" from "not recorded".
    expect(statements).toContain("sources jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(statements).toContain("jsonb_typeof(sources) = 'array'");
  });
});

describe('deleting an ACCOUNT must not delete board content', () => {
  it('a page keeps SET NULL on created_by, like every other durable board table', () => {
    // The house pattern for durable content -- knowledge_documents,
    // knowledge_source_highlights, teams -- is a NULLABLE created_by with
    // ON DELETE SET NULL. CASCADE belongs on personal containers like
    // board_ai_threads, where the rows ARE the user's own data.
    //
    // A wiki page is board content other editors have since worked on. CASCADE
    // here would let one account deletion destroy the page and everyone else's
    // edits with it -- losing the attribution is the correct cost, losing the
    // page is not.
    const table = statements.slice(
      statements.indexOf('CREATE TABLE IF NOT EXISTS public.board_wiki_pages'),
      statements.indexOf('CREATE INDEX IF NOT EXISTS board_wiki_pages_board_idx'),
    );
    expect(table).toContain('created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL');
    expect(table).not.toMatch(/created_by[^,]*ON DELETE CASCADE/);
    expect(table).not.toMatch(/created_by uuid NOT NULL/);
  });

  it('a PROPOSAL keeps CASCADE, and the asymmetry is deliberate', () => {
    // An ephemeral suggestion nobody built on, left by a deleted account, is
    // garbage by definition. The page is the opposite case.
    const table = statements.slice(statements.indexOf('CREATE TABLE IF NOT EXISTS public.board_wiki_page_proposals'));
    expect(table).toContain('created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
  });
});

describe('the apply is all-or-nothing', () => {
  it('is wrapped in one transaction', () => {
    // CREATE POLICY has no IF NOT EXISTS, so a partial apply cannot be repaired
    // by re-running this file -- it fails on the first policy that already
    // exists, and the only way out is the rollback, which DROPS BOTH TABLES.
    expect(statements).toMatch(/^BEGIN;$/m);
    expect(statements).toMatch(/^COMMIT;$/m);
    expect(statements.indexOf('BEGIN;')).toBeLessThan(statements.indexOf('CREATE TABLE'));
    expect(statements.lastIndexOf('COMMIT;')).toBeGreaterThan(statements.lastIndexOf('REVOKE'));
  });

  it('says why it wraps when the two nearest table-creation migrations do not', () => {
    // 20260820 and 20260902120000 are unwrapped. Following the recent policy
    // migrations instead is a decision, and the header has to carry it or the
    // next reader will "restore consistency" with the wrong precedent.
    expect(migration).toContain('20260820_create_knowledge_data_foundation.sql');
    expect(migration).toContain('CREATE POLICY` has no\n-- `IF NOT EXISTS');
  });
});

describe('one wiki per board, which is the whole ACL story', () => {
  it('a page belongs to exactly one board and dies with it', () => {
    expect(statements).toContain('board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE');
  });

  it('a slug is unique within a board, not globally', () => {
    // Global uniqueness would leak one board's page names into another's.
    expect(statements).toContain('UNIQUE (board_id, slug)');
  });
});

describe('the verify file checks the things that matter', () => {
  it('checks the single-content-column rule and the absence of triggers', () => {
    expect(verify).toContain('exactly one authored content column');
    expect(verify).toContain('no triggers on either table');
  });

  it('checks anon has no privilege and proposals are not updatable', () => {
    expect(verify).toContain("grantee = 'anon'");
    expect(verify).toContain('authenticated cannot UPDATE a proposal');
  });

  it('checks the account-deletion rule on both tables', () => {
    expect(verify).toContain('created_by -- page SET NULL, proposal CASCADE');
    // 'n' is SET NULL and 'c' is CASCADE; asserting the letters keeps the row
    // from being "simplified" into checking only that a constraint exists.
    expect(verify).toContain("confdeltype = 'n'");
    expect(verify).toContain("confdeltype = 'c'");
  });

  it('numbers its rows in the order it runs them', () => {
    // A verifier whose output is out of order gets read out of order.
    const order = [...verify.matchAll(/'row (\d+):/g)].map((m) => Number(m[1]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('admits what it cannot prove', () => {
    // Authorization lives in the application and the service role bypasses every
    // policy, so a green verify does not mean the primary gate is correct.
    expect(verify.toLowerCase()).toContain('cannot tell you');
  });
});
