import { describe, expect, it } from 'vitest';

import {
  BOARD_SEARCH_MAX_TERMS,
  buildBoardAiSearchQuery,
} from './boardAiSearchQuery';

/**
 * The four cases named in the spec, plus the ones that would turn a chat message
 * into a database error.
 *
 * The first is the whole reason this module exists: `websearch_to_tsquery` and
 * `plainto_tsquery` AND their terms, so a long message asks for a post
 * containing every word in it and matches nothing, silently, forever.
 */
describe('board search query construction', () => {
  it('a 4,000-character message produces a bounded OR query, not an impossible AND', () => {
    // The route's ceiling for a single message, filled with distinct words.
    const words: string[] = [];
    for (let index = 0; words.join(' ').length < 4000; index += 1) words.push(`term${index}`);
    const message = words.join(' ').slice(0, 4000);

    const query = buildBoardAiSearchQuery(message);

    expect(query.isEmpty).toBe(false);
    expect(query.terms).toHaveLength(BOARD_SEARCH_MAX_TERMS);
    // OR, never AND. An `&` here is the silent-no-results bug.
    expect(query.expression).toContain(' | ');
    expect(query.expression).not.toContain('&');
    // The cap is on TERMS, and the first ones written survive -- people put the
    // subject at the front of a question.
    expect(query.terms[0]).toBe('term0');
  });

  it('an all-stopword message reduces to nothing, and that is not an error', () => {
    const query = buildBoardAiSearchQuery('What is this about? Is it about them or about us?');
    expect(query.isEmpty).toBe(true);
    expect(query.terms).toEqual([]);
    // The SQL side agrees: a blank query returns no rows rather than raising.
    expect(query.expression).toBe('');
  });

  it('the stopword list is conservative, and this pins where it stops', () => {
    // "tell" is NOT dropped, and that is the documented policy rather than an
    // oversight: the list is function words and question openers only. An
    // aggressive linguistic list drops terms that carry meaning in a product
    // corpus, and this runs against a `simple` configuration that does no
    // stemming and strips no stopwords of its own. If a term like this should
    // go, it is a deliberate addition with a reason, not a silent widening.
    expect(buildBoardAiSearchQuery('Can you tell me about it?').terms).toEqual(['tell']);
  });

  it('operator punctuation cannot reach to_tsquery, because nothing but letters and digits does', () => {
    // Every character to_tsquery treats as syntax, plus quotes and backslashes.
    const query = buildBoardAiSearchQuery('budget & (oil | gas) !war <-> "quoted" :* \\ 100%');

    expect(query.terms).toEqual(['budget', 'oil', 'gas', 'war', 'quoted', '100']);
    // The joiner is the ONLY operator character in the output.
    expect(query.expression).toBe('budget | oil | gas | war | quoted | 100');
    for (const forbidden of ['&', '!', '(', ')', ':', '*', '<', '>', '"', '\\']) {
      expect(query.expression).not.toContain(forbidden);
    }
  });

  it('an empty result is produced for empty and whitespace input rather than thrown', () => {
    for (const input of ['', '   ', '\n\t', '???', 'a']) {
      const query = buildBoardAiSearchQuery(input);
      expect(query.isEmpty).toBe(true);
      expect(query.expression).toBe('');
    }
  });

  it('de-duplicates before the cap, so a repeated word cannot spend the budget', () => {
    const repeated = `${'oil '.repeat(40)}sanctions tanker`;
    const query = buildBoardAiSearchQuery(repeated);
    expect(query.terms).toEqual(['oil', 'sanctions', 'tanker']);
  });

  it('keeps short meaningful terms and drops single characters', () => {
    // "AI", "Q4" and "R2" are exactly what a board question turns on.
    const query = buildBoardAiSearchQuery('AI Q4 R2 x y z');
    expect(query.terms).toEqual(['ai', 'q4', 'r2']);
  });

  it('keeps whole words in non-Latin scripts instead of shredding them', () => {
    // Splitting on [a-z0-9] would drop these entirely, which is how a board in
    // another language would get a search that never matches.
    const query = buildBoardAiSearchQuery('Präsentation Ölpreis 会議 бюджет');
    expect(query.terms).toEqual(['präsentation', 'ölpreis', '会議', 'бюджет']);
  });

  it('is case-insensitive, because the index is built with the simple config', () => {
    expect(buildBoardAiSearchQuery('Iran OIL Headlines').terms).toEqual(['iran', 'oil', 'headlines']);
  });
});
