import { describe, expect, it } from 'vitest';

/**
 * THE THREE NAMED RANKING PAIRS, as gate assertions.
 *
 * These are the pairs the rank-floor decision died on. A floor is defined
 * against the top hit, so wherever an irrelevant passage outranks a relevant
 * one, the floor protects the noise and cuts the answer. Two of the three are
 * WRONG today. This file states all three by name so the state is checkable
 * rather than remembered.
 *
 * HOW THE BROKEN TWO ARE ENCODED, AND WHY NOT `it.fails`. They assert the
 * CURRENT, WRONG ordering, under a name that says it is a defect. That makes
 * them TRIPWIRES: they pass while the defect stands, and they break the moment
 * a ranking change fixes it -- which is exactly when a human must look, flip the
 * assertion to the target, and confirm the fix was intended rather than
 * incidental. `it.fails` would go green either way and announce nothing.
 *
 * THE LIMIT, STATED PLAINLY: these numbers are a RECORDED MEASUREMENT, not a
 * live query. They cannot detect a ranking change on their own -- they detect
 * one when the fixture is regenerated, which is a step a person takes. The
 * fixture's provenance is below, and regenerating it is one command. A live
 * version would need a database in the unit suite, which this repository
 * deliberately does not have.
 *
 * REGENERATE WITH:
 *     npx vite-node scripts/db/boardSearchTuningBattery.ts -- --diagnose
 * and for the rank variants these pairs are meant to discriminate:
 *     scripts/db/boardSearchRankingVariants.sql   (read-only)
 */

/**
 * Measured 2026-09-18 on board af02972f-…, through the real query builder into
 * the two shipped search functions, both at ts_rank normalization flag 1.
 */
const MEASURED = {
  q08: {
    query: 'How do I knit a ribbed pattern?',
    terms: ['knit', 'ribbed', 'pattern'],
    answer: { label: 'knitting_stitch_patterns.pdf chunk 1', chars: 483, rank: 0.003145, coverage: 1, occurrences: 1 },
    intro: { label: 'knitting_stitch_patterns.pdf chunk 0', chars: 1018, rank: 0.009651, coverage: 3, occurrences: 5 },
  },
  q02: {
    query: 'How do I remove the bumper on an Audi A2 to change the horn?',
    titleOnly: { label: 'Audi A2 Stoßstange Titel bild', chars: 0, rankedChars: 29, rank: 0.007839, coverage: 2, occurrences: 2 },
    answers: [
      { label: 'post — Möchte man nur die Hupe wechseln', chars: 341, rankedChars: 380, rank: 0.003365, coverage: 2, occurrences: 2 },
      { label: 'post — Das Stecker abziehen', chars: 406, rankedChars: 445, rank: 0.003353, coverage: 2, occurrences: 2 },
      { label: 'Audi A2 … page 6 — Zusammenbau / Problem Hupe', chars: 966, rankedChars: 966, rank: 0.001391, coverage: 1, occurrences: 1 },
    ],
  },
  q03: {
    query: 'What does the Trump note post say?',
    titleOnly: { label: 'Trump Note Post', chars: 0, rank: 0.030396 },
    other: { label: 'My fancy padlet-slideshow.pdf — page 4', chars: 158, rank: 0.004215 },
  },
} as const;

describe('ranking pair q08 — the answer must outrank its own document intro', () => {
  it('TRIPWIRE: today the INTRO outranks the ANSWER by 3.07x (defect — flip this when fixed)', () => {
    expect(MEASURED.q08.intro.rank).toBeGreaterThan(MEASURED.q08.answer.rank);
    expect(MEASURED.q08.intro.rank / MEASURED.q08.answer.rank).toBeCloseTo(3.07, 1);
  });

  it('the cause is STEMMING, not ranking: the query says "ribbed", the answer says "Ribbing"', () => {
    // The `simple` configuration does no stemming, so "ribbed" never matches
    // "Ribbing" and the answering paragraph matches only `knit`, once. The intro
    // genuinely contains all three query terms, five times.
    //
    // THE RANKING IS THEREFORE CORRECT GIVEN WHAT MATCHED. No normalization
    // flag, no weighting and no coverage rule can fix this pair, because the
    // answer's vocabulary never entered the query. It belongs to the language /
    // stemming item, not to ranking.
    expect(MEASURED.q08.answer.coverage).toBe(1);
    expect(MEASURED.q08.intro.coverage).toBe(3);
    expect(MEASURED.q08.intro.occurrences).toBeGreaterThan(MEASURED.q08.answer.occurrences);
  });
});

describe('ranking pair q02 — the answering passages must outrank the title-only post', () => {
  it('TRIPWIRE: today the TITLE-ONLY post outranks all three answers (defect — flip when fixed)', () => {
    for (const answer of MEASURED.q02.answers) {
      expect(MEASURED.q02.titleOnly.rank).toBeGreaterThan(answer.rank);
    }
  });

  it('the cause is LENGTH NORMALIZATION on a 29-character document, not coverage', () => {
    // Two of the three answers match exactly as many distinct terms, exactly as
    // often, as the title-only post does. Coverage cannot separate them, so a
    // coverage-first ordering does not fix this pair -- scored, and it fixes 0
    // of 4.
    const [first, second] = MEASURED.q02.answers;
    expect(first.coverage).toBe(MEASURED.q02.titleOnly.coverage);
    expect(first.occurrences).toBe(MEASURED.q02.titleOnly.occurrences);
    expect(second.coverage).toBe(MEASURED.q02.titleOnly.coverage);
    // What differs is LENGTH. Flag 1 divides by 1 + log(length), so a
    // 29-character document is rewarded against a 380-character one.
    expect(MEASURED.q02.titleOnly.rankedChars).toBeLessThan(first.rankedChars);
  });

  it('boosting the title weight would make this pair WORSE, not better', () => {
    // The title-only post's ONLY signal is its title. setweight A/B raises
    // exactly the passage that is already wrongly on top, so item 1 is not the
    // fix for this inversion even though it remains valid for posts generally.
    expect(MEASURED.q02.titleOnly.chars).toBe(0);
  });
});

describe('ranking pair q03 — the title-only post must STAY first', () => {
  it('the title-only post is the correct top result, and any q02 fix must preserve it', () => {
    // Here the title-only post IS the answer: the question is about that post,
    // and "it exists and is empty" is the true reply. A change that fixes q02 by
    // demoting title-only posts in general breaks this, and is not a fix.
    expect(MEASURED.q03.titleOnly.rank).toBeGreaterThan(MEASURED.q03.other.rank);
  });

  it('q03 and q02 differ in COVERAGE, which is what any candidate must exploit', () => {
    // q03's title matches 3 of 3 terms; q02's matches 2 of 6. That difference is
    // real -- but it does not separate q02's title-only post from q02's own
    // answers, which match 2 of 6 as well. A candidate has to beat BOTH facts.
    expect(MEASURED.q03.titleOnly.chars).toBe(0);
    expect(MEASURED.q02.titleOnly.coverage).toBe(2);
  });
});
