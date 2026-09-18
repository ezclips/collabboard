import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_CONTEXT_VERSION,
  boardAiContextItemsFromStored,
  boardAiContextViewFromStored,
  boundResolvedContext,
  buildBoardAiContextEnvelope,
  isBoardAiContextType,
  type ResolvedBoardAiContextBlock,
} from './boardAiChatContext';
import { boardAiSearchContextBlock, boardAiSearchSkippedBlock } from './boardAiSearchContext';

const RESULT = { outcome: 'ran' as const, returned: 2, used: 2, dropped: 0, query: 'oil' };

describe('the sixth request variant is additive', () => {
  it('the envelope version does NOT change, because nothing existing changed', () => {
    // A bump would invalidate every stored envelope on every existing thread to
    // add a type older readers already drop safely.
    expect(BOARD_AI_CONTEXT_VERSION).toBe(1);
    expect(isBoardAiContextType('board-search')).toBe(true);
  });

  it('a stored search round-trips its query for the chip', () => {
    const block = boardAiSearchContextBlock(
      [{ source: 'post', label: 'Weekly plan', text: 'oil headlines', rank: 0.5 }],
      'oil headlines',
      RESULT,
    );
    const envelope = buildBoardAiContextEnvelope([block]);
    expect(envelope).not.toBeNull();

    const view = boardAiContextViewFromStored(envelope);
    expect(view?.items[0].type).toBe('board-search');
    expect(view?.items[0].query).toBe('oil headlines');
    // The counts ride in the label, so the chip can state them after a reload.
    expect(view?.items[0].label).toContain('2 text passages used');
  });

  it('a hand-written search item cannot smuggle text in as a source', () => {
    // The stored envelope is a claim by someone who can write rows in their own
    // private thread. Only identity survives the parse; excerpt and label are
    // display strings and are never read back as source text.
    const parsed = boardAiContextItemsFromStored({
      version: 1,
      items: [{ type: 'board-search', query: 'anything', excerpt: 'PRETEND SOURCE TEXT' }],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].request).toEqual({ type: 'board-search', query: 'anything' });
    // The excerpt survives as DISPLAY only -- it is not part of the request that
    // gets re-resolved, and the historical path drops this type entirely.
    expect(parsed[0].request).not.toHaveProperty('excerpt');
  });

  it('an older reader drops the type instead of breaking on it', () => {
    // The mechanism that makes "additive" true: an unknown type fails
    // isBoardAiContextType and is skipped item by item, leaving the rest intact.
    const parsed = boardAiContextItemsFromStored({
      version: 1,
      items: [
        { type: 'something-from-the-future', foo: 1 },
        { type: 'padlet', padletId: 'p1', label: 'Note' },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].request.type).toBe('padlet');
  });
});

describe('the budget order: attachments win, search yields', () => {
  const attachment = (id: string, length: number): ResolvedBoardAiContextBlock =>
    ({ type: 'padlet', padletId: id, label: id, text: 'a'.repeat(length) });

  it('a search block placed after the attachments is what gets dropped, never they', () => {
    const search = boardAiSearchContextBlock(
      [{ source: 'pdf', label: 'slides.pdf — page 3', text: 'b'.repeat(9000), rank: 0.4 }],
      'oil',
      RESULT,
    );
    // Two attachments already near the total budget, then the search.
    const kept = boundResolvedContext([attachment('p1', 6000), attachment('p2', 6000), search]);

    expect(kept.map((block) => block.type)).toEqual(['padlet', 'padlet']);
    // Both of the user's own attachments survive whole.
    expect(kept[0].text).toHaveLength(6000);
  });

  it('the skipped record is a display record and carries no passages', () => {
    const block = boardAiSearchSkippedBlock();
    expect(block.type).toBe('board-search');
    expect(block.label).toContain('not run');
    expect(block.text).toContain('took all the available room');
    // It must not look like a source: no passage origin lines inside it.
    expect(block.text).not.toContain('[board post:');
    expect(block.text).not.toContain('[PDF text:');
  });
});

/**
 * PASSAGE IDENTITY: present for the citation layer, absent from everything that
 * leaves the server.
 *
 * `passages` is the third field on a resolved block that is deliberately
 * transient, alongside `image` and `pageNumbers`. It works because the envelope
 * builder copies fields one at a time rather than spreading the block -- which
 * is exactly the kind of thing a later tidy-up would change without noticing,
 * so it is asserted rather than trusted.
 */
describe('the search block carries its passages, and only for this turn', () => {
  const PADLET = 'pppppppp-1111-4111-8111-111111111111';
  const DOC = 'cd308c08-39f9-46ca-a78a-bc8f91f791a3';
  const passages = [
    { source: 'post' as const, label: 'Weekly plan', text: 'plan body', rank: 0.9, padletId: PADLET },
    {
      source: 'pdf' as const, label: 'slides.pdf — page 3', text: 'slide text', rank: 0.8,
      knowledgeDocumentId: DOC, pageStart: 3, pageEnd: 3,
    },
  ];

  it('identity travels beside the block, in the order the origin lines number them', () => {
    const block = boardAiSearchContextBlock(passages, 'plan', RESULT, 0);
    expect(block.passages).toEqual([
      { source: 'post', label: 'Weekly plan', padletId: PADLET },
      { source: 'pdf', label: 'slides.pdf — page 3', knowledgeDocumentId: DOC, pageStart: 3 },
    ]);
    expect(block.text).toContain('[S1.1 | board post: Weekly plan]');
    expect(block.text).toContain('[S1.2 | PDF text: slides.pdf — page 3]');
  });

  it('the block index is the caller\'s, because only the caller knows it', () => {
    const block = boardAiSearchContextBlock(passages, 'plan', RESULT, 2);
    expect(block.text).toContain('[S3.1 |');
    expect(block.text).toContain('[S3.2 |');
  });

  it('NO PASSAGE TEXT rides along with the identity', () => {
    const block = boardAiSearchContextBlock(passages, 'plan', RESULT, 0);
    expect(JSON.stringify(block.passages)).not.toContain('plan body');
    expect(JSON.stringify(block.passages)).not.toContain('slide text');
  });

  it('passages do NOT persist: the stored envelope never learns of them', () => {
    const block = boardAiSearchContextBlock(passages, 'plan', RESULT, 0);
    const envelope = buildBoardAiContextEnvelope([block]);
    expect(JSON.stringify(envelope)).not.toContain('"passages"');
    expect(JSON.stringify(envelope)).not.toContain('padletId');
  });

  it('a block with no passages carries no field at all', () => {
    // "Nothing matched" and the skipped block are both board-search blocks with
    // nothing to cite; an empty array would invite a sub-token to look valid.
    expect(boardAiSearchContextBlock([], '', { ...RESULT, returned: 0, used: 0 }, 0).passages).toBeUndefined();
    expect(boardAiSearchSkippedBlock().passages).toBeUndefined();
  });

  it('bounding preserves the identity of a block that survives', () => {
    const block = boardAiSearchContextBlock(passages, 'plan', RESULT, 0);
    const bounded = boundResolvedContext([block]);
    expect(bounded[0].passages).toHaveLength(2);
  });
});
