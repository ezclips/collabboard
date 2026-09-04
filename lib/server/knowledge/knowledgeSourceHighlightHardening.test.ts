import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF-R6K-H2A-C1 -- the hardening migration's contract.
 *
 * H2A's row security was right; what was missing is that RLS governs ROWS and
 * says nothing about COLUMNS. Supabase grants `authenticated` table-wide
 * INSERT/UPDATE, so a typed repository was the only thing standing between an
 * editor and a rewritten span, a forged author, or a foreign citation as
 * origin -- and a repository is not a boundary a direct PostgREST call
 * respects. These assertions pin the database-side answers.
 */

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const ORIGINAL = '20260904_create_knowledge_source_highlights.sql';
const HARDENING = '20260904120000_harden_knowledge_source_highlight_authority.sql';
const SQL = fs.readFileSync(path.join(MIGRATIONS, HARDENING), 'utf8');
/** Statements only: a rule must never be satisfied by a comment about it. */
const STATEMENTS = SQL.replace(/--.*$/gm, '');

describe('PDF-R6K-H2A-C1 hardening migration', () => {
  it('1. is one new migration that orders after the original, which is untouched', () => {
    const listed = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'));
    expect(listed).toContain(HARDENING);
    expect(new Set(listed.filter((name) => name.startsWith('20260904'))))
      .toEqual(new Set([ORIGINAL, HARDENING]));

    // Ordering is decided by the migration VERSION -- the digits before the
    // first underscore -- which is what the Supabase CLI parses and sorts by.
    // Asserted numerically on purpose: a plain JS string sort would put these
    // two the WRONG way round, because '1' sorts before '_' in code-unit
    // order, so `20260904120000_...` would appear to precede `20260904_...`.
    // The CLI is unaffected, but nothing here should imply that filename sort
    // and apply order agree for this pair -- they do not.
    const version = (name: string) => Number(name.slice(0, name.indexOf('_')));
    expect(version(ORIGINAL)).toBeLessThan(version(HARDENING));
  });

  it('2. revokes wholesale first, so the grant set is deterministic', () => {
    // Additive grants alone would leave whatever Supabase's defaults already
    // handed out -- including TRUNCATE, which BYPASSES RLS entirely.
    expect(STATEMENTS).toContain(
      'REVOKE ALL ON TABLE public.knowledge_source_highlights FROM authenticated, anon;',
    );
  });

  it('3. grants UPDATE on the colour and nothing else', () => {
    expect(STATEMENTS).toContain(
      'GRANT UPDATE (color) ON TABLE public.knowledge_source_highlights TO authenticated;',
    );
    // Exactly one UPDATE grant, so no second statement can widen it.
    expect(STATEMENTS.match(/GRANT UPDATE/g) ?? []).toHaveLength(1);
    expect(STATEMENTS).not.toMatch(/GRANT UPDATE ON TABLE/);
    expect(STATEMENTS).not.toMatch(/GRANT ALL/);
  });

  it('4. grants INSERT only on the fields a person actually draws', () => {
    const insert = STATEMENTS.slice(
      STATEMENTS.indexOf('GRANT INSERT ('),
      STATEMENTS.indexOf('TO authenticated;', STATEMENTS.indexOf('GRANT INSERT (')),
    );
    for (const column of [
      'source_document_id', 'page_number', 'char_start', 'char_end',
      'quote_text', 'quote_hash', 'color', 'source_reference_id',
    ]) expect(insert, column).toContain(column);
    // Database-owned. created_by's absence is what makes authorship truthful:
    // naming the column at all is the permission error, so a forged uuid and an
    // explicit NULL fail identically.
    for (const owned of ['created_by', 'created_at', 'updated_at']) {
      expect(insert, `${owned} must not be insertable`).not.toContain(owned);
    }
    expect(insert).not.toMatch(/\bid\b,/);
  });

  it('5. keeps reads and row-level deletes table-wide, under RLS', () => {
    expect(STATEMENTS).toContain('GRANT SELECT ON TABLE public.knowledge_source_highlights TO authenticated;');
    expect(STATEMENTS).toContain('GRANT DELETE ON TABLE public.knowledge_source_highlights TO authenticated;');
  });

  it('6. fills the author from the session identity', () => {
    expect(STATEMENTS).toContain('ALTER COLUMN created_by SET DEFAULT auth.uid()');
  });

  it('7. enforces origin-citation integrity in the database, not just in TypeScript', () => {
    expect(STATEMENTS).toContain(
      'CREATE OR REPLACE FUNCTION public.knowledge_source_highlight_origin_matches_document()',
    );
    expect(STATEMENTS).toContain('r.source_document_id = NEW.source_document_id');
    // A NULL origin passes -- this is also the path ON DELETE SET NULL takes,
    // so a Note deletion still orphans rather than fails.
    expect(STATEMENTS).toContain('IF NEW.source_reference_id IS NULL THEN');
    expect(STATEMENTS).toContain('BEFORE INSERT OR UPDATE OF source_reference_id, source_document_id');
  });

  it('8. the integrity function is trigger-only and safely defined', () => {
    expect(STATEMENTS).toContain('SECURITY DEFINER');
    expect(STATEMENTS).toContain('SET search_path = public');
    // Schema-qualified, no dynamic SQL, no caller-controlled identifiers.
    expect(STATEMENTS).toContain('FROM public.source_references r');
    expect(STATEMENTS).not.toContain('EXECUTE format');
    expect(STATEMENTS).not.toMatch(/EXECUTE\s+'/);
    // Not a callable API.
    expect(STATEMENTS).toContain(
      'REVOKE ALL ON FUNCTION public.knowledge_source_highlight_origin_matches_document()',
    );
    expect(STATEMENTS).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.knowledge_source_highlight_origin/);
  });

  it('9. changes no policy and widens no role', () => {
    // RLS was already correct; this migration is about columns and integrity.
    expect(STATEMENTS).not.toContain('CREATE POLICY');
    expect(STATEMENTS).not.toContain('DROP POLICY');
    expect(STATEMENTS).not.toContain('ALTER POLICY');
    // The real collaborator roles are editor|viewer|commenter.
    expect(STATEMENTS).not.toContain("'manager'");
    expect(STATEMENTS).not.toContain("'readonly'");
    expect(STATEMENTS).not.toContain("'commenter'");
  });

  it('10. the write path must not NAME created_by, or the grant breaks it', () => {
    // Load-bearing, and easy to undo by accident: an authenticated caller holds
    // no INSERT privilege on created_by, so an adapter that mentions the column
    // fails with 42501 even when the value it would send is correct. The column
    // default is the only writer of authorship on this path.
    const adapters = fs.readFileSync(
      path.join(ROOT, 'lib/infra/knowledge/knowledgeSourceHighlightAdapters.ts'), 'utf8',
    );
    // The insert payload builds snake_case columns from the typed row; if it
    // ever writes authorship again it can only do so through this shape.
    expect(adapters).not.toContain('created_by: row.');

    const insertRow = adapters.slice(
      adapters.indexOf('interface HighlightInsertRow {'),
      adapters.indexOf('interface HighlightUpdateRow'),
    );
    expect(insertRow).not.toContain('created_by');

    const domain = fs.readFileSync(
      path.join(ROOT, 'lib/domain/knowledge/knowledgeSourceHighlightWrite.ts'), 'utf8',
    );
    const insertType = domain.slice(
      domain.indexOf('export interface KnowledgeSourceHighlightInsert {'),
      domain.indexOf('export interface KnowledgeQuoteHasher'),
    );
    expect(insertType).not.toContain('createdBy');
  });

  it('11. does not touch the original migration or any other table', () => {
    expect(STATEMENTS).not.toMatch(/ALTER TABLE public\.source_references/);
    expect(STATEMENTS).not.toContain('padlets');
    expect(STATEMENTS).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE\s+public/);
  });
});
