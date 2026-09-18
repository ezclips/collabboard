import { describe, expect, it, vi } from 'vitest';

import {
  BOARD_AI_SEARCH_LIMIT_PER_SOURCE,
  BOARD_AI_SEARCH_TIMEOUT_MS,
  searchBoardAiContext,
  type BoardAiSearchChunkRow,
  type BoardAiSearchPostRow,
  type BoardAiSearchReader,
} from './boardAiChatSearch';
import {
  BOARD_AI_SEARCH_MIN_ROOM_CHARS,
  boardAiSearchChipText,
  boardAiSearchCoverageOf,
  boardAiSearchHasRoom,
  isBoardAiSearchPassageCovered,
  boardAiSearchPromptState,
  boardAiSearchSkippedBlock,
  boundBoardAiSearchPassages,
  dropDuplicateBoardAiSearchPassages,
  mergeBoardAiSearchPassages,
  type BoardAiSearchPassage,
} from '../../domain/ai/boardAiSearchContext';
import {
  BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES,
  BOARD_AI_CONTEXT_MAX_TOTAL_CHARS,
} from '../../domain/ai/boardAiChatContext';
import { BOARD_AI_CHAT_TIMEOUT_MS } from './boardAiChatExecution';
import { ok } from '../../domain/core/result';
import type { KnowledgeBoardReadAuthorizationClient } from '../knowledge/knowledgeBoardReadAuthorization';

const BOARD = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

/** An authorization client whose two calls are observable, in order. */
function authClient(calls: string[], owner: boolean) {
  return {
    from() {
      calls.push('authorize');
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: owner ? { id: BOARD } : null, error: null }) }),
          }),
        }),
      };
    },
    async rpc() {
      calls.push('authorize');
      return { data: false, error: null };
    },
  } as unknown as KnowledgeBoardReadAuthorizationClient;
}

function reader(calls: string[], posts: BoardAiSearchPostRow[] = [], chunks: BoardAiSearchChunkRow[] = []): BoardAiSearchReader {
  return {
    async searchPosts() { calls.push('search'); return ok(posts); },
    async searchChunks() { calls.push('search'); return ok(chunks); },
  };
}

const post = (id: string, title: string, text: string, rank = 0.5): BoardAiSearchPostRow =>
  ({ padlet_id: id, title, text, rank });

const chunk = (id: string, text: string, page = 3): BoardAiSearchChunkRow => ({
  chunk_id: id,
  document_id: '33333333-3333-3333-3333-333333333333',
  original_filename: 'slides.pdf',
  page_start: page,
  page_end: page,
  chunk_index: 1,
  text,
  rank: 0.4,
});

describe('authorization happens BEFORE the privileged search', () => {
  it('authorizes with the caller\'s own client first, then searches', async () => {
    const calls: string[] = [];
    const result = await searchBoardAiContext(
      authClient(calls, true), reader(calls, [post('p1', 'Note', 'oil headlines')]),
      BOARD, USER, 'oil headlines', 5000,
    );

    expect(result.ok).toBe(true);
    // THE ORDERING IS THE SECURITY PROPERTY. A board id from a request must not
    // reach a service_role query before anyone has checked who is asking.
    expect(calls[0]).toBe('authorize');
    expect(calls.indexOf('authorize')).toBeLessThan(calls.indexOf('search'));
  });

  it('a caller who may not read the board never reaches the reader at all', async () => {
    const calls: string[] = [];
    const searched = vi.fn();
    const result = await searchBoardAiContext(
      authClient(calls, false),
      { searchPosts: async () => { searched(); return ok([]); }, searchChunks: async () => { searched(); return ok([]); } },
      BOARD, USER, 'anything', 5000,
    );

    expect(result.ok).toBe(false);
    expect(searched).not.toHaveBeenCalled();
  });

  it('an authorization failure refuses rather than searching anyway', async () => {
    const searched = vi.fn();
    const throwing = {
      from() { return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('down'); } }) }) }) }; },
      async rpc() { return { data: null, error: null }; },
    } as unknown as KnowledgeBoardReadAuthorizationClient;

    const result = await searchBoardAiContext(
      throwing,
      { searchPosts: async () => { searched(); return ok([]); }, searchChunks: async () => { searched(); return ok([]); } },
      BOARD, USER, 'anything', 5000,
    );

    expect(result.ok).toBe(false);
    expect(searched).not.toHaveBeenCalled();
  });
});

describe('the merge rule', () => {
  const passage = (source: 'post' | 'pdf', label: string, rank: number): BoardAiSearchPassage =>
    ({ source, label, text: `text of ${label}`, rank });

  it('takes top-K from each source independently and never ranks across them', () => {
    // Every PDF rank is HIGHER than every post rank. A single cross-source sort
    // would put all four PDF passages first; the rule says each source keeps its
    // own slots, because the two ts_rank scales are not comparable.
    const posts = [passage('post', 'a', 0.1), passage('post', 'b', 0.05), passage('post', 'c', 0.01)];
    const chunks = [passage('pdf', 'x', 0.9), passage('pdf', 'y', 0.8), passage('pdf', 'z', 0.7)];

    const merged = mergeBoardAiSearchPassages(posts, chunks, 2);

    expect(merged.map((item) => item.label)).toEqual(['a', 'b', 'x', 'y']);
    // Origin survives the merge on every passage.
    expect(merged.map((item) => item.source)).toEqual(['post', 'post', 'pdf', 'pdf']);
  });

  it('a source with nothing does not lend its slots to the other', () => {
    const merged = mergeBoardAiSearchPassages([], [passage('pdf', 'x', 0.9)], 4);
    expect(merged).toHaveLength(1);
    // No ratio is baked in: K is per source, and an empty source is just empty.
    expect(merged[0].source).toBe('pdf');
  });

  it('one failing source does not lose the other', async () => {
    const calls: string[] = [];
    const result = await searchBoardAiContext(
      authClient(calls, true),
      {
        async searchPosts() { return ok([post('p1', 'Weekly plan', 'the oil headlines note')]); },
        async searchChunks() { return { ok: false, error: { code: 'unavailable', message: 'x' } } as never; },
      },
      BOARD, USER, 'oil headlines', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result.used).toBe(1);
    expect(result.value.block.text).toContain('board post');
  });
});

describe('the budget yields whole passages, loudly', () => {
  const passage = (label: string, length: number): BoardAiSearchPassage =>
    ({ source: 'pdf', label, text: 'x'.repeat(length), rank: 0.5 });

  it('drops whole passages and counts them, never splitting one', () => {
    const passages = [passage('a', 300), passage('b', 300), passage('c', 300)];
    const { kept, dropped } = boundBoardAiSearchPassages(passages, 700);

    expect(kept).toHaveLength(2);
    expect(dropped).toBe(1);
    // NEVER HALF A PASSAGE. A split passage that is still cited claims a source
    // the model never fully saw.
    for (const item of kept) expect(item.text).toHaveLength(300);
  });

  it('reports the dropped count in the chip, so a yield is never silent', () => {
    expect(boardAiSearchChipText({ outcome: 'ran', returned: 6, used: 2, dropped: 4, query: 'q' }))
      .toBe('Board search — 6 text passages found, 2 used, 4 dropped for room');
  });

  it('states the empty case rather than implying the board was read', () => {
    expect(boardAiSearchChipText({ outcome: 'ran', returned: 0, used: 0, dropped: 0, query: 'q' }))
      .toBe('Board search — no text matched');
  });

  it('states the not-run reason', () => {
    expect(boardAiSearchChipText({ outcome: 'skipped-no-room', returned: 0, used: 0, dropped: 0, query: '' }))
      .toBe('Board search — not run, your attachments took the room');
  });

  it('a search that could not run says so, and is never read as "nothing matched"', () => {
    // The silence this replaces: the toggle was on, the search failed, and the
    // user was told nothing at all -- indistinguishable from a board with no
    // answer on it.
    const failed = boardAiSearchChipText({ outcome: 'failed', returned: 0, used: 0, dropped: 0, query: '' });
    expect(failed).toBe('Board search — could not run, nothing was searched');
    expect(failed).not.toBe(boardAiSearchChipText({ outcome: 'ran', returned: 0, used: 0, dropped: 0, query: '' }));
    // The block persisted for the chip must not read as a source either.
    const block = boardAiSearchSkippedBlock('failed');
    expect(block.text).toContain('could not run');
    expect(block.text).not.toContain('[board post:');
  });

  it('four outcomes collapse into the three prompt states, and only "ran" claims a search', () => {
    // A failure and an unasked-for search are the same thing TO THE MODEL: no
    // passages, no claim. They differ only to the user.
    expect(boardAiSearchPromptState('ran')).toBe('ran');
    expect(boardAiSearchPromptState('skipped-no-room')).toBe('skipped-no-room');
    expect(boardAiSearchPromptState('failed')).toBe('off');
    expect(boardAiSearchPromptState('off')).toBe('off');
  });

  it('no chip wording implies an image travelled', () => {
    const wordings = [
      boardAiSearchChipText({ outcome: 'ran', returned: 6, used: 2, dropped: 4, query: 'q' }),
      boardAiSearchChipText({ outcome: 'ran', returned: 2, used: 2, dropped: 0, query: 'q' }),
      boardAiSearchChipText({ outcome: 'ran', returned: 0, used: 0, dropped: 0, query: 'q' }),
      boardAiSearchChipText({ outcome: 'skipped-no-room', returned: 0, used: 0, dropped: 0, query: '' }),
    ];
    for (const wording of wordings) {
      expect(wording).not.toMatch(/image|picture|photo|crop|pixel/i);
    }
  });

  it('the skip rule refuses to search when the attachments left no usable room', () => {
    const full = BOARD_AI_CONTEXT_MAX_TOTAL_CHARS - (BOARD_AI_SEARCH_MIN_ROOM_CHARS - 1);
    expect(boardAiSearchHasRoom(full, BOARD_AI_CONTEXT_MAX_TOTAL_CHARS)).toBe(false);
    const roomy = BOARD_AI_CONTEXT_MAX_TOTAL_CHARS - BOARD_AI_SEARCH_MIN_ROOM_CHARS;
    expect(boardAiSearchHasRoom(roomy, BOARD_AI_CONTEXT_MAX_TOTAL_CHARS)).toBe(true);
  });
});

describe('a passage the user already attached is dropped BY SPAN, not by id', () => {
  const coverageOf = (blocks: Parameters<typeof boardAiSearchCoverageOf>[0]) => boardAiSearchCoverageOf(blocks);

  it('a post that is already attached is skipped', () => {
    const coverage = coverageOf([
      { type: 'padlet', padletId: 'p1', label: 'Weekly plan', text: 'the note body' },
    ]);
    expect(isBoardAiSearchPassageCovered(
      { source: 'post', label: 'Weekly plan', text: 'the note body', rank: 0.5, padletId: 'p1' },
      coverage,
    )).toBe(true);
    // A different post is not covered by it.
    expect(isBoardAiSearchPassageCovered(
      { source: 'post', label: 'Other', text: 'x', rank: 0.5, padletId: 'p2' },
      coverage,
    )).toBe(false);
  });

  it('a chunk INSIDE the pages a document attachment sent is skipped', () => {
    const coverage = coverageOf([{
      type: 'knowledge-document', knowledgeDocumentId: 'd1', label: 'slides.pdf',
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8], text: '…',
    }]);
    expect(isBoardAiSearchPassageCovered(
      { source: 'pdf', label: 'slides.pdf — page 3', text: 'x', rank: 0.4, knowledgeDocumentId: 'd1', pageStart: 3, pageEnd: 3 },
      coverage,
    )).toBe(true);
  });

  it('A CHUNK BEYOND THE DOCUMENT PAGE CAP IS NOT SKIPPED', () => {
    // THE CASE THE ID-ONLY VERSION GETS WRONG. A document attachment reads a
    // bounded PREFIX -- BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES pages -- so page 9
    // of a forty-page PDF was never sent. Dropping it because the document id
    // matched would silently delete the only evidence in the request.
    expect(BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES).toBe(8);
    const coverage = coverageOf([{
      type: 'knowledge-document', knowledgeDocumentId: 'd1', label: 'slides.pdf',
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8], text: '…',
    }]);
    expect(isBoardAiSearchPassageCovered(
      { source: 'pdf', label: 'slides.pdf — page 9', text: 'x', rank: 0.4, knowledgeDocumentId: 'd1', pageStart: 9, pageEnd: 9 },
      coverage,
    )).toBe(false);
  });

  it('a chunk STRADDLING the cap is kept, because half of it is new', () => {
    const coverage = coverageOf([{
      type: 'knowledge-document', knowledgeDocumentId: 'd1', label: 'slides.pdf',
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8], text: '…',
    }]);
    expect(isBoardAiSearchPassageCovered(
      { source: 'pdf', label: 'slides.pdf — pages 8–9', text: 'x', rank: 0.4, knowledgeDocumentId: 'd1', pageStart: 8, pageEnd: 9 },
      coverage,
    )).toBe(false);
  });

  it('a SELECTION covers nothing, because it sent part of a page', () => {
    // The unselected remainder of that page may be exactly what answers the
    // question, so a passage from it is new material.
    const coverage = coverageOf([{
      type: 'knowledge-selection', knowledgeDocumentId: 'd1', pageNumber: 3,
      charStart: 0, charEnd: 20, label: 'slides.pdf — page 3', text: 'a short quote',
    }]);
    expect(coverage.documentPages.size).toBe(0);
    expect(isBoardAiSearchPassageCovered(
      { source: 'pdf', label: 'slides.pdf — page 3', text: 'x', rank: 0.4, knowledgeDocumentId: 'd1', pageStart: 3, pageEnd: 3 },
      coverage,
    )).toBe(false);
  });

  it('a passage with no page span is kept rather than guessed at', () => {
    const coverage = coverageOf([{
      type: 'knowledge-page', knowledgeDocumentId: 'd1', pageNumber: 3,
      pageNumbers: [3], label: 'slides.pdf — page 3', text: 'the page',
    }]);
    // Keeping a possible duplicate costs characters; dropping possible evidence
    // costs the answer.
    expect(isBoardAiSearchPassageCovered(
      { source: 'pdf', label: 'slides.pdf', text: 'x', rank: 0.4, knowledgeDocumentId: 'd1' },
      coverage,
    )).toBe(false);
  });

  it('the duplicate never reaches the model, end to end', async () => {
    const result = await searchBoardAiContext(
      authClient([], true),
      reader([], [post('p1', 'Weekly plan', 'the oil headlines note')], [chunk('c1', 'the pdf body')]),
      BOARD, USER, 'oil headlines body', 5000,
      boardAiSearchCoverageOf([
        { type: 'padlet', padletId: 'p1', label: 'Weekly plan', text: 'the oil headlines note' },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.block.text).not.toContain('board post');
    expect(result.value.block.text).toContain('PDF text');
    expect(result.value.result.used).toBe(1);
  });
});

describe('the same passage text returned twice is one passage', () => {
  it('identical chunk text in two documents keeps the higher-ranked copy only', async () => {
    // Measured by the tuning battery: this removes 29% of all retrieved
    // characters across eleven questions and loses no relevant text, because
    // this board carries the same guide inside two different PDFs.
    const shared = 'Applying lubricant correctly is a precise process.';
    const first = { ...chunk('c1', shared), original_filename: 'bicycle.pdf', rank: 0.0061 };
    const second = { ...chunk('c2', shared), original_filename: 'Sammelmappe1.pdf', rank: 0.0061 };
    const result = await searchBoardAiContext(
      authClient([], true), reader([], [], [first, second]),
      BOARD, USER, 'bike chain lube', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result.used).toBe(1);
    // FIRST IN LIST ORDER WINS -- rank order within each source. Keeping a
    // different survivor would ship something the battery did not measure.
    expect(result.value.block.text).toContain('bicycle.pdf');
    expect(result.value.block.text).not.toContain('Sammelmappe1.pdf');
  });

  it('TWO DIFFERENT TITLE-ONLY POSTS ARE BOTH KEPT', async () => {
    // The bug this avoids, and the battery could never have caught it: every
    // title-only post has the same empty body, so keying on text alone would
    // collapse two genuine and DIFFERENT results into one. No battery question
    // returns two of them.
    const result = await searchBoardAiContext(
      authClient([], true),
      reader([], [post('p1', 'Trump Note Post', '', 0.030), post('p2', 'Audi A2 Stoßstange Titel bild', '', 0.007)]),
      BOARD, USER, 'trump note audi', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result.used).toBe(2);
    expect(result.value.block.text).toContain('Trump Note Post');
    expect(result.value.block.text).toContain('Audi A2 Stoßstange Titel bild');
  });

  it('de-duplicates across BOTH sources, not within one', () => {
    const shared = 'the very same words';
    const kept = dropDuplicateBoardAiSearchPassages([
      { source: 'post', label: 'A note', text: shared, rank: 0.9 },
      { source: 'pdf', label: 'doc.pdf — page 1', text: shared, rank: 0.8 },
      { source: 'pdf', label: 'doc.pdf — page 2', text: 'different words', rank: 0.7 },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept[0].source).toBe('post');
    expect(kept[1].text).toBe('different words');
  });

  it('near-identical text is NOT collapsed, because the rule is exact', () => {
    // Exact-match only. A rule that collapsed similar passages would be a
    // similarity threshold -- a tuned constant -- which is the thing the battery
    // disqualified.
    const kept = dropDuplicateBoardAiSearchPassages([
      { source: 'pdf', label: 'a', text: 'Applying lubricant correctly.', rank: 0.9 },
      { source: 'pdf', label: 'b', text: 'Applying lubricant correctly!', rank: 0.8 },
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe('a title-only post that matched is a result, not noise', () => {
  it('the Trump-note query keeps Trump Note Post', async () => {
    // MEASURED: six of the nine text posts on the reference board have empty
    // bodies, and the rank normalization correctly puts a short exact title
    // match FIRST -- 0.0228 here, against 0.0032 for the best chunk. The rule
    // this replaces deleted exactly that row.
    const result = await searchBoardAiContext(
      authClient([], true),
      reader([], [post('ea370926', 'Trump Note Post', '', 0.0228)], [chunk('c1', 'Iran live updates: Trump threatens…')]),
      BOARD, USER, 'What does the Trump note post say?', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.block.text).toContain('Trump Note Post');
    expect(result.value.result.used).toBe(2);
  });

  it('its origin line says it is title-only, so no body can be implied', async () => {
    const result = await searchBoardAiContext(
      authClient([], true), reader([], [post('p1', 'Trump Note Post', '', 0.0228)]),
      BOARD, USER, 'What does the Trump note post say?', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The true answer is that the post exists and is empty. The line must let
    // the model say that rather than read as a source whose text went missing.
    expect(result.value.block.text).toBe('[board post, title only and no body: Trump Note Post]');
    expect(result.value.block.text).not.toMatch(/\[board post: /);
  });

  it('a post WITH a body is unaffected', async () => {
    const result = await searchBoardAiContext(
      authClient([], true),
      reader([], [post('p1', 'Audi A2 Stoßstange demontieren neu.pdf', 'Möchte man nur die Hupe wechseln…', 0.0034)]),
      BOARD, USER, 'bumper horn', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.block.text).toContain('[board post: Audi A2 Stoßstange demontieren neu.pdf]');
    expect(result.value.block.text).toContain('Möchte man nur die Hupe wechseln');
    expect(result.value.block.text).not.toContain('title only');
  });

  it('an empty CHUNK is still dropped, because a chunk IS its text', async () => {
    // A chunk has no title of its own, so an empty one contributes nothing and
    // could not have matched in the first place.
    const result = await searchBoardAiContext(
      authClient([], true), reader([], [], [chunk('c1', '')]),
      BOARD, USER, 'anything relevant', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result.used).toBe(0);
  });
});

describe('the search clock is bounded and separate from the generation clock', () => {
  it('is three seconds, so the total stays about 23 rather than unbounded', () => {
    // One clock must not eat the other: executeBoardAiChat starts its own 20s
    // timer only AFTER the search returns.
    expect(BOARD_AI_SEARCH_TIMEOUT_MS).toBe(3_000);
    expect(BOARD_AI_SEARCH_TIMEOUT_MS + BOARD_AI_CHAT_TIMEOUT_MS).toBe(23_000);
  });

  it('a search that exceeds it produces the failed outcome, not an error and not an empty result', async () => {
    vi.useFakeTimers();
    try {
      const pending = searchBoardAiContext(
        authClient([], true),
        {
          // Never resolves. The real shape of a seq scan on a large board.
          searchPosts: () => new Promise(() => {}),
          searchChunks: () => new Promise(() => {}),
        },
        BOARD, USER, 'oil headlines', 5000,
      );
      await vi.advanceTimersByTimeAsync(BOARD_AI_SEARCH_TIMEOUT_MS + 10);
      const result = await pending;

      // Refused, so the route maps it to `failed` and the user is TOLD. An
      // empty result here would say "your board holds nothing", which is a
      // different and false claim.
      expect(result.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a search that finishes inside the budget is unaffected', async () => {
    const result = await searchBoardAiContext(
      authClient([], true), reader([], [post('p1', 'Note', 'oil headlines')]),
      BOARD, USER, 'oil headlines', 5000,
    );
    expect(result.ok).toBe(true);
  });
});

describe('the search block itself', () => {
  it('labels every passage with its origin so the prompt\'s claim stays true', async () => {
    const calls: string[] = [];
    const result = await searchBoardAiContext(
      authClient(calls, true),
      reader(calls, [post('p1', 'Weekly plan', 'the note body')], [chunk('c1', 'the pdf body')]),
      BOARD, USER, 'weekly plan body', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.block.type).toBe('board-search');
    expect(result.value.block.text).toContain('[board post: Weekly plan]');
    expect(result.value.block.text).toContain('[PDF text: slides.pdf — page 3]');
    // The counts reach the model through the label, so it can answer honestly.
    expect(result.value.block.label).toContain('2 text passages used');
  });

  it('an all-stopword message never reaches the database, and says nothing matched', async () => {
    const calls: string[] = [];
    const result = await searchBoardAiContext(
      authClient(calls, true), reader(calls), BOARD, USER, 'what is it about?', 5000,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).not.toContain('search');
    // LOAD-BEARING. Without this the model infers it was never searched.
    expect(result.value.block.text).toBe('No passages on this board matched this search.');
    expect(result.value.result.outcome).toBe('ran');
  });

  it('asks each source for no more than its own K', async () => {
    const limits: number[] = [];
    await searchBoardAiContext(
      authClient([], true),
      {
        async searchPosts(_b, _q, limit) { limits.push(limit); return ok([]); },
        async searchChunks(_b, _q, limit) { limits.push(limit); return ok([]); },
      },
      BOARD, USER, 'oil headlines', 5000,
    );
    expect(limits).toEqual([BOARD_AI_SEARCH_LIMIT_PER_SOURCE, BOARD_AI_SEARCH_LIMIT_PER_SOURCE]);
  });

  it('passes a tsquery expression to the reader, never the raw message', async () => {
    const queries: string[] = [];
    await searchBoardAiContext(
      authClient([], true),
      {
        async searchPosts(_b, query) { queries.push(query); return ok([]); },
        async searchChunks(_b, query) { queries.push(query); return ok([]); },
      },
      BOARD, USER, 'What about the Iran oil headlines & the tankers?', 5000,
    );
    // Stopwords gone, OR-joined, operator punctuation stripped.
    expect(queries[0]).toBe('iran | oil | headlines | tankers');
    expect(queries[0]).toBe(queries[1]);
  });
});
