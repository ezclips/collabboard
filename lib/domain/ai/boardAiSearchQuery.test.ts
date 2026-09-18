import { describe, expect, it } from 'vitest';

import {
  BOARD_SEARCH_CONTEXT_STOPWORDS,
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

  it('every context stopword is dropped', () => {
    // This list is a DELIBERATE CHANGE OF POLICY, not a widening of the
    // linguistic one. An earlier version of this test pinned `tell` as a term
    // that survives, on the reasoning that the list should stay conservative.
    // Measurement overruled it: "What do the Iran oil headlines on this board
    // say?" produced 3,018 characters of context of which ~212 answered it,
    // and `board` alone accounted for 2,132 noise characters by matching a
    // chess board. `say` and `tell` describe the request, not its subject.
    for (const word of BOARD_SEARCH_CONTEXT_STOPWORDS) {
      expect(buildBoardAiSearchQuery(`Iran ${word} headlines`).terms)
        .toEqual(['iran', 'headlines']);
    }
  });

  it('CONTENT-TYPE words are deliberately NOT members, so a widening must be deliberate', () => {
    // "what does the note about X say" must not lose its noun. A user may
    // genuinely be distinguishing a note from a PDF, and a post titled "Release
    // note" is a real match for someone searching for it.
    for (const keeper of ['note', 'post', 'page', 'pdf', 'document']) {
      expect(BOARD_SEARCH_CONTEXT_STOPWORDS.has(keeper)).toBe(false);
      expect(buildBoardAiSearchQuery(`what does the ${keeper} about oil say`).terms)
        .toEqual([keeper, 'oil']);
    }
  });

  it('the real measured question loses only the generic terms', () => {
    // The exact question from the live run. `board` and `say` go; everything
    // that names the subject stays, and the chip will show the user precisely
    // this list.
    expect(buildBoardAiSearchQuery('What do the Iran oil headlines on this board say?').terms)
      .toEqual(['iran', 'oil', 'headlines']);
  });

  it('the CONTEXT list does not apply to German, and every content term survives', () => {
    // The real question from the live run's second check, in its original
    // language. Nothing that names the subject is lost.
    const terms = buildBoardAiSearchQuery('Wie demontiere ich die Stoßstange am Audi A2?').terms;
    for (const content of ['demontiere', 'stoßstange', 'audi', 'a2']) {
      expect(terms).toContain(content);
    }
    for (const word of BOARD_SEARCH_CONTEXT_STOPWORDS) {
      expect(terms).not.toContain(word);
    }
  });

  it('pins the ENGLISH/GERMAN collision honestly rather than claiming there is none', () => {
    // `am` here is German for "an dem" and is dropped because English spells its
    // first-person copula the same way. That is the LINGUISTIC list colliding,
    // not the context list -- and it is recorded rather than glossed, because
    // "the list is English only" is easily misread as "German is unaffected".
    expect(buildBoardAiSearchQuery('Wie demontiere ich die Stoßstange am Audi A2?').terms)
      .toEqual(['wie', 'demontiere', 'ich', 'die', 'stoßstange', 'audi', 'a2']);
    // The measured collision set. Five are function words in German too; `will`
    // -- German for "wants" -- is the one real verb lost.
    for (const collision of ['am', 'an', 'in', 'so', 'was', 'will']) {
      expect(buildBoardAiSearchQuery(`Stoßstange ${collision} Audi`).terms)
        .toEqual(['stoßstange', 'audi']);
    }
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
