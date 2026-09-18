import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOARD_SEARCH_READ_6 -- the two-term rank rule, pinned in SQL.
 *
 * THREE RANK EXPRESSIONS NOW EXIST IN THIS PROJECT'S HISTORY AND ALL THREE
 * CONTAIN THE WORD GREATEST:
 *
 *   GREATEST(s, e, g)                                   20260918160000
 *   CASE WHEN n_simple > 0 THEN s ELSE GREATEST(e, g)   20260918170000
 *   CASE WHEN n_simple >= 2 THEN s WHEN ... THEN ...    this one
 *
 * So every assertion here is written against the BOUNDARY, not against the
 * vocabulary. A test for "mentions GREATEST", or even for "mentions CASE WHEN
 * n_simple", would pass on the expression this migration replaces -- which is
 * the disqualified one that drops q07's page.
 */

const ROOT = process.cwd();
const MIGRATION = 'supabase/migrations/20260918180000_board_search_minimal_evidence_rank.sql';
const ROLLOUT = 'supabase/production-rollouts/20260918180000_board_search_minimal_evidence_rank.sql';
const VERIFY = 'supabase/production-rollouts/20260918180000_board_search_minimal_evidence_rank_verify.sql';
const ROLLBACK = 'supabase/production-rollouts/20260918180000_board_search_minimal_evidence_rank_rollback.sql';

const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const migration = read(MIGRATION);
const rollout = read(ROLLOUT);
const verifier = read(VERIFY);
const rollbackScript = read(ROLLBACK);
const previous = read('supabase/migrations/20260918170000_board_search_additive_rank.sql');

const statementsOf = (sql: string) => sql.replace(/^\s*--.*$/gm, '');
const bodyOf = (sql: string) => sql.slice(sql.indexOf('\nBEGIN;'));

describe('the rule is the boundary, not the vocabulary', () => {
  it('1. both functions use the TWO-TERM guard', () => {
    expect((statementsOf(migration).match(/CASE WHEN n\.n_simple >= 2/g) ?? [])).toHaveLength(2);
  });

  it('2. the stemmed view supersedes only on STRICTLY more terms', () => {
    const statements = statementsOf(migration);
    expect((statements.match(/GREATEST\(n\.n_english, n\.n_german\) > n\.n_simple/g) ?? [])).toHaveLength(2);
    // With >= it would fire on every tie, which is precisely the q05 boost the
    // two scored options failed on.
    expect(statements).not.toContain('>= n.n_simple');
  });

  it('3. the disqualified additive guard is GONE, not merely accompanied', () => {
    const statements = statementsOf(migration);
    expect(statements).not.toContain('n_simple > 0');
    // And the released migration that carries it was not edited.
    expect(statementsOf(previous)).toContain('CASE WHEN pg_catalog.to_tsvector');
    expect(statementsOf(previous)).not.toContain('n_simple >= 2');
  });

  it('4. MATCHING is still the three-way OR, so nothing stops being retrieved', () => {
    const statements = statementsOf(migration);
    for (const q of ['@@ q.q_simple', '@@ q.q_english', '@@ q.q_german']) {
      expect((statements.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it('5. the term counts are NOT in the match qual — the indexes depend on it', () => {
    // The qual lives in the `matched` CTE; the counts live in laterals after it.
    // A count in the qual would stop the planner matching the six GIN indexes and
    // turn every search into a sequential scan over the projection.
    const statements = statementsOf(migration);
    for (const marker of ['matched AS (', 'CROSS JOIN LATERAL']) {
      expect(statements).toContain(marker);
    }
    // The qual is the `matched` CTE ONLY. It ends where the outer SELECT begins
    // -- an earlier version of this test sliced to the first lateral instead,
    // which swept in the outer SELECT's rank CASE and found the counts there.
    const cteStart = statements.indexOf('matched AS (');
    const cteEnd = statements.indexOf('    )\n    SELECT', cteStart);
    expect(cteStart, '`matched` CTE not found').toBeGreaterThan(-1);
    expect(cteEnd, 'end of the `matched` CTE not found').toBeGreaterThan(cteStart);
    const qualRegion = statements.slice(cteStart, cteEnd);
    // Sanity: the region really is the qual, three OR branches and no more.
    expect((qualRegion.match(/@@ q\.q_/g) ?? [])).toHaveLength(3);
    for (const count of ['n_simple', 'n_english', 'n_german']) {
      expect(qualRegion, `${count} must not appear before the laterals`).not.toContain(count);
    }
  });

  it('6. the qual still spells the indexed expression exactly', () => {
    // Index-expression matching compares parse trees. This is the same string the
    // three padlets indexes were built on in 20260918160000.
    const indexed = "COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)";
    expect((statementsOf(migration).match(new RegExp(indexed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []))
      .toHaveLength(3);
  });

  it('7. the projection runs ONCE per matched row, not six times', () => {
    // The previous shape called plain_text_from_post_content six times in the
    // qual and the rank. It now appears three times in the qual (once per
    // configuration, required for index matching) and once in a lateral.
    const statements = statementsOf(migration);
    expect(statements).toContain('SELECT public.plain_text_from_post_content(m.content) AS text');
  });

  it('8. an empty term cannot reach to_tsquery', () => {
    // to_tsquery('') raises 42601. Defence in depth: a malformed p_query would
    // already have raised in the `q` CTE, but a future caller might not go
    // through it.
    expect((statementsOf(migration).match(/WHERE pg_catalog\.btrim\(raw\) <> ''/g) ?? [])).toHaveLength(2);
  });

  it('9. everything the earlier migrations decided survives', () => {
    const statements = statementsOf(migration);
    for (const invariant of [
      "type IN ('text', 'note', 'card')",
      "ORDER BY rank DESC, (body.text <> '') DESC, m.id ASC",
      'LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);',
      "SET search_path = ''",
      'SECURITY INVOKER',
      "AND d.processing_status = 'ready'",
    ]) {
      expect(statements, `the change dropped: ${invariant}`).toContain(invariant);
    }
  });

  it('10. the flag asymmetry survives in every branch of the CASE', () => {
    const statements = statementsOf(migration);
    const posts = statements.slice(
      statements.indexOf('FUNCTION public.search_board_posts_text'),
      statements.indexOf('FUNCTION public.search_board_knowledge_chunks_text'),
    );
    const chunks = statements.slice(statements.indexOf('FUNCTION public.search_board_knowledge_chunks_text'));
    // Four ranks per function: the THEN, the two in the supersede branch, the
    // ELSE. Whitespace-tolerant: the arguments are column-aligned, so some of
    // these carry two spaces before the flag.
    expect((posts.match(/m\.q_\w+,\s*0\)/g) ?? [])).toHaveLength(4);
    expect(posts).not.toMatch(/m\.q_\w+,\s*1\)/);
    expect((chunks.match(/m\.q_\w+,\s*1\)/g) ?? [])).toHaveLength(4);
    expect(chunks).not.toMatch(/m\.q_\w+,\s*0\)/);
  });
});

describe('the evidence and the caveats are in the file', () => {
  it('11. it records that BOTH scored options failed, and why the hypothesis was wrong', () => {
    expect(migration).toMatch(/BOTH FAIL THE BAR/);
    // The measurement that falsified the equal-term-count hypothesis.
    expect(migration).toContain('n_simple = 2, n_english = 3');
    // And that the options were worse than what they replaced.
    expect(migration).toContain('1.71x');
    expect(migration).toContain('1.16x');
  });

  it('12. it records that the two options are indistinguishable on this corpus', () => {
    expect(migration).toMatch(/cannot be told apart|CANNOT BE TOLD APART/i);
    expect(migration).toContain('options_disagree');
  });

  it('13. it lists the exact three rows it changes, with positions', () => {
    expect(migration).toContain('0.001710 -> 0.004145');
    expect(migration).toContain('0.003145 -> 0.008635');
    expect(migration).toContain('3.07x -> 1.12x');
  });

  it('14. the caveats are stated, not buried', () => {
    // The boundary is a number and says so.
    expect(migration).toMatch(/"TWO" IS A BOUNDARY, AND A BOUNDARY IS A NUMBER/);
    expect(migration).toMatch(/not been tested against 3/);
    // And the class it does not fix, with the actual lever named.
    expect(migration).toMatch(/FIXES THE PROMOTED-ROW CASE, NOT THE CLASS/);
    expect(migration).toContain('embeddings');
  });

  it('15. the EXPLAIN requirement is stated in the migration AND the rollout', () => {
    // The plan proof was taken against the previous function shape; laterals
    // change the shape even though the qual is unchanged.
    for (const [name, text] of [['migration', migration], ['rollout', rollout]] as const) {
      expect(text, `${name} does not demand a fresh EXPLAIN`).toMatch(/RE-RUN EXPLAIN/);
    }
    expect(migration).toContain('BitmapOr');
  });
});

describe('the artifacts ship as a set', () => {
  it('16. the rollout names its source and is byte-faithful to the migration body', () => {
    expect(rollout).toContain('SOURCE:');
    expect(rollout).toContain(MIGRATION);
    expect(bodyOf(rollout)).toBe(bodyOf(migration));
  });

  it('17. the verifier is read-only, rolls back, and checks the BOUNDARY', () => {
    expect(verifier).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(verifier.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statementsOf(verifier), `verifier must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
    expect(verifier).toContain('ADDITIVE (not applied)');
    expect(verifier).toContain('MAXIMUM (not applied)');
    expect(verifier).toContain('NOT STRICT -- fires on ties');
    expect(verifier).toContain('bool_and(pass) OVER () AS rollout_readiness');
  });

  it('18. the verifier admits that it cannot prove the PLAN', () => {
    // Its row 6 checks the text of the qual, not the plan. Saying so is the
    // difference between a check and a false assurance.
    expect(verifier).toMatch(/WEAKEST ROW IN THE FILE/);
    expect(verifier).toMatch(/THE PLAN MUST BE CHECKED WITH EXPLAIN/);
  });

  it('19. the rollback says plainly that what it restores is ALSO disqualified', () => {
    expect(statementsOf(rollbackScript)).not.toContain('DROP FUNCTION');
    expect(statementsOf(rollbackScript)).not.toContain('n.n_simple >= 2');
    expect(statementsOf(rollbackScript)).not.toContain('LATERAL');
    // The honest warning: there is no correct earlier expression to go back to.
    expect(rollbackScript).toMatch(/IT IS NOT A SAFE STATE/);
    expect(rollbackScript).toMatch(/PLAN regression/);
  });
});
