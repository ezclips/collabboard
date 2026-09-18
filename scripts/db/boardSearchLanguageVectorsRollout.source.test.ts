import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOARD_SEARCH_READ_4 -- design C, pinned in SQL.
 *
 * These assertions read the SQL as source, like the three rollout tests beside
 * them, and for a sharper version of the same reason: NOTHING IN THIS CHANGE HAS
 * AN ERROR MODE. A function that queries one configuration instead of three
 * compiles, runs, and returns rows -- just fewer. An index that is missing makes
 * the search slower, not wrong. A partial index whose predicate is narrower than
 * the function's qual is simply never used. Every regression here is silent and
 * shows up as "board search does not find much", which nobody traces to a
 * migration.
 *
 * THE INDEX AND THE FUNCTION MUST SPELL THE EXPRESSION IDENTICALLY, which is the
 * assertion this file exists for above all others. Expression-index matching
 * compares parse trees; if the two drift by one COALESCE the planner silently
 * falls back to a sequential scan that runs the HTML projection over every post
 * on the board. Test 7 is that check.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260918160000_board_search_language_vectors.sql';
const ROLLOUT = 'supabase/production-rollouts/20260918160000_board_search_language_vectors.sql';
const VERIFY = 'supabase/production-rollouts/20260918160000_board_search_language_vectors_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260918160000_board_search_language_vectors_rollback.sql';
const PROBE = 'scripts/db/boardSearchTitleWeightVariants.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);
const probe = read(PROBE);

const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const bodyOf = (sql: string) => sql.slice(sql.indexOf('\nBEGIN;'));

const CONFIGS = ["'simple'::regconfig", "'english'::regconfig", "'german'::regconfig"] as const;

/** The projection expression, spelled exactly once. Index and function must agree. */
const POSTS_EXPRESSION = "COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)";
const POSTS_EXPRESSION_IN_FUNCTION =
  "COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)";

describe('design C — three configurations, everywhere', () => {
  it('1. both search functions parse the query under all three configurations', () => {
    const statements = statementsOf(migration);
    for (const config of CONFIGS) {
      const queries = statements.match(new RegExp(`to_tsquery\\(${config.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) ?? [];
      expect(queries, `to_tsquery missing for ${config}`).toHaveLength(2);
    }
  });

  it('2. both rank with GREATEST across the three, never a single rank', () => {
    const statements = statementsOf(migration);
    expect((statements.match(/GREATEST\(\n/g) ?? [])).toHaveLength(2);
  });

  it('3. the asymmetry from 20260918150000 survives: posts flag 0, chunks flag 1', () => {
    const statements = statementsOf(migration);
    const posts = statements.slice(
      statements.indexOf('FUNCTION public.search_board_posts_text'),
      statements.indexOf('FUNCTION public.search_board_knowledge_chunks_text'),
    );
    const chunks = statements.slice(statements.indexOf('FUNCTION public.search_board_knowledge_chunks_text'));
    // Three ranks per function, one per configuration.
    expect((posts.match(/,\s*0\),?\n/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(posts).not.toMatch(/q\.q_\w+, 1\)/);
    expect((chunks.match(/q\.q_\w+, 1\)/g) ?? [])).toHaveLength(3);
  });

  it('4. the body-over-title-only tie-break is still there', () => {
    expect(statementsOf(migration)).toContain(
      "ORDER BY rank DESC, (public.plain_text_from_post_content(p.content) <> '') DESC, p.id ASC",
    );
  });

  it('5. six indexes: three configurations on each of the two tables', () => {
    const statements = statementsOf(migration);
    for (const name of [
      'padlets_search_gin', 'padlets_search_en_gin', 'padlets_search_de_gin',
      'knowledge_chunks_search_en_gin', 'knowledge_chunks_search_de_gin',
    ]) {
      expect(statements, `index missing: ${name}`).toContain(`CREATE INDEX IF NOT EXISTS ${name}`);
    }
    // The chunks `simple` index is NOT recreated -- its expression is unchanged,
    // so rebuilding it would pay a lock for nothing.
    expect(statements).not.toContain('CREATE INDEX IF NOT EXISTS knowledge_chunks_search_gin');
  });
});

describe('the batch — every index change that was waiting for a rebuild', () => {
  it('6. R2 widening adds `card`, in the function AND in all three padlets indexes', () => {
    const statements = statementsOf(migration);
    expect((statements.match(/type IN \('text', 'note', 'card'\)/g) ?? [])).toHaveLength(4);
    expect(statements).not.toMatch(/type IN \('text', 'note'\)/);
  });

  it('7. the index expression and the function expression are the SAME expression', () => {
    // The whole performance argument rests on this. Three indexes spell it with
    // bare column names; the function spells it with the `p.` alias.
    const statements = statementsOf(migration);
    expect((statements.match(new RegExp(POSTS_EXPRESSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []))
      .toHaveLength(3);
    // Once per configuration in the rank, once per configuration in the qual.
    expect((statements.match(new RegExp(POSTS_EXPRESSION_IN_FUNCTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []))
      .toHaveLength(6);
  });

  it('8. the double evaluation is gone — the old CASE form is nowhere', () => {
    const statements = statementsOf(migration);
    expect(statements).not.toContain("WHEN public.plain_text_from_post_content(content) = '' THEN ''");
    expect(statements).not.toContain("WHEN public.plain_text_from_post_content(p.content) = '' THEN ''");
  });

  it('9. the <br> regex is the escaped form, so it survives a non-conforming database', () => {
    const statements = statementsOf(migration);
    expect(statements).toContain("E'<br\\\\s*/?>'");
    expect(statements).not.toContain("'<br\\s*/?>'");
  });

  it('10. title weights are NOT in the index expressions — they need no rebuild', () => {
    // setweight in an index expression is what would have forced them into this
    // batch. They are scored on the shipping expressions instead, by the probe.
    expect(statementsOf(migration)).not.toContain('setweight');
    expect(probe).toContain('setweight');
  });
});

describe('what this does NOT fix is written down, not left to be rediscovered', () => {
  it('11. the migration states that q08 does not flip, with the new ratio', () => {
    expect(migration).toMatch(/q08 DOES NOT FLIP/);
    expect(migration).toContain('3.07x to 1.35x');
    // And why no rule fixes it: coverage favours the intro under english too,
    // so what changed is that the answer's vocabulary ENTERS, not its position.
    expect(migration).toContain('The introduction still leads');
    expect(migration).toContain('remains inverted');
  });

  it('12. the migration states that the `will` collision is NOT recovered', () => {
    expect(migration).toMatch(/NOT RECOVERED|is EMPTY/);
    expect(migration).toContain("to_tsvector('german', 'will')");
    // The six-word collision set, restated so it is not rediscovered again.
    expect(migration).toContain('am, an, in, so, was, will');
  });

  it('13. design B is rejected on the MEASUREMENT, not on the theory that was wrong', () => {
    // The five measured ratios, which came back mixed rather than inflated.
    for (const ratio of ['1.26x', '0.94x', '0.85x', '0.79x', '0.91x']) {
      expect(migration, `design B ratio missing: ${ratio}`).toContain(ratio);
    }
    // And the theory offered against B is recorded as having been wrong, because
    // a rejection that keeps a false reason gets re-argued from the false reason.
    expect(migration).toContain('PERTURBS rank');
  });

  it('14. R2 rejects `comment`, and says what its content actually holds', () => {
    // The finding that confirms R3's ceiling with evidence.
    expect(migration).toMatch(/comment\s+FAILS/);
    expect(migration).toContain('(+2 more)');
  });
});

describe('the artifacts ship as a set', () => {
  it('15. the rollout names its source and is byte-faithful to the migration body', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    expect(bodyOf(rollout)).toBe(bodyOf(migration));
  });

  it('16. the rollout carries the CONCURRENTLY warning, because this one builds indexes', () => {
    expect(rollout).toContain('CREATE INDEX CONCURRENTLY');
    expect(rollout).toMatch(/cannot run inside BEGIN\/COMMIT/i);
  });

  it('17. the verifier is read-only, rolls back, and checks the configuration EXISTS', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statementsOf(verifier), `verifier must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
    // A missing configuration parses fine and fails at execution -- so it is the
    // one thing that must be checked before anything else is believed.
    expect(verifier).toContain('pg_ts_config');
    expect(verifier).toContain('all three text search configurations exist');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('18. the verifier names all six indexes, since a missing one is invisible', () => {
    for (const name of [
      'padlets_search_gin', 'padlets_search_en_gin', 'padlets_search_de_gin',
      'knowledge_chunks_search_gin', 'knowledge_chunks_search_en_gin', 'knowledge_chunks_search_de_gin',
    ]) {
      expect(verifier, `verifier does not check ${name}`).toContain(name);
    }
  });

  it('19. the rollback REVERTS to the 20260918150000 state and says what it costs', () => {
    expect(statementsOf(rollbackScript)).not.toContain('DROP FUNCTION');
    // Both functions restored to their single-configuration bodies.
    expect(statementsOf(rollbackScript)).toContain('ts_rank(matched.document, q.query, 0) AS rank');
    expect(statementsOf(rollbackScript)).not.toContain("'german'::regconfig");
    // The four added indexes are dropped and the padlets index is rebuilt with
    // the OLD expression, because the restored function body needs that one.
    expect(statementsOf(rollbackScript)).toContain('DROP INDEX IF EXISTS public.padlets_search_de_gin;');
    expect(statementsOf(rollbackScript)).toContain("WHERE type IN ('text', 'note');");
    // And it is explicit about the German loss, which is the largest one.
    expect(rollbackScript).toMatch(/GERMAN STEMMING GOES AWAY/);
    expect(rollbackScript).toMatch(/WHEN RUNNING IT IS NEVERTHELESS RIGHT/i);
  });

  it('20. the probe scores title weights on ALL eleven questions, not on q02 alone', () => {
    for (const question of [
      'q01-iran', 'q02-audi-horn', 'q03-trump-note', 'q04-bike-chain', 'q05-hypermodern',
      'q06-absent', 'q07-tens', 'q08-knitting', 'q09-watson', 'q10-spreizniete', 'q11-noise-only',
    ]) {
      expect(probe, `probe is missing ${question}`).toContain(question);
    }
    expect(probe).toContain('BEGIN TRANSACTION READ ONLY;');
    // It must score against the SHIPPING expressions, or it measures a vector
    // that does not exist.
    expect(probe).toContain("'german'::regconfig");
    expect(probe).toContain("type IN ('text', 'note', 'card')");
  });
});
