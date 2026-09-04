import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF-R6K-H2A schema and security contract.
 *
 * The migration is the security boundary, so it is asserted as text: the RLS
 * predicates, the absence of a board_id, and the SET NULL that keeps a Note
 * deletion from destroying an annotation are all things a later edit could
 * quietly weaken.
 */

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const FILE = '20260904_create_knowledge_source_highlights.sql';
const SQL = fs.readFileSync(path.join(MIGRATIONS, FILE), 'utf8');
/** Statements only -- a rule must never be satisfied by a comment about it. */
const STATEMENTS = SQL.replace(/--.*$/gm, '');

describe('PDF-R6K-H2A migration', () => {
  it('1. adds exactly one new migration and rewrites no historical one', () => {
    const listed = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'));
    expect(listed).toContain(FILE);
    // PDF-R6K-H2A-C1 deliberately adds a second, later same-day migration that
    // hardens this table's column grants. It is additive and never edits this
    // file, so the invariant that still matters is that no OTHER 20260904
    // migration appeared.
    expect(new Set(listed.filter((name) => name.startsWith('20260904')))).toEqual(new Set([
      FILE,
      // PDF-R6K-H2A-C1 hardens this table's grants.
      '20260904120000_harden_knowledge_source_highlight_authority.sql',
      // PDF-R6K-H2B adds the atomic citation+highlight function.
      '20260904140000_create_knowledge_source_citation_with_highlight.sql',
    ]));
  });

  it('2. creates the table with the agreed identity and span columns', () => {
    expect(STATEMENTS).toContain('CREATE TABLE IF NOT EXISTS public.knowledge_source_highlights');
    expect(STATEMENTS).toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(STATEMENTS).toMatch(/page_number integer NOT NULL/);
    expect(STATEMENTS).toMatch(/char_start integer NOT NULL/);
    expect(STATEMENTS).toMatch(/char_end integer NOT NULL/);
    expect(STATEMENTS).toMatch(/quote_text text NOT NULL/);
    expect(STATEMENTS).toMatch(/color text NOT NULL/);
    expect(STATEMENTS).toMatch(/created_at timestamptz NOT NULL/);
    expect(STATEMENTS).toMatch(/updated_at timestamptz NOT NULL/);
  });

  it('3. has NO board_id column: authority comes only through the document', () => {
    // The whole point of the shape. A board_id here would be a second,
    // client-presentable authority that could disagree with the document's.
    expect(STATEMENTS).not.toMatch(/\bboard_id\s+uuid/);
    expect(STATEMENTS).toMatch(
      /source_document_id uuid NOT NULL\s*\n?\s*REFERENCES public\.knowledge_documents\(id\) ON DELETE CASCADE/,
    );
  });

  it('4. keeps the highlight alive when its origin citation dies', () => {
    // SET NULL, never CASCADE: deleting a Note cascades to its citation, and
    // that must orphan the annotation rather than destroy it.
    expect(STATEMENTS).toMatch(
      /source_reference_id uuid\s*\n?\s*REFERENCES public\.source_references\(id\) ON DELETE SET NULL/,
    );
    expect(STATEMENTS).not.toMatch(/source_references\(id\) ON DELETE CASCADE/);
    // And no padlet relationship of any kind exists to make a Note mandatory.
    expect(STATEMENTS).not.toContain('padlets');
  });

  it('5. constrains page, span, quote and colour', () => {
    expect(STATEMENTS).toContain('CHECK (page_number >= 1)');
    expect(STATEMENTS).toContain('CHECK (char_start >= 0 AND char_end > char_start)');
    expect(STATEMENTS).toContain('CHECK (length(quote_text) > 0)');
    // The same hex spellings the renderer has always accepted; no second format.
    expect(STATEMENTS).toMatch(/color ~\* '\^#\(\[0-9a-f\]\{3\}\|\[0-9a-f\]\{6\}\|\[0-9a-f\]\{8\}\)\$'/);
  });

  it('6. indexes the read path and makes the backfill convergent', () => {
    expect(STATEMENTS).toContain(
      'ON public.knowledge_source_highlights(source_document_id, page_number)',
    );
    // UNIQUE + partial: one highlight per originating citation, while plain
    // standalone highlights (NULL origin) stay unconstrained.
    expect(STATEMENTS).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS knowledge_source_highlights_origin_uidx\s*\n\s*ON public\.knowledge_source_highlights\(source_reference_id\)\s*\n\s*WHERE source_reference_id IS NOT NULL/,
    );
  });

  it('7. enables RLS', () => {
    expect(STATEMENTS).toContain(
      'ALTER TABLE public.knowledge_source_highlights ENABLE ROW LEVEL SECURITY',
    );
  });

  it('8. read is owner-or-member, proved through the document', () => {
    const select = STATEMENTS.slice(
      STATEMENTS.indexOf('CREATE POLICY knowledge_source_highlights_select'),
      STATEMENTS.indexOf('CREATE POLICY knowledge_source_highlights_write'),
    );
    expect(select).toContain('FOR SELECT TO authenticated');
    expect(select).toContain('FROM public.knowledge_documents d');
    expect(select).toContain('d.id = knowledge_source_highlights.source_document_id');
    expect(select).toContain('public.is_board_member(d.board_id, auth.uid())');
  });

  it('9-10. write is owner-or-EDITOR only, on both USING and WITH CHECK', () => {
    const write = STATEMENTS.slice(
      STATEMENTS.indexOf('CREATE POLICY knowledge_source_highlights_write'),
    );
    expect(write).toContain('FOR ALL TO authenticated');
    // is_board_member is role-agnostic: using it here would hand viewers and
    // readonly collaborators the ability to annotate shared Knowledge.
    expect(write).not.toContain('is_board_member');
    // Both halves, or an editor of one board could insert against another's
    // document (WITH CHECK) or delete one (USING).
    expect(write.match(/role = 'editor'/g) ?? []).toHaveLength(2);
    expect(write).toContain('USING (');
    expect(write).toContain('WITH CHECK (');
    expect(write.match(/FROM public\.knowledge_documents d/g) ?? []).toHaveLength(2);
  });

  it('11. does not widen manager, and does not touch source_reference permissions', () => {
    // MANAGER_KNOWLEDGE_WRITE_ROLE_DEBT stays a debt in this slice.
    expect(STATEMENTS).not.toContain("role = 'manager'");
    // No historical policy is redefined here.
    expect(STATEMENTS).not.toContain('source_references_write');
    expect(STATEMENTS).not.toContain('source_references_select');
    expect(STATEMENTS).not.toMatch(/ALTER TABLE public\.source_references/);
    expect(STATEMENTS).not.toMatch(/DROP (TABLE|POLICY|COLUMN)/);
  });

  it('12. reuses the project updated_at trigger rather than inventing one', () => {
    expect(STATEMENTS).toContain('EXECUTE FUNCTION public.update_updated_at_column()');
  });
});
