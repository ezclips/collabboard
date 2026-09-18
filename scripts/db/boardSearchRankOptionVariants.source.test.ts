import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The ranking-option probe, pinned as source.
 *
 * A PROBE CAN BE WRONG IN A WAY THAT LOOKS RIGHT, which is why it is worth
 * asserting on. It returns numbers whatever it computes, and a mis-specified
 * candidate would produce a clean table that settles the wrong question -- the
 * failure mode that cost this project the "6x on q02" and the "3x inflation"
 * theory. So the two option expressions are pinned here in the exact algebraic
 * form the report claims for them, and the two already-shipped expressions are
 * pinned beside them so the comparison is against what actually ran.
 */

const ROOT = process.cwd();
const PROBE = 'scripts/db/boardSearchRankOptionVariants.sql';
const probe = readFileSync(resolve(ROOT, PROBE), 'utf8');
const statements = probe.replace(/^\s*--.*$/gm, '');

describe('the probe scores the right four expressions', () => {
  it('1. it is read-only and rolls back', () => {
    expect(probe).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(probe.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    for (const forbidden of ['CREATE ', 'DROP ', 'ALTER ', 'INSERT ', 'UPDATE ', 'DELETE ', 'GRANT ', 'REVOKE ']) {
      expect(statements, `probe must not ${forbidden.trim()}`).not.toContain(forbidden);
    }
  });

  it('2. it reproduces the TWO SHIPPED expressions, so the comparison has a baseline', () => {
    // 20260918160000.
    expect(statements).toContain('GREATEST(r_s, r_e, r_g) AS rank_max');
    // 20260918170000 -- the one live today, and the one that drops q07.
    expect(statements).toContain('CASE WHEN n_simple > 0 THEN r_s ELSE GREATEST(r_e, r_g) END AS rank_additive');
  });

  it('3. option 1 takes the stemmed rank only on STRICTLY MORE terms', () => {
    expect(statements).toContain('CASE WHEN GREATEST(n_english, n_german) > n_simple THEN GREATEST(r_e, r_g)');
    // Strictly greater, not >=. With >= it would collapse into something that
    // fires on every tie, which is the q05 boost this is meant to block.
    expect(statements).not.toContain('GREATEST(n_english, n_german) >= n_simple');
  });

  it('4. option 2 ranks by the most-matching configuration, ties to simple', () => {
    expect(statements).toContain('CASE WHEN n_simple >= GREATEST(n_english, n_german) THEN r_s');
    expect(statements).toContain('WHEN n_english > n_german THEN r_e');
    expect(statements).toContain('WHEN n_german > n_english THEN r_g');
    // The english/german tie takes the greater of those two, not simple.
    expect(statements).toContain('ELSE GREATEST(r_e, r_g) END AS rank_opt2');
  });

  it('5. the term counts are PER CONFIGURATION and per distinct term', () => {
    for (const config of ["'simple'::regconfig", "'english'::regconfig", "'german'::regconfig"]) {
      expect(statements).toContain(`@@ pg_catalog.to_tsquery(${config}, term.term)`);
    }
  });

  it('6. MATCHING is still the unmodified three-way OR', () => {
    // The constraint that keeps the six GIN indexes usable. A term count in the
    // WHERE clause would make every search a sequential scan over the projection.
    expect(statements).toContain('@@ qq.q_simple');
    expect(statements).toContain('@@ qq.q_english');
    expect(statements).toContain('@@ qq.q_german');
    // The qual is the WHERE of the `ranked` CTE, which ends where `scored`
    // begins. Slice to that boundary explicitly -- an earlier version of this
    // test ran past it into the rank expressions and failed on the term counts
    // it was supposed to be looking for elsewhere.
    // Anchored on the `ranked` CTE: the FIRST `WHERE pg_catalog.to_tsvector` in
    // the file belongs to the count(*) FILTER inside `counts`, which legitimately
    // mentions the term counts this test forbids.
    const ranked = statements.indexOf('ranked AS (');
    const start = statements.indexOf('WHERE pg_catalog.to_tsvector', ranked);
    const end = statements.indexOf('scored AS (', start);
    expect(ranked, '`ranked` CTE not found').toBeGreaterThan(-1);
    expect(start, 'match qual not found').toBeGreaterThan(-1);
    expect(end, '`scored` CTE not found after the qual').toBeGreaterThan(start);
    const qual = statements.slice(start, end);
    for (const count of ['n_simple', 'n_english', 'n_german']) {
      expect(qual, `${count} must not appear in the match qual`).not.toContain(count);
    }
    // And the qual really is only the three OR branches.
    expect((qual.match(/@@ qq\.q_/g) ?? [])).toHaveLength(3);
  });

  it('7. it reports TOP-K MEMBERSHIP, not just rank — the bar is about position', () => {
    for (const column of ['pos_additive', 'pos_max', 'pos_opt1', 'pos_opt2']) {
      expect(statements, `missing ${column}`).toContain(column);
    }
    // And it surfaces where the two options actually differ, which is the only
    // place the choice is decided by evidence rather than taste.
    expect(statements).toContain('options_disagree');
  });

  it('8. the flag asymmetry survives: posts rank on 0, chunks on 1', () => {
    expect(statements).toMatch(/'chunk'::text AS source[\s\S]*?1 AS norm/);
    expect(statements).toContain('doc.norm');
  });

  it('9. all eleven questions, with builder-generated terms', () => {
    for (const question of [
      'q01-iran', 'q02-audi-horn', 'q03-trump-note', 'q04-bike-chain', 'q05-hypermodern',
      'q06-absent', 'q07-tens', 'q08-knitting', 'q09-watson', 'q10-spreizniete', 'q11-noise-only',
    ]) {
      expect(probe, `probe is missing ${question}`).toContain(question);
    }
  });
});

describe('the probe states what it is for and what would break it', () => {
  it('10. it records that EVERY shipped state is disqualified, with the term counts', () => {
    expect(probe).toMatch(/EVERY STATE WE HAVE IS DISQUALIFIED/);
    // simple sees one term; english and german each see two. This is the fact
    // the whole choice turns on.
    expect(probe).toContain('"a single pulse"');
    expect(probe).toContain('"stimulators"');
  });

  it('11. it carries the bar, so a reader scores against it rather than for it', () => {
    expect(probe).toMatch(/THE BAR/);
    expect(probe).toContain('boardSearchTuningRatings.json');
  });

  it('12. it warns that a term count in the WHERE clause kills the indexes', () => {
    expect(probe).toMatch(/MATCHING MUST STAY THE INDEXED THREE-WAY OR/);
    expect(probe).toMatch(/sequential scan/);
  });

  it('13. it names the per-row cost to measure before shipping, with the cheaper form', () => {
    // The rank runs for every row matching the qual, not just the ten returned.
    expect(probe).toMatch(/evaluated\n-- for EVERY row that matches the qual/);
    expect(probe).toContain('tsvector_to_array');
  });
});
