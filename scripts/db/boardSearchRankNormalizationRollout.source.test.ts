import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOARD_SEARCH_READ_2 -- the rank normalization correction, pinned in SQL.
 *
 * These assertions read the SQL as source, the way the projection's fixtures are
 * pinned, because THE THING BEING PROTECTED HAS NO ERROR MODE. `ts_rank(v, q)`
 * and `ts_rank(v, q, 1)` both compile, both run, and both return every matching
 * row. They differ only in ORDER -- and the default, flag 0, ignores document
 * length entirely, so it orders a corpus whose posts have a median of 13
 * characters and whose chunks reach 6,000 mostly by size.
 *
 * A regression here would be completely silent. This file is the alarm.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260918140000_board_search_rank_normalization.sql';
const ROLLOUT = 'supabase/production-rollouts/20260918140000_board_search_rank_normalization.sql';
const VERIFY = 'supabase/production-rollouts/20260918140000_board_search_rank_normalization_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260918140000_board_search_rank_normalization_rollback.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);

const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const bodyOf = (sql: string) => sql.slice(sql.indexOf('\nBEGIN;'));

const FUNCTIONS = ['search_board_posts_text', 'search_board_knowledge_chunks_text'] as const;

describe('the rank flag is deliberate, and pinned', () => {
  it('1. both functions pass normalization flag 1 to ts_rank', () => {
    const statements = statementsOf(migration);
    const calls = statements.match(/ts_rank\([\s\S]*?\)\s+AS rank/g) ?? [];
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      // The third argument, not just "a 1 appears somewhere".
      expect(call).toMatch(/,\s*1\)\s+AS rank$/);
    }
  });

  it('2. no ts_rank call anywhere is left on the default', () => {
    // The two-argument form is the silent regression this whole file exists for.
    const statements = statementsOf(migration);
    expect(statements).not.toMatch(/ts_rank\(matched\.document,\s*q\.query\)/);
    expect(statements).not.toMatch(/q\.query\)\s+AS rank/);
  });

  it('3. the migration states WHY the flag is there, for the next reader', () => {
    // A bare `1` with no reason is indistinguishable from a typo.
    expect(migration).toContain('NORMALIZATION FLAG 1 -- DELIBERATE');
    expect(migration).toMatch(/1 \+ log\(/);
    // And says what the default would have done instead.
    expect(migration).toMatch(/default normalization is 0/i);
  });

  it('4. both functions set an EMPTY search_path', () => {
    const statements = statementsOf(migration);
    expect((statements.match(/SET search_path = ''/g) ?? [])).toHaveLength(2);
    expect(statements).not.toContain('SET search_path = public');
  });
});

describe('the correction changed ONLY what it claimed to change', () => {
  const previous = read('supabase/migrations/20260918130000_board_search_text_functions.sql');

  it('5. signatures, return shapes, clamp, predicate and grants are unchanged', () => {
    const now = statementsOf(migration);
    const before = statementsOf(previous);
    for (const invariant of [
      'p_board_id uuid,',
      'p_limit integer DEFAULT 4',
      "LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);",
      "AND p.type IN ('text', 'note')",
      "AND d.processing_status = 'ready'",
      'SECURITY INVOKER',
      'source_locators jsonb,',
    ]) {
      expect(before, `missing from the previous migration: ${invariant}`).toContain(invariant);
      expect(now, `the correction dropped: ${invariant}`).toContain(invariant);
    }
  });

  it('6. the lockdown survived the CREATE OR REPLACE', () => {
    for (const fn of FUNCTIONS) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}(uuid, text, integer)\n    FROM PUBLIC, anon, authenticated;`,
      );
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${fn}(uuid, text, integer)\n    TO service_role;`,
      );
    }
    const grants = statementsOf(migration).match(/GRANT EXECUTE[\s\S]*?TO (\w+);/g) ?? [];
    expect(grants).toHaveLength(2);
    for (const grant of grants) expect(grant).toContain('TO service_role;');
  });

  it('7. the config is still the literal simple, so the indexes stay usable', () => {
    const statements = statementsOf(migration);
    expect((statements.match(/'simple'::regconfig/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(statements).not.toContain('current_setting');
  });

  it('8. the released migration was NOT edited', () => {
    // This repository does not rewrite released migrations; a database that
    // already ran one would never see the change.
    expect(previous).toContain('SET search_path = public');
    expect(previous).not.toContain(', 1) AS rank');
  });
});

describe('the artifacts ship as a set', () => {
  it('9. the rollout names its source and is byte-faithful to the migration body', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    expect(bodyOf(rollout)).toBe(bodyOf(migration));
  });

  it('10. the verifier is read-only, rolls back, and checks the flag itself', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statementsOf(verifier), `verifier must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
    // No catalog column records a normalization flag, so the body is read back.
    expect(verifier).toContain('pg_get_functiondef');
    expect(verifier).toContain('ts_rank(%, 1)');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('11. the rollback REVERTS rather than drops, and says what that costs', () => {
    // Dropping would leave the application calling functions that are gone --
    // a harder failure than the one being undone.
    expect(rollbackScript).toContain('CREATE OR REPLACE FUNCTION public.search_board_posts_text(');
    expect(rollbackScript).toContain('CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks_text(');
    expect(statementsOf(rollbackScript)).not.toContain('DROP FUNCTION');
    // And it warns that the regression it restores is silent.
    expect(rollbackScript).toMatch(/NO ERROR WHEN THIS TAKES EFFECT/i);
  });
});
