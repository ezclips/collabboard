import { describe, expect, it } from 'vitest';

import { buildBoardAiSearchQuery } from './boardAiSearchQuery';
import {
  BOARD_AI_WIKI_EXCERPT_CHARS,
  BOARD_AI_WIKI_MAX_PAGES,
  boardAiWikiExcerpt,
  scoreWikiSearchPages,
  type WikiSearchCandidatePage,
} from './boardAiWikiSearch';

/**
 * PATCH-196. The wiki scorer, pure domain. No database, no client: the server
 * reads pages and calls in here, so these assertions are about the ranking, the
 * excerpt and the determinism, not about any read.
 */

const page = (pageId: string, title: string, content: string): WikiSearchCandidatePage =>
  ({ pageId, title, content });

const query = (message: string) => buildBoardAiSearchQuery(message);

describe('PATCH-196 wiki scoring', () => {
  it('a title match outranks a body-only match', () => {
    const pages = [
      page('body', 'Unrelated', 'the oil headlines run today'),
      page('title', 'Oil headlines', 'unrelated prose'),
    ];

    const ranked = scoreWikiSearchPages(pages, query('oil headlines'));

    expect(ranked[0].pageId).toBe('title');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('a page with no matching term is not returned', () => {
    const ranked = scoreWikiSearchPages(
      [page('a', 'Cooking', 'a recipe for bread')],
      query('oil headlines'),
    );

    expect(ranked).toEqual([]);
  });

  it('returns at most BOARD_AI_WIKI_MAX_PAGES, best first', () => {
    const pages = [
      page('weak', 'Notes', 'oil appears once'),
      page('strong', 'Oil headlines weekly', 'oil tankers and headlines'),
      page('mid', 'Oil report', 'oil prices'),
    ];

    const ranked = scoreWikiSearchPages(pages, query('oil headlines'));

    expect(ranked).toHaveLength(BOARD_AI_WIKI_MAX_PAGES);
    expect(ranked.map((match) => match.pageId)).toEqual(['strong', 'mid']);
  });

  it('breaks ties by title, alphabetically, so the order is deterministic', () => {
    const pages = [
      page('b', 'Beta', 'oil'),
      page('a', 'Alpha', 'oil'),
      page('c', 'Gamma', 'oil'),
    ];

    const ranked = scoreWikiSearchPages(pages, query('oil'));

    expect(ranked.map((match) => match.title)).toEqual(['Alpha', 'Beta']);
  });

  it('matches on word boundaries, not inside a word', () => {
    // `oil` must not match `boiler`; `headlines` must not match `headline`.
    const ranked = scoreWikiSearchPages(
      [page('a', 'Boiler room', 'a headline about nothing')],
      query('oil headlines'),
    );

    expect(ranked).toEqual([]);
  });

  it('an all-stopword message scores nothing', () => {
    const ranked = scoreWikiSearchPages(
      [page('a', 'Oil headlines', 'oil headlines')],
      query('what is it about?'),
    );

    expect(ranked).toEqual([]);
  });
});

describe('PATCH-196 wiki excerpt', () => {
  it('is capped at BOARD_AI_WIKI_EXCERPT_CHARS', () => {
    const long = 'x'.repeat(BOARD_AI_WIKI_EXCERPT_CHARS + 500);
    const excerpt = boardAiWikiExcerpt(page('a', 'T', long), ['x']);

    expect(excerpt.length).toBe(BOARD_AI_WIKI_EXCERPT_CHARS);
  });

  it('starts at the paragraph holding the first matching term', () => {
    const content = `First paragraph about nothing.\n\nSecond paragraph mentions oil tankers.\n\nThird paragraph.`;
    const excerpt = boardAiWikiExcerpt(page('a', 'T', content), ['oil']);

    expect(excerpt.startsWith('Second paragraph mentions oil tankers.')).toBe(true);
    expect(excerpt).not.toContain('First paragraph');
  });

  it('starts at the page start when the first match is in the TITLE', () => {
    const content = `First paragraph.\n\nSecond paragraph.`;
    const excerpt = boardAiWikiExcerpt(page('a', 'Oil', content), ['oil']);

    expect(excerpt).toBe(content);
  });

  it('keeps the page\'s [S…] source markers', () => {
    const content = `Intro.\n\nA claim about oil [S1.2][S3.1].`;
    const excerpt = boardAiWikiExcerpt(page('a', 'T', content), ['oil']);

    expect(excerpt).toContain('[S1.2]');
    expect(excerpt).toContain('[S3.1]');
  });

  it('returns a short body unchanged', () => {
    expect(boardAiWikiExcerpt(page('a', 'T', 'short body'), ['oil'])).toBe('short body');
  });
});
