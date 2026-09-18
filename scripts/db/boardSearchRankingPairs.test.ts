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
 * q02 HAS NOW BEEN FLIPPED, and what "flipped" means here is worth stating
 * exactly, because it is not "the numbers were edited to the ones we wanted".
 * The variants run below is a REAL MEASUREMENT of the alternative rank
 * expressions over the same rows and the same tsqueries. q02's block therefore
 * carries two measurements: what flag 1 did (the defect, kept, because
 * 20260918150000 has to be applied before it stops being true) and what flag 0
 * does (the fix, measured). The assertions state the mechanism that connects
 * them. NOTHING HERE IS PREDICTED.
 *
 * q08 IS NOT FLIPPED and must not be until the language work lands. No variant
 * moves it, which the variants run confirmed rather than assumed.
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

/**
 * THE RANK VARIANTS, measured 2026-09-18 by running
 * scripts/db/boardSearchRankingVariants.sql against the same board.
 *
 * Same rows, same tsqueries from the same query builder, five rank expressions
 * side by side. This is the table that decided 20260918150000; it is recorded
 * here so the decision can be re-checked without a database.
 *
 * n1 is the shipped flag 1; n0 ignores length; n2 divides by raw length; cd is
 * ts_rank_cd (proximity); title_a is setweight A on the title, B on the body.
 */
const VARIANTS = {
  q02: {
    titleOnly: { n1: 0.0078393, n0: 0.0202642, n2: 0.0040529, cd: 0.111622, title_a: 0.0783928 },
    post341: { n1: 0.0033648, n0: 0.0202642, n2: 0.0003166, cd: 0.0479112, title_a: 0.0336483 },
    post406: { n1: 0.0033526, n0: 0.0202642, n2: 0.0003118, cd: 0.0477366, title_a: 0.0335257 },
    // Chunks, for the other half of the decision -- they are never ranked
    // against the posts above, only against each other.
    chunkPage6: { n1: 0.0013907, n0: 0.0101321, n2: 0.0000654, cd: 0.0198025, title_a: 0.0331706 },
    chunkNoise: { n1: 0.0013855, n0: 0.0101321, n2: 0.0000641, cd: 0.0197281, title_a: 0.0055352 },
  },
  q03: {
    titleOnly: { n1: 0.0303964, n0: 0.0607927, n2: 0.0202642, cd: 0.216404, title_a: 0.303964 },
    slideshowPage4: { n1: 0.0042153, n0: 0.0202642, n2: 0.0007505, cd: 0.0300102, title_a: 0.0163613 },
  },
  /** intro / answer, as a RATIO. Above 1 means the defect stands. */
  q08Ratios: { n1: 3.07, n0: 3.50, n2: 1.86, cd: 4.38, title_a: 3.07 },
  /** The stemming check, on the exact pair that inverted. */
  q08Stemming: {
    intro: { simple: true, english: true },
    answer: { simple: false, english: true },
  },
} as const;

/**
 * THE LANGUAGE PROBE, measured 2026-09-18 against this board, which decided
 * design C and is recorded here because two of these numbers exist nowhere else.
 *
 * Every searchable row is indexed under `simple`, `english` AND `german`
 * (20260918160000). `simple` is retained unchanged, so no match that exists
 * today can disappear -- the two new vectors can only ADD rows.
 */
const LANGUAGE = {
  /** What each configuration does to the tokens that matter on this board. */
  tokens: {
    'Stoßstange': { simple: 'stoßstange', english: 'stoßstang', german: 'stossstang' },
    'lösen': { simple: 'lösen', english: 'lösen', german: 'los' },
    'ribbed': { simple: 'ribbed', english: 'rib', german: 'ribbed' },
    'Ribbing': { simple: 'ribbing', english: 'rib', german: 'ribbing' },
    /** Empty under BOTH stemming configurations: a stopword in each dictionary. */
    'will': { simple: 'will', english: '', german: '' },
  },
  /** q10's answering chunk, at flag 1, under simple versus german. */
  q10Answer: { simple: 0.00778, german: 0.01413, leadSimple: 1.10, leadGerman: 1.29 },
  /** q08 under english: the answer finally matches, and still loses. */
  q08UnderEnglish: { ratioBefore: 3.07, ratioAfter: 1.35 },
  /**
   * DESIGN B, measured and rejected. Merged-vector rank divided by simple rank.
   * The prediction was uniform ~3x inflation; the measurement is MIXED, in both
   * directions, because normalization by query-term count and length swamps the
   * occurrence tripling.
   */
  mergedOverSimple: {
    answer: 1.26, intro: 0.94, lubricant: 0.85, slideshow: 0.79, titleOnlyPost: 0.91,
  },
} as const;

describe('the language probe — what three configurations bought, and what they did not', () => {
  it('german folds ß to ss, which is why a bilingual board needs it', () => {
    // `Stossstange` and `Stoßstange` become the same token only here. Neither
    // simple nor english folds it, so neither lets the two spellings meet.
    expect(LANGUAGE.tokens['Stoßstange'].german).toBe('stossstang');
    expect(LANGUAGE.tokens['Stoßstange'].german).not.toBe(LANGUAGE.tokens['Stoßstange'].simple);
    expect(LANGUAGE.tokens['Stoßstange'].english).not.toBe(LANGUAGE.tokens['Stoßstange'].german);
  });

  it('the measured German gain is an ordering gain, not just a rank gain', () => {
    // A bigger rank alone proves nothing -- everything could rise together. The
    // number that matters is the LEAD over the next passage.
    expect(LANGUAGE.q10Answer.german).toBeGreaterThan(LANGUAGE.q10Answer.simple);
    expect(LANGUAGE.q10Answer.leadGerman).toBeGreaterThan(LANGUAGE.q10Answer.leadSimple);
  });

  it('`will` is NOT recovered by any configuration — the collision stands', () => {
    // An earlier draft of the design claimed german would recover it. It does
    // not: `will` is in the German dictionary's own stopword list, as is
    // `wollen`. Only the simple vector holds the lexeme, and the application
    // drops the term before any configuration sees it. If it is ever wanted
    // back, the fix is a query-side policy, not a vector.
    expect(LANGUAGE.tokens['will'].english).toBe('');
    expect(LANGUAGE.tokens['will'].german).toBe('');
    expect(LANGUAGE.tokens['will'].simple).toBe('will');
  });

  it('design B was rejected on measurement, and the theory against it was wrong too', () => {
    const ratios = Object.values(LANGUAGE.mergedOverSimple);
    // The prediction was uniform inflation near 3x. Nothing is near 3x, and the
    // ratios fall on BOTH sides of 1 -- so B perturbs rank rather than inflating
    // it, which is the worse property and the actual reason it lost.
    expect(Math.max(...ratios)).toBeLessThan(2);
    expect(Math.min(...ratios)).toBeLessThan(1);
    expect(Math.max(...ratios)).toBeGreaterThan(1);
  });
});

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

  it('CONFIRMED BY THE VARIANTS RUN: every rank expression keeps the intro ahead', () => {
    // Five expressions, measured, not predicted. The best of them (n2) still has
    // the intro at 1.86x. There is no ranking answer to this pair.
    for (const [variant, ratio] of Object.entries(VARIANTS.q08Ratios)) {
      expect(ratio, `${variant} unexpectedly fixed q08 — re-read the stemming check`).toBeGreaterThan(1);
    }
  });

  it('STILL A TRIPWIRE after design C: english makes the answer MATCH, and it still loses', () => {
    // This is the honest form of the acceptance criterion. The language unit was
    // expected to flip this pair and it does not. What it achieves is that the
    // answer's vocabulary ENTERS the query at all -- `ribbed` and `Ribbing` both
    // stem to `rib` -- which narrows the gap from 3.07x to 1.35x.
    //
    // The ORDERING REMAINS INVERTED, so this assertion stays as it is. Coverage
    // favours the introduction under `english` too (the query's three terms stem
    // to two, which the intro also has), so no lexical rule separates them. What
    // is left is the ranking-versus-semantics problem the flag family already
    // failed to solve -- it is not a stemming problem and never was a ranking
    // one either.
    expect(LANGUAGE.q08UnderEnglish.ratioAfter).toBeGreaterThan(1);
    expect(LANGUAGE.q08UnderEnglish.ratioAfter).toBeLessThan(LANGUAGE.q08UnderEnglish.ratioBefore);
    // The answer now matches under english, which it never did under simple.
    expect(VARIANTS.q08Stemming.answer.english).toBe(true);
    expect(VARIANTS.q08Stemming.answer.simple).toBe(false);
  });

  it('and the stemming check names the cause on the exact pair', () => {
    // The answering chunk does not match `ribbed` under `simple` and does under
    // `english`. The intro matches under both. That single row is the whole
    // diagnosis: this is a text-search CONFIGURATION question.
    expect(VARIANTS.q08Stemming.answer.simple).toBe(false);
    expect(VARIANTS.q08Stemming.answer.english).toBe(true);
    expect(VARIANTS.q08Stemming.intro.simple).toBe(true);
  });
});

describe('ranking pair q02 — the answering passages must outrank the title-only post', () => {
  it('FLIPPED: under flag 1 the TITLE-ONLY post outranked all three answers', () => {
    // Kept, not deleted. It is what the shipped function does until
    // 20260918150000 is applied, and it is the measurement the fix is argued
    // against. Deleting it would leave the fix looking like a preference.
    for (const answer of MEASURED.q02.answers) {
      expect(MEASURED.q02.titleOnly.rank).toBeGreaterThan(answer.rank);
    }
  });

  it('THE FIX: flag 0 ranks the three POSTS exactly equal, because their evidence is equal', () => {
    // Not "close". Identical, to seven places, measured by the variants run.
    // That is the whole argument for flag 0 on posts: with length out of the
    // expression, rank says what matched and nothing else, and these three
    // passages matched the same two terms twice each.
    expect(VARIANTS.q02.post341.n0).toBe(VARIANTS.q02.titleOnly.n0);
    expect(VARIANTS.q02.post406.n0).toBe(VARIANTS.q02.titleOnly.n0);
  });

  it('THE FIX IS THE TIE-BREAK, NOT THE FLAG — a tie decides nothing on its own', () => {
    // Flag 0 alone would leave the order to padlet_id: deterministic, arbitrary,
    // and right or wrong by accident. 20260918150000 therefore adds
    //     ORDER BY rank DESC, (matched.text <> '') DESC, matched.padlet_id ASC
    // so the preference is stated where it can be argued with. Both answering
    // posts have a body; the title-only post does not.
    expect(MEASURED.q02.answers[0].chars).toBeGreaterThan(0);
    expect(MEASURED.q02.answers[1].chars).toBeGreaterThan(0);
    expect(MEASURED.q02.titleOnly.chars).toBe(0);
  });

  it('no OTHER variant fixes it — that is why the flag moved rather than the expression', () => {
    const { titleOnly, post341 } = VARIANTS.q02;
    // n2 (divide by raw length) makes it far worse: 12.8x instead of 2.33x.
    expect(titleOnly.n2 / post341.n2).toBeGreaterThan(12);
    // ts_rank_cd and setweight A/B leave it essentially where flag 1 had it.
    expect(titleOnly.cd / post341.cd).toBeCloseTo(2.33, 1);
    expect(titleOnly.title_a / post341.title_a).toBeCloseTo(2.33, 1);
  });

  it('flag 0 is NOT promoted to the chunks function, and this is the number that says why', () => {
    // Under flag 0 the answering page-6 chunk and a bicycle-maintenance chunk
    // with nothing to do with the question rank IDENTICALLY. Ranking by evidence
    // alone works where documents are short and evenly sized; chunks are neither.
    // The two functions may differ because their ranks are never compared -- the
    // caller takes top-K per source.
    expect(VARIANTS.q02.chunkNoise.n0).toBe(VARIANTS.q02.chunkPage6.n0);
    // Flag 1, which chunks keep, does separate them -- barely, but in the right
    // direction, and it is the only column here that does at all.
    expect(VARIANTS.q02.chunkPage6.n1).toBeGreaterThan(VARIANTS.q02.chunkNoise.n1);
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

  it('flag 0 PRESERVES it, and the tie-break never fires here', () => {
    // q03's title-only post matches 3 of 3 terms where nothing else matches more
    // than one, so under flag 0 it wins on rank outright -- 0.0607927 against a
    // tie at 0.0202642. The body-over-title-only tie-break fires only at EQUAL
    // rank, so it never touches this pair. That is the whole reason it is a
    // tie-break and not a demotion.
    expect(VARIANTS.q03.titleOnly.n0).toBeGreaterThan(VARIANTS.q03.slideshowPage4.n0);
    // And it is the only post that matched at all, so nothing could tie it here
    // even if the ranks had been equal.
    expect(VARIANTS.q03.titleOnly.n0 / VARIANTS.q03.slideshowPage4.n0).toBeCloseTo(3, 1);
  });
});

/**
 * q05, MEASURED AFTER DESIGN C. This pair is different from the other three:
 * WE CAUSED IT.
 *
 * Before the configurations were added, q05's answer led its document's
 * introduction, 0.006487 to 0.006154 -- it was explicitly recorded as "not
 * inverted at all", correcting an earlier claim that it was. GREATEST inverted
 * it: 0.011075 for the intro against 0.009579 for the answer.
 *
 * BOTH PASSAGES MATCHED UNDER `simple` BOTH TIMES, and chunks never touch the
 * HTML projection, so nothing about the corpus or the query changed. The whole
 * difference is that GREATEST let a rank from one configuration be compared with
 * a rank from another -- two quantities that are not the same quantity.
 *
 * 20260918170000 is the fix: a row that matches `simple` is ranked by `simple`.
 * This block asserts the REGRESSION, because that migration is not applied here
 * -- the numbers below are what the shipped functions do today.
 */
const Q05_AFTER_GREATEST = {
  beforeC: { answer: 0.006487, intro: 0.006154 },
  afterC: { answer: 0.009579, intro: 0.011075 },
} as const;

describe('ranking pair q05 — an inversion WE introduced, and then fixed', () => {
  it('before the configurations, the answer led — this pair was correct', () => {
    expect(Q05_AFTER_GREATEST.beforeC.answer).toBeGreaterThan(Q05_AFTER_GREATEST.beforeC.intro);
  });

  it('TRIPWIRE: under GREATEST the INTRO leads (regression — flip when 20260918170000 lands)', () => {
    expect(Q05_AFTER_GREATEST.afterC.intro).toBeGreaterThan(Q05_AFTER_GREATEST.afterC.answer);
  });

  it('the cause is the SCALE MIX, not the corpus and not the query', () => {
    // Both passages rose -- they matched under more configurations than before --
    // but the irrelevant one rose further. A rank from `english` and a rank from
    // `simple` are not the same quantity, and GREATEST compared them as if they
    // were.
    expect(Q05_AFTER_GREATEST.afterC.answer).toBeGreaterThan(Q05_AFTER_GREATEST.beforeC.answer);
    expect(Q05_AFTER_GREATEST.afterC.intro).toBeGreaterThan(Q05_AFTER_GREATEST.beforeC.intro);
  });
});

describe('what the ratings bar could and could not decide', () => {
  /**
   * THE HONEST LIMIT ON ALL OF THE ABOVE.
   *
   * The battery's bar is "never drop a human-judged relevant passage". A ranking
   * change can only drop something by pushing it past the per-source limit, or
   * past the character budget. NEITHER HAPPENS ANYWHERE IN THIS BATTERY: no
   * question returns more posts than the per-source limit of four, and the three
   * that return any post at all return three, one and three.
   *
   * THE CORPUS IS NOT THE SMALL THING -- THE QUESTIONS ARE. The board holds NINE
   * text/note posts. The eleven questions surface FOUR distinct ones between
   * them, so five posts are never returned by anything and no question ever
   * forces a choice. An earlier version of this file said the board held four
   * posts, which was simply wrong, and it made the corpus look like the limit
   * when the questions are.
   *
   * So the posts flag change PASSES THE BAR VACUOUSLY. It is not endorsed by the
   * ratings; it is merely not contradicted by them. The argument for it is the
   * mechanism recorded above, and the argument against it -- a long post that
   * repeats one term outranking a short exact answer, which flag 0 permits and
   * flag 1 did not -- is UNMEASURABLE against these questions. Followups item 7.
   */
  const POSTS_ON_THE_BOARD = 9;
  const POSTS_PER_SOURCE_LIMIT = 4;
  /** Distinct posts any battery question actually returns. Counted, 2026-09-18. */
  const POSTS_THE_QUESTIONS_REACH = 4;

  it('no question in the battery returns more posts than the per-source limit', () => {
    const postsReturned = { q02: 3, q03: 1, q10: 3 } as const;
    for (const [question, count] of Object.entries(postsReturned)) {
      expect(count, `${question} would have exercised the limit`).toBeLessThan(POSTS_PER_SOURCE_LIMIT);
    }
  });

  it('the questions reach under half the posts, which is why the bar cannot discriminate', () => {
    // The board is big enough to have exercised the limit. The questions never
    // ask it to, and that is the limit of the instrument -- not the corpus size.
    expect(POSTS_ON_THE_BOARD).toBeGreaterThan(POSTS_PER_SOURCE_LIMIT);
    expect(POSTS_THE_QUESTIONS_REACH).toBeLessThan(POSTS_ON_THE_BOARD);
  });
});
