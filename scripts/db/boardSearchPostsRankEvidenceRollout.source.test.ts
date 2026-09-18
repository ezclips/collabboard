import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOARD_SEARCH_READ_3 -- the posts ranking decision, pinned in SQL.
 *
 * These assertions read the SQL as source, for the same reason the rank
 * normalization file beside them does: THE THING BEING PROTECTED HAS NO ERROR
 * MODE. `ts_rank(v, q, 0)` and `ts_rank(v, q, 1)` both compile, both run, and
 * both return every matching row. An ORDER BY with the tie-break and one without
 * it are equally valid SQL. They differ only in ORDER -- and the order is the
 * entire feature, because what sorts last is what gets dropped first when the
 * budget is tight.
 *
 * THE TWO FUNCTIONS MUST NOT AGREE, which is the unusual assertion here. Posts
 * are on flag 0 and chunks are on flag 1, deliberately: their ranks are never
 * compared (the caller takes top-K per source), and chunks need length
 * normalization that posts do not. A later reader "tidying" them to match would
 * silently undo a measured decision. Test 5 fails when they do.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260918150000_board_search_posts_rank_evidence.sql';
const ROLLOUT = 'supabase/production-rollouts/20260918150000_board_search_posts_rank_evidence.sql';
const VERIFY = 'supabase/production-rollouts/20260918150000_board_search_posts_rank_evidence_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260918150000_board_search_posts_rank_evidence_rollback.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);
const previous = read('supabase/migrations/20260918140000_board_search_rank_normalization.sql');

const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const bodyOf = (sql: string) => sql.slice(sql.indexOf('\nBEGIN;'));

describe('the posts rank is evidence, not length', () => {
  it('1. the posts function passes normalization flag 0 to ts_rank', () => {
    const statements = statementsOf(migration);
    expect(statements).toContain('pg_catalog.ts_rank(matched.document, q.query, 0) AS rank');
    // Exactly one ts_rank call: this migration defines one function.
    expect((statements.match(/ts_rank\(/g) ?? [])).toHaveLength(1);
  });

  it('2. the flag is the third ARGUMENT, not the default, and not flag 1', () => {
    const statements = statementsOf(migration);
    // The two-argument form is the silent regression the whole file guards.
    expect(statements).not.toMatch(/ts_rank\(matched\.document,\s*q\.query\)/);
    expect(statements).not.toContain(', 1) AS rank');
  });

  it('3. the ORDER BY states body-over-title-only, ahead of the id tie-break', () => {
    const statements = statementsOf(migration);
    expect(statements).toContain(
      "ORDER BY rank DESC, (matched.text <> '') DESC, matched.padlet_id ASC",
    );
  });

  it('4. the migration states WHY, with the measurement that forced it', () => {
    // A bare `0` with no reason is indistinguishable from the default nobody chose.
    expect(migration).toContain('NORMALIZATION FLAG 0 -- DELIBERATE');
    // The q02 numbers, so the next reader can check the claim rather than trust it.
    expect(migration).toContain('29 ranked characters');
    expect(migration).toMatch(/380 ranked characters/);
    // And the honest bound: the battery cannot tell the two flags apart.
    expect(migration).toMatch(/CANNOT DISCRIMINATE BETWEEN THESE TWO FLAGS/);
    expect(migration).toMatch(/UNMEASURED/);
  });

  it('5. the CHUNKS function is not touched here and stays on flag 1', () => {
    const statements = statementsOf(migration);
    expect(statements).not.toContain('CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks_text');
    // Its flag still lives in the released migration, unchanged.
    expect(statementsOf(previous)).toContain(
      "pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query, 1) AS rank",
    );
  });
});

describe('the change touched only what it claimed to touch', () => {
  it('6. signature, return shape, clamp, predicate, search_path and grants are unchanged', () => {
    const now = statementsOf(migration);
    const before = statementsOf(previous);
    for (const invariant of [
      'p_board_id uuid,',
      'p_limit integer DEFAULT 4',
      'LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);',
      "AND p.type IN ('text', 'note')",
      'SECURITY INVOKER',
      "SET search_path = ''",
      'public.plain_text_from_post_content(p.content)',
    ]) {
      expect(before, `missing from the previous migration: ${invariant}`).toContain(invariant);
      expect(now, `the correction dropped: ${invariant}`).toContain(invariant);
    }
  });

  it('7. the INDEXED EXPRESSION is byte-identical, so no rebuild is owed', () => {
    // This is the claim "no rebuild" rests on. The indexed expression is the
    // title-then-body projection under the literal simple configuration; if it
    // moved by one character the index would stop matching and the only symptom
    // would be latency.
    const expression = `pg_catalog.to_tsvector(
                'simple'::regconfig,
                COALESCE(p.title, '')
                || CASE
                       WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                       ELSE ' ' || public.plain_text_from_post_content(p.content)
                   END) AS document`;
    expect(previous).toContain(expression);
    expect(migration).toContain(expression);
  });

  it('8. the lockdown survived the CREATE OR REPLACE', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.search_board_posts_text(uuid, text, integer)\n    FROM PUBLIC, anon, authenticated;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.search_board_posts_text(uuid, text, integer)\n    TO service_role;',
    );
    const grants = statementsOf(migration).match(/GRANT EXECUTE[\s\S]*?TO (\w+);/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toContain('TO service_role;');
  });

  it('9. the released migrations were NOT edited', () => {
    expect(previous).toContain('pg_catalog.ts_rank(matched.document, q.query, 1) AS rank');
    expect(previous).not.toContain("(matched.text <> '') DESC");
  });
});

describe('the artifacts ship as a set', () => {
  it('10. the rollout names its source and is byte-faithful to the migration body', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    expect(bodyOf(rollout)).toBe(bodyOf(migration));
  });

  it('11. the verifier is read-only, rolls back, and checks both halves of the change', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statementsOf(verifier), `verifier must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
    // No catalog column records a normalization flag or an ORDER BY, so the body
    // is read back instead.
    expect(verifier).toContain('pg_get_functiondef');
    expect(verifier).toContain('ts_rank(matched.document, q.query, 0)');
    expect(verifier).toContain('body-over-title-only tie-break');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('12. the verifier asserts the ASYMMETRY, not just the posts side', () => {
    // The decision is "posts 0, chunks 1". A verifier that checked only the posts
    // half would pass on a database where someone had helpfully made them match.
    expect(verifier).toContain('chunks are STILL on flag 1 -- the two must differ');
  });

  it('13. the rollback REVERTS rather than drops, and says what that costs', () => {
    expect(rollbackScript).toContain('CREATE OR REPLACE FUNCTION public.search_board_posts_text(');
    expect(statementsOf(rollbackScript)).not.toContain('DROP FUNCTION');
    // It restores exactly the previous body: flag 1, no tie-break.
    expect(statementsOf(rollbackScript)).toContain('pg_catalog.ts_rank(matched.document, q.query, 1) AS rank');
    expect(statementsOf(rollbackScript)).not.toContain("(matched.text <> '') DESC");
    // It leaves the chunks function alone, because this change never touched it.
    expect(statementsOf(rollbackScript)).not.toContain('search_board_knowledge_chunks_text(');
    // And it warns that the regression it restores is silent.
    expect(rollbackScript).toMatch(/NO ERROR WHEN THIS TAKES EFFECT/i);
    // It also states when running it is the RIGHT call, which is the half a
    // rollback header usually omits.
    expect(rollbackScript).toMatch(/WHEN RUNNING IT IS NEVERTHELESS RIGHT/i);
  });
});
