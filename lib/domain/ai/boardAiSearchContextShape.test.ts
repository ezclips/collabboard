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
