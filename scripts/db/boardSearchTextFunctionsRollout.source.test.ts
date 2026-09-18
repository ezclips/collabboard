import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOARD_SEARCH_READ_1 -- the shipped artifacts.
 *
 * `[db.migrations] enabled = false` in config.toml and supabase/BASELINE.md
 * record that supabase/migrations/ does NOT rebuild the live database, so a
 * migration reaches production only through its production-rollouts copy. The
 * house convention is a PAIR -- the rollout and a read-only verifier beside it,
 * plus a rollback -- and this file is what makes that enforceable rather than
 * conventional. Every claim here is about file content, so it needs no database.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260918130000_board_search_text_functions.sql';
const ROLLOUT = 'supabase/production-rollouts/20260918130000_board_search_text_functions.sql';
const VERIFY = 'supabase/production-rollouts/20260918130000_board_search_text_functions_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260918130000_board_search_text_functions_rollback.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);

/** Statements only. Prose about a verb is not the verb. */
const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const bodyOf = (sql: string) => sql.slice(sql.indexOf('\nBEGIN;'));

const FUNCTIONS = ['search_board_posts_text', 'search_board_knowledge_chunks_text'] as const;

describe('the rollout ships exactly what was reviewed', () => {
  it('1. all four artifacts exist and are not empty', () => {
    for (const artifact of [migration, rollout, verifier, rollbackScript]) {
      expect(artifact.length).toBeGreaterThan(0);
    }
  });

  it('2. the rollout names the reviewed migration as its source', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
  });

  it('3. the rollout body is byte-faithful to the migration body', () => {
    // The whole point of the convention: what runs in production is what was
    // reviewed, not a retyped approximation of it.
    expect(bodyOf(rollout)).toBe(bodyOf(migration));
  });
});

describe('the functions are locked down', () => {
  it('4. both are SECURITY INVOKER, never DEFINER', () => {
    const statements = statementsOf(migration);
    expect((statements.match(/SECURITY INVOKER/g) ?? [])).toHaveLength(2);
    // A board-scoped read running as its owner would be RLS switched off on a
    // function whose only meaningful argument is a board id.
    expect(statements).not.toContain('SECURITY DEFINER');
  });

  it('5. EXECUTE is revoked from PUBLIC, anon AND authenticated on both', () => {
    for (const fn of FUNCTIONS) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}(uuid, text, integer)\n    FROM PUBLIC, anon, authenticated;`,
      );
    }
  });

  it('6. EXECUTE is granted to the server role only', () => {
    const statements = statementsOf(migration);
    for (const fn of FUNCTIONS) {
      expect(statements).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(uuid, text, integer)\n    TO service_role;`);
    }
    // Nothing else is granted anywhere in the file.
    const grants = statements.match(/GRANT EXECUTE[\s\S]*?TO (\w+);/g) ?? [];
    expect(grants).toHaveLength(2);
    for (const grant of grants) expect(grant).toContain('TO service_role;');
  });
});

describe('the query must be able to use the indexes', () => {
  it('7. the config is the LITERAL simple in every expression, never a column', () => {
    const statements = statementsOf(migration);
    // A GIN index over to_tsvector('simple'::regconfig, ...) is only usable by a
    // query whose own expression matches it. A column or a parameter here would
    // silently seq-scan.
    expect(statements).not.toMatch(/to_tsvector\(\s*\w+\.search_config/);
    expect(statements).not.toContain('current_setting');
    expect((statements.match(/'simple'::regconfig/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('8. the posts query repeats the partial index predicate plainly', () => {
    // padlets_search_gin is partial on type IN ('text','note'); a query that
    // does not carry the same predicate cannot use it, however well the
    // expression matches.
    expect(statementsOf(migration)).toContain("p.type IN ('text', 'note')");
    // Not through an array parameter or any other indirection the planner
    // cannot prove implies the index predicate.
    expect(statementsOf(migration)).not.toContain('= ANY(p_types)');
  });

  it('9. the posts expression is the index expression, character for character', () => {
    const indexMigration = read('supabase/migrations/20260918120000_board_search_config.sql');
    // The projection call and the title-leading concatenation must match, or the
    // index stops being used and the only symptom is latency.
    for (const fragment of [
      "WHEN public.plain_text_from_post_content(",
      "ELSE ' ' || public.plain_text_from_post_content(",
    ]) {
      expect(indexMigration).toContain(fragment);
      expect(migration).toContain(fragment);
    }
  });
});

describe('the verifier and the rollback', () => {
  it('10. the verifier is read-only and rolls back', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    const statements = statementsOf(verifier);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statements, `verifier must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
  });

  it('11. the verifier reports readiness as a conjunction over its own rows', () => {
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('12. the verifier checks the dangerous attributes, not just existence', () => {
    for (const claim of ['SECURITY INVOKER', 'prosecdef', 'relrowsecurity', 'aclexplode']) {
      expect(verifier).toContain(claim);
    }
  });

  it('13. the rollback drops both functions by full signature and nothing else', () => {
    const statements = statementsOf(rollbackScript);
    for (const fn of FUNCTIONS) {
      expect(statements).toContain(`DROP FUNCTION IF EXISTS public.${fn}(uuid, text, integer);`);
    }
    // It must NOT touch the previous migration's objects, which have their own
    // rollback, nor the older vector RPC whose name is one suffix away.
    expect(statements).not.toContain('plain_text_from_post_content');
    expect(statements).not.toContain('padlets_search_gin');
    expect(statements).not.toContain('knowledge_chunks_search_gin');
    expect(statements).not.toMatch(/search_board_knowledge_chunks\(/);
  });
});
