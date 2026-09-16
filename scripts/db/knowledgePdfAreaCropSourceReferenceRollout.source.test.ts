import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KNOWLEDGE_PDF_AREA_CROP_SOURCE_REFERENCE_1 -- the shipped artifacts.
 *
 * `[db.migrations] enabled = false` in config.toml and supabase/BASELINE.md
 * records that supabase/migrations/ does NOT rebuild the live database, so a
 * migration reaches production only through its production-rollouts copy. The
 * house convention is therefore a PAIR -- the rollout and a read-only verifier
 * beside it -- and this file is what makes that pair enforceable rather than
 * conventional. It follows scripts/db/syncedNotePairRpc.test.ts's artifact
 * section and scripts/db/imageLibraryRollout.source.test.ts's verifier
 * contract, minus the engine: every claim here is about file content, so it
 * needs no database and runs anywhere.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260916120000_knowledge_pdf_area_crop_source_reference.sql';
const ROLLOUT = 'supabase/production-rollouts/20260916120000_knowledge_pdf_area_crop_source_reference.sql';
const VERIFY = 'supabase/production-rollouts/20260916120000_knowledge_pdf_area_crop_source_reference_verify.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);

/** Statements only. Prose about a verb is not the verb. */
const verifierStatements = verifier.replace(/^\s*--.*$/gm, '');

describe('the rollout and its verifier ship as a pair', () => {
  it('1. both artifacts exist and are not empty', () => {
    expect(rollout.length).toBeGreaterThan(0);
    expect(verifier.length).toBeGreaterThan(0);
  });

  it('2. the rollout names the reviewed migration as its source', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
  });

  it('3. the rollout ships the same two function bodies as the migration', () => {
    const bodyOf = (sql: string, name: string) => {
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      expect(at, `function not found: ${name}`).toBeGreaterThan(-1);
      const from = sql.indexOf('AS $$', at) + 'AS $$'.length;
      return sql.slice(from, sql.indexOf('$$;', from));
    };
    for (const name of [
      'create_knowledge_pdf_area_image_post_with_library_item',
      'create_knowledge_pdf_area_image_reuse_placement',
    ]) {
      expect(bodyOf(rollout, name), `${name} must be byte-faithful`).toBe(bodyOf(migration, name));
    }
  });

  it('4. both apply as ONE transaction -- a half-applied state is not a state', () => {
    // New crops carrying a reference while the existing ones silently do not
    // is precisely the split this migration exists to end.
    for (const [name, sql] of [['migration', migration], ['rollout', rollout]] as const) {
      expect(sql, name).toContain('BEGIN;');
      expect(sql.trimEnd(), name).toMatch(/COMMIT;$/);
    }
  });

  it('5. the backfill is driven by the data, never by a list of ids', () => {
    expect(rollout).toContain("p.metadata -> 'source' ->> 'kind' = 'knowledge-pdf-area'");
    // Judged by the same mirror the two functions use, so it cannot admit a row
    // the creators would refuse -- whose casts would then abort the apply.
    expect(rollout).toContain('public.is_knowledge_pdf_area_provenance(p.metadata)');
    // Re-runnable, because no unique constraint makes it so.
    expect(rollout).toContain('NOT EXISTS (');
    // Reversible: the apply must print the ids it created.
    expect(rollout).toContain('RETURNING id;');
    // A hand-listed id would defeat all of the above.
    expect(rollout).not.toMatch(/target_padlet_id\s+IN\s*\(\s*'[0-9a-f]{8}-/i);
  });
});

describe('the verifier contract', () => {
  it('6. is genuinely read only', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd()).toMatch(/ROLLBACK;$/);
    for (const forbidden of ['CREATE TABLE', 'ALTER TABLE', 'CREATE OR REPLACE', 'CREATE FUNCTION',
      'CREATE INDEX', 'INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'GRANT ', 'REVOKE ',
      'DROP ', 'SET ROLE', 'ALTER FUNCTION']) {
      expect(verifierStatements, forbidden).not.toContain(forbidden);
    }
    // And nothing that would write even if it parsed as a read.
    expect(verifierStatements).not.toMatch(/\bINTO\s+\w/);
    expect(verifierStatements).not.toContain('nextval');
  });

  it('7. is catalog-first: it proves both functions now write the reference', () => {
    expect(verifier).toContain('to_regprocedure(');
    expect(verifier).toContain('create_knowledge_pdf_area_image_post_with_library_item');
    expect(verifier).toContain('create_knowledge_pdf_area_image_reuse_placement');
    expect(verifier).toContain("position('source_references' IN");
    // The signature is load-bearing: knowledgePdfAreaImageRoute.ts calls the
    // creator by name and a changed one would be a different function.
    expect(verifier).toContain("'uuid','uuid','uuid','text','text','float8','float8'");
  });

  it('8. asserts the constraint set the region shape depends on', () => {
    for (const constraint of [
      'source_references_region_single_page_check',
      'source_references_region_text_exclusion_check',
      'source_references_region_complete_check',
      'source_references_region_bounds_check',
      'source_references_page_start_check',
      'source_references_page_range_check',
      'source_references_char_range_check',
    ]) {
      expect(verifier, constraint).toContain(constraint);
    }
    expect(verifier).toContain('FOREIGN KEY (target_padlet_id)');
    expect(verifier).toContain('FOREIGN KEY (source_document_id)');
  });

  it('9. counts crops against crops with a reference, so a pass is visible', () => {
    expect(verifier).toContain('crop_total');
    expect(verifier).toContain('crop_with_region_reference');
    expect(verifier).toContain('crop_without_reference');
    expect(verifier).toContain('0 after');
  });

  it('10. ends with a single roll-up carrying PASS/FAIL and the counts', () => {
    expect(verifier).toContain("THEN 'PASS' ELSE 'FAIL' END");
    expect(verifier).toContain('AS rollup');
    expect(verifier).toContain('AS pdf_area_crops');
    expect(verifier).toContain('AS crops_without_reference');
    // Per-row readiness cannot drift from the rows above it.
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('11. performs no backfill of its own', () => {
    expect(verifierStatements).not.toContain('RETURNING');
    expect(verifierStatements).not.toMatch(/\bUPDATE\s+public\./);
    expect(verifierStatements).not.toMatch(/\bDELETE\s+FROM\b/);
  });
});
