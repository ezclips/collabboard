import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF-R6K-H3A -- the production rollout artifact for standalone PDF highlights.
 *
 * This repository does not push migrations: `[db.migrations] enabled = false`
 * and supabase/BASELINE.md records that supabase/migrations/ does not rebuild
 * the live database. Production changes go through a guarded, self-contained
 * batch under supabase/production-rollouts/ plus a read-only verifier.
 *
 * These assertions pin the properties that make THIS artifact safe to run once
 * against production: fail-closed guards, the reviewed security invariants
 * carried across intact, one transaction, and -- load-bearing -- no backfill.
 */

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const ROLLOUT_PATH = 'supabase/production-rollouts/20260904_standalone_pdf_highlights.sql';
const VERIFY_PATH = 'supabase/production-rollouts/20260904_standalone_pdf_highlights_verify.sql';
const rollout = read(ROLLOUT_PATH);
const verifier = read(VERIFY_PATH);
/** Statements only: a guarantee must never be satisfied by a comment about it. */
const statements = rollout.replace(/--.*$/gm, '');
const verifierStatements = verifier.replace(/--.*$/gm, '');

const SOURCES = [
  '20260904_create_knowledge_source_highlights.sql',
  '20260904120000_harden_knowledge_source_highlight_authority.sql',
  '20260904140000_create_knowledge_source_citation_with_highlight.sql',
];

describe('PDF-R6K-H3A rollout artifact', () => {
  it('1. follows the rollout/verify pair convention this repo uses', () => {
    const listed = fs.readdirSync(path.join(ROOT, 'supabase/production-rollouts'));
    expect(listed).toContain('20260904_standalone_pdf_highlights.sql');
    expect(listed).toContain('20260904_standalone_pdf_highlights_verify.sql');
    // The verifier creates nothing and changes nothing, so it is safe before,
    // after, or against a partial state.
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'GRANT ', 'REVOKE ']) {
      expect(verifier, forbidden).not.toContain(forbidden);
    }
  });

  it('2. names the three reviewed migrations as its source, in dependency order', () => {
    let previous = -1;
    for (const name of SOURCES) {
      const at = rollout.indexOf(`supabase/migrations/${name}`);
      expect(at, `${name} must be named in the header`).toBeGreaterThan(previous);
      previous = at;
    }
  });

  it('3. leaves the three reviewed migrations untouched', () => {
    // The rollout copies their statements; it must never become a reason to
    // edit committed migration history.
    for (const name of SOURCES) {
      expect(fs.existsSync(path.join(ROOT, 'supabase/migrations', name))).toBe(true);
    }
  });

  it('4. applies the three phases in order, in ONE transaction', () => {
    expect((statements.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((statements.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
    // There must be no state where the table exists but the hardening was
    // skipped, so schema, grants and function all commit together.
    const table = statements.indexOf('CREATE TABLE IF NOT EXISTS public.knowledge_source_highlights');
    const revoke = statements.indexOf('REVOKE ALL ON TABLE public.knowledge_source_highlights');
    const fn = statements.indexOf('CREATE OR REPLACE FUNCTION public.create_knowledge_source_citation');
    const commit = statements.lastIndexOf('COMMIT;');
    expect(table).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(table);
    expect(fn).toBeGreaterThan(revoke);
    expect(commit).toBeGreaterThan(fn);
  });

  it('5. fails closed: prerequisites, and an all-or-nothing feature state', () => {
    const preflight = statements.slice(
      statements.indexOf('DO $preflight$'), statements.indexOf('$preflight$;'),
    );
    for (const prerequisite of [
      'public.boards', 'public.board_collaborators', 'public.padlets',
      'public.knowledge_documents', 'public.source_references',
      'public.is_board_member(uuid, uuid)', 'public.update_updated_at_column()', 'auth.uid()',
    ]) expect(preflight, prerequisite).toContain(prerequisite);

    // Exactly two acceptable states; a partial one aborts rather than being
    // silently repaired.
    expect(preflight).toContain('present_objects NOT IN (0, 3)');
    expect((preflight.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(6);
    // A wrong-shaped table must not be converged onto, because the hardening
    // re-grants by column name and an unknown column would lose its privilege.
    expect(preflight).toContain("column_name = 'board_id'");
  });

  it('6. carries the H2A schema invariants across intact', () => {
    // No board_id: authority is reached through the document alone.
    expect(statements).not.toMatch(/\bboard_id uuid\b/);
    expect(statements).toContain('REFERENCES public.knowledge_documents(id) ON DELETE CASCADE');
    // SET NULL, never CASCADE: deleting a Note orphans the mark, never kills it.
    expect(statements).toContain('REFERENCES public.source_references(id) ON DELETE SET NULL');
    expect(statements).toContain('CHECK (page_number >= 1)');
    expect(statements).toContain('CHECK (char_start >= 0 AND char_end > char_start)');
    expect(statements).toContain('ENABLE ROW LEVEL SECURITY');
    expect(statements).toContain('knowledge_source_highlights_document_page_idx');
    expect(statements).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS knowledge_source_highlights_origin_uidx[\s\S]*?WHERE source_reference_id IS NOT NULL/,
    );
  });

  it('7. carries the H2A-C1 column authority across intact', () => {
    // ORDER MATTERS: a column grant is meaningless while a table grant stands.
    const revoke = statements.indexOf('REVOKE ALL ON TABLE public.knowledge_source_highlights FROM authenticated, anon;');
    expect(revoke).toBeGreaterThan(-1);
    expect(statements.indexOf('GRANT INSERT (')).toBeGreaterThan(revoke);
    expect(statements.indexOf('GRANT UPDATE (color)')).toBeGreaterThan(revoke);
    // Exactly one UPDATE grant, on the colour alone.
    expect((statements.match(/GRANT UPDATE/g) ?? []).length).toBe(1);
    expect(statements).not.toMatch(/GRANT UPDATE ON TABLE/);

    const insertGrant = statements.slice(
      statements.indexOf('GRANT INSERT ('),
      statements.indexOf('TO authenticated;', statements.indexOf('GRANT INSERT (')),
    );
    for (const column of [
      'source_document_id', 'page_number', 'char_start', 'char_end',
      'quote_text', 'quote_hash', 'color', 'source_reference_id',
    ]) expect(insertGrant, column).toContain(column);
    // Database-owned; created_by's absence is what makes authorship truthful.
    for (const owned of ['created_by', 'created_at', 'updated_at']) {
      expect(insertGrant, owned).not.toContain(owned);
    }
    expect(statements).toContain('ALTER COLUMN created_by SET DEFAULT auth.uid()');
  });

  it('8. keeps the write policy owner-or-EDITOR, never role-agnostic membership', () => {
    const write = statements.slice(statements.indexOf('CREATE POLICY knowledge_source_highlights_write'));
    const policy = write.slice(0, write.indexOf('-- ====='));
    expect(policy).not.toContain('is_board_member');
    // Both halves: without WITH CHECK an editor of one board could insert
    // against another's document; without USING they could delete one.
    expect((policy.match(/role = 'editor'/g) ?? []).length).toBe(2);
    expect(policy).toContain('USING (');
    expect(policy).toContain('WITH CHECK (');
    // The read policy legitimately admits any member.
    const select = statements.slice(statements.indexOf('CREATE POLICY knowledge_source_highlights_select'));
    expect(select.slice(0, select.indexOf('DROP POLICY'))).toContain('public.is_board_member');
  });

  it('9. keeps the origin trigger a definer-owned, non-callable integrity rule', () => {
    expect(statements).toContain('CREATE OR REPLACE FUNCTION public.knowledge_source_highlight_origin_matches_document()');
    expect(statements).toContain('SECURITY DEFINER');
    expect(statements).toContain('SET search_path = public');
    expect(statements).toContain('FROM public.source_references r');
    // No dynamic SQL, no caller-controlled identifiers.
    expect(statements).not.toContain('EXECUTE format');
    expect(statements).toContain('REVOKE ALL ON FUNCTION public.knowledge_source_highlight_origin_matches_document()');
    expect(statements).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.knowledge_source_highlight_origin/);
    // NULL passes, which is also the path ON DELETE SET NULL takes.
    expect(statements).toContain('IF NEW.source_reference_id IS NULL THEN');
  });

  it('10. keeps the citation RPC SECURITY INVOKER and off PUBLIC/anon', () => {
    // Bounded to the function BODY: the postflight below legitimately mentions
    // SECURITY DEFINER in the message it raises about the trigger function.
    const fnStart = statements.indexOf('CREATE OR REPLACE FUNCTION public.create_knowledge_source_citation');
    const fn = statements.slice(fnStart, statements.indexOf('REVOKE ALL ON FUNCTION public.create_knowledge_source_citation'));
    expect(fn).toContain('SECURITY INVOKER');
    expect(fn).not.toContain('SECURITY DEFINER');
    // PostgreSQL grants PUBLIC EXECUTE by default; it must be revoked.
    expect(statements).toMatch(/REVOKE ALL ON FUNCTION public\.create_knowledge_source_citation\([\s\S]*?\) FROM PUBLIC, anon;/);
    expect(statements).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_knowledge_source_citation\([\s\S]*?\) TO authenticated;/);
    // A citation that paints nothing must never acquire a mark.
    expect(fn).toContain('IF p_highlight_color IS NOT NULL');
    expect(fn).toContain('AND p_page_start = p_page_end');
  });

  it('11. asserts the resulting shape, so a wrong result fails the rollout', () => {
    const postflight = statements.slice(
      statements.indexOf('DO $postflight$'), statements.indexOf('$postflight$;'),
    );
    // Not merely printed: every check raises.
    expect((postflight.match(/RAISE EXCEPTION/g) ?? []).length).toBeGreaterThanOrEqual(12);
    for (const checked of [
      'board_id', 'relrowsecurity', 'delete_rule', 'origin_uidx',
      'TRUNCATE', 'privilege_type', 'auth.uid()', 'prosecdef', 'has_function_privilege',
    ]) expect(postflight, checked).toContain(checked);
  });

  it('12. performs NO backfill, and says so where an operator will read it', () => {
    // The legacy backfill needs the TypeScript span resolver and the Note
    // accent authority; reimplementing either in SQL would paint marks the
    // reader never showed.
    // The shape a set-based SQL backfill would have to take: rows selected out
    // of the citation table straight into the highlight table.
    expect(statements).not.toMatch(
      /INSERT INTO public\.knowledge_source_highlights[\s\S]{0,600}SELECT[\s\S]{0,600}FROM public\.source_references/,
    );
    // Only the RPC body inserts a highlight, one row at a time, from arguments.
    expect((statements.match(/INSERT INTO public\.knowledge_source_highlights/g) ?? []).length).toBe(1);

    // The release gate, stated in the artifact rather than only in a ticket.
    expect(rollout).toContain('DO NOT DEPLOY THE H2B APPLICATION CODE YET');
    expect(rollout).toContain('PRODUCTION STANDALONE HIGHLIGHT BACKFILL');
    expect(rollout).toContain('BACKFILL VERIFICATION');
    expect(verifier).toContain('BACKFILL NOT RUN -- do NOT deploy the H2B renderer yet');
  });

  it('13. is self-contained: no includes, no CLI, no ledger dependency', () => {
    expect(rollout).not.toContain('\\i ');
    expect(rollout).not.toContain('supabase db push');
    expect(rollout).not.toContain('supabase_migrations');
    // Plain SQL, so it runs unchanged in psql and in the dashboard editor.
    expect(rollout).not.toMatch(/^\\[a-z]/m);
    expect(verifier).not.toMatch(/^\\[a-z]/m);
  });
  it('14. tests the created_by default NULL-safely, in every place it is tested', () => {
    // A column carrying NO default reads as NULL out of information_schema, and
    // in SQL `NULL NOT LIKE ...` is NULL, not true. `IF NULL THEN` does not fire
    // and a bare `... LIKE ...` yields a blank cell rather than false -- so the
    // unguarded form waves through, or fails to report, precisely the state
    // these checks exist to catch. Nothing downstream can repair it either:
    // `created_by` is not a column any client is permitted to name, so every
    // highlight written after such a rollout would carry NULL authorship.
    //
    // Asserting that 'auth.uid()' merely APPEARS would pass on the broken form
    // too. What follows pins the predicate's shape instead, and by count, so a
    // future edit cannot reintroduce an unguarded one anywhere.
    const NULL_SAFE = String.raw`COALESCE\(\s*\(SELECT column_default[^)]*\)\s*LIKE\s*'%auth\.uid\(\)%'\s*,\s*false\s*\)`;
    const nullSafe = new RegExp(NULL_SAFE, 'g');
    const anyDefaultTest = /'%auth\.uid\(\)%'/g;

    for (const [label, sql] of [['rollout', statements], ['verifier', verifierStatements]] as const) {
      const tested = (sql.match(anyDefaultTest) ?? []).length;
      expect(tested, `${label} still tests the created_by default`).toBeGreaterThan(0);
      expect((sql.match(nullSafe) ?? []).length, `${label}: every default test is NULL-guarded`)
        .toBe(tested);
      // The exact broken shape, and the bare boolean that reports NULL as blank.
      expect(sql, label).not.toMatch(/column_default[^;]*NOT LIKE/);
    }

    // The postflight must RAISE on the guarded predicate, not merely contain it.
    const postflight = statements.slice(
      statements.indexOf('DO $postflight$'), statements.indexOf('$postflight$;'),
    );
    expect(postflight).toMatch(
      /IF NOT COALESCE\(\s*\(SELECT column_default[^)]*\)\s*LIKE\s*'%auth\.uid\(\)%'\s*,\s*false\s*\)\s*THEN/,
    );

    // The verifier's roll-up decides readiness with one AND-chain: a NULL-able
    // conjunct anywhere in it turns the whole answer blank instead of false.
    const rollUp = verifierStatements.slice(verifierStatements.indexOf('== 12. roll-up =='));
    expect(rollUp).toMatch(new RegExp(NULL_SAFE));
    expect(rollUp, 'array_agg over no grants is NULL too').toMatch(
      /COALESCE\(\(SELECT array_agg[\s\S]*?=\s*ARRAY\['color'\]\s*,\s*false\)/,
    );
  });
});
