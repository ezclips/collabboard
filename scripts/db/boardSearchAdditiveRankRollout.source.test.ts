import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOARD_SEARCH_READ_5 -- additive ranking, pinned in SQL.
 *
 * THE ASSERTION THIS FILE EXISTS FOR IS TEST 2, and it is subtler than the
 * rollout tests beside it. The old rank and the new rank BOTH contain the word
 * GREATEST -- the additive form still takes the greater of `english` and
 * `german` in its ELSE branch. So "the body mentions GREATEST" cannot tell them
 * apart, and a check that asked only that would pass on the very expression this
 * migration replaces. What separates them is the CASE guard on whether `simple`
 * matched.
 *
 * TEST 3 IS THE OTHER HALF. Matching must STILL be the three-way OR. Restricting
 * the match to `simple` would "fix" the ordering by deleting every row the added
 * configurations contributed -- including q07's, the single rated-relevant gain
 * in the whole set. Rank and recall are therefore asserted independently.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260918170000_board_search_additive_rank.sql';
const ROLLOUT = 'supabase/production-rollouts/20260918170000_board_search_additive_rank.sql';
const VERIFY = 'supabase/production-rollouts/20260918170000_board_search_additive_rank_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260918170000_board_search_additive_rank_rollback.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);
const previous = read('supabase/migrations/20260918160000_board_search_language_vectors.sql');

const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const bodyOf = (sql: string) => sql.slice(sql.indexOf('\nBEGIN;'));

describe('the added configurations no longer re-rank rows they did not add', () => {
  it('1. no index work — nothing here is rebuilt or locked', () => {
    const statements = statementsOf(migration);
    expect(statements).not.toContain('CREATE INDEX');
    expect(statements).not.toContain('DROP INDEX');
  });

  it('2. the rank is guarded by a CASE on whether `simple` matched, not a bare GREATEST', () => {
    const statements = statementsOf(migration);
    // Both functions. The guard is what distinguishes this from the expression
    // it replaces, which also contains GREATEST.
    expect((statements.match(/CASE WHEN pg_catalog\.to_tsvector\('simple'::regconfig/g) ?? []))
      .toHaveLength(2);
    expect((statements.match(/ELSE GREATEST\(/g) ?? [])).toHaveLength(2);
    // And the replaced form -- GREATEST as the whole rank -- is gone.
    expect(statements).not.toMatch(/\) AS rank[\s\S]{0,40}GREATEST\(\n\s+pg_catalog\.ts_rank\(pg_catalog\.to_tsvector\('simple'/);
  });

  it('3. MATCHING is still the three-way OR, so nothing stops being retrieved', () => {
    const statements = statementsOf(migration);
    for (const q of ['@@ q.q_simple', '@@ q.q_english', '@@ q.q_german']) {
      // Once per function in the match predicate, plus the posts CASE guard.
      expect(statements.includes(q), `match predicate lost ${q}`).toBe(true);
    }
    expect((statements.match(/@@ q\.q_english/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((statements.match(/@@ q\.q_german/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('4. everything the earlier migrations decided survives', () => {
    const statements = statementsOf(migration);
    for (const invariant of [
      "type IN ('text', 'note', 'card')",
      "ORDER BY rank DESC, (public.plain_text_from_post_content(p.content) <> '') DESC, p.id ASC",
      'LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);',
      "SET search_path = ''",
      'SECURITY INVOKER',
      "AND d.processing_status = 'ready'",
    ]) {
      expect(statements, `the change dropped: ${invariant}`).toContain(invariant);
    }
  });

  it('5. the posts/chunks flag asymmetry survives in BOTH branches of the CASE', () => {
    const statements = statementsOf(migration);
    const posts = statements.slice(
      statements.indexOf('FUNCTION public.search_board_posts_text'),
      statements.indexOf('FUNCTION public.search_board_knowledge_chunks_text'),
    );
    const chunks = statements.slice(statements.indexOf('FUNCTION public.search_board_knowledge_chunks_text'));
    // Three ranks per function: the THEN branch plus the two in the ELSE.
    expect((posts.match(/q\.q_\w+, 0\)/g) ?? [])).toHaveLength(3);
    expect(posts).not.toMatch(/q\.q_\w+, 1\)/);
    expect((chunks.match(/q\.q_\w+, 1\)/g) ?? [])).toHaveLength(3);
    expect(chunks).not.toMatch(/q\.q_\w+, 0\)/);
  });

  it('6. the released migration was NOT edited', () => {
    expect(previous).toMatch(/GREATEST\(\n/);
    expect(previous).not.toContain('ELSE GREATEST(');
  });
});

describe('the evidence and the limits are in the file, not only in a chat log', () => {
  it('7. the q05 inversion that motivated it is recorded with both pairs of numbers', () => {
    expect(migration).toContain('0.011075');
    expect(migration).toContain('0.009579');
    // And what it was before the configurations were added, so the claim that
    // this is a REGRESSION rather than a pre-existing defect is checkable.
    expect(migration).toContain('0.006487');
    expect(migration).toContain('0.006154');
  });

  it('8. the rating outcome is recorded: nine of ten additions are irrelevant', () => {
    expect(migration).toMatch(/NINE OF THE\n-- TEN ADDITIONS ARE IRRELEVANT/);
    // The named collisions, so the mechanism is not rediscovered.
    for (const collision of ['`bumper` -> de `bump`', '`note`   -> de `not`', '`fix`    -> en `fix`']) {
      expect(migration, `collision missing: ${collision}`).toContain(collision);
    }
    // The control question being no longer empty is the most serious of them.
    expect(migration).toContain('THE CONTROL QUESTION');
  });

  it('9. the one genuine gain is named, and survives the change', () => {
    expect(migration).toMatch(/THE ONE GENUINE GAIN is q07/);
    expect(migration).toContain('"stimulators"');
  });

  it('10. what it does NOT fix is stated with the number that proves it', () => {
    expect(migration).toMatch(/WHAT THIS DOES \*\*NOT\*\* FIX/);
    // q09's post is still the top of its block on a collision.
    expect(migration).toContain('0.018998');
    expect(migration).toMatch(/STILL THE TOP OF THE BLOCK/);
  });
});

describe('the artifacts ship as a set', () => {
  it('11. the rollout names its source and is byte-faithful to the migration body', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    expect(bodyOf(rollout)).toBe(bodyOf(migration));
  });

  it('12. the verifier is read-only, rolls back, and can tell the two rank forms apart', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statementsOf(verifier), `verifier must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
    // The distinguishing check, and the recall check that must accompany it.
    expect(verifier).toContain('MAXIMUM (not reverted)');
    expect(verifier).toContain('matching is STILL the three-way OR');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('13. the verifier matches the type predicate literal by literal, not by rendering', () => {
    // 20260918160000's row 14 hard-coded one rendering of the predicate and
    // false-failed on three correctly widened indexes. This one does not repeat
    // that, and neither does the fixed row 14 beside it.
    const fixed = read('supabase/production-rollouts/20260918160000_board_search_language_vectors_verify.sql');
    expect(fixed).toContain('rendering-independent');
    expect(fixed).not.toContain("''text''::text, ''note''::text, ''card''::text");
    expect(verifier).not.toContain('::character varying');
  });

  it('14. the rollback restores GREATEST, touches no index, and says what it costs', () => {
    expect(statementsOf(rollbackScript)).not.toContain('DROP FUNCTION');
    expect(statementsOf(rollbackScript)).not.toContain('CREATE INDEX');
    expect((statementsOf(rollbackScript).match(/GREATEST\(\n/g) ?? [])).toHaveLength(2);
    expect(statementsOf(rollbackScript)).not.toContain('ELSE GREATEST(');
    expect(rollbackScript).toContain('0.011075');
    expect(rollbackScript).toMatch(/WHEN RUNNING IT IS NEVERTHELESS RIGHT/i);
  });
});
