import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_CONTEXT_MAX_HISTORICAL_IDENTITIES,
  BOARD_AI_CONTEXT_MAX_ITEMS,
  boardAiContextIdentityKey,
  selectHistoricalContextIdentities,
  BOARD_AI_CONTEXT_MAX_SINGLE_CHARS,
  BOARD_AI_CONTEXT_MAX_TOTAL_CHARS,
  BOARD_AI_CONTEXT_VERSION,
  boardAiContextRequestsFromStored,
  boardAiContextViewFromStored,
  boundResolvedContext,
  buildBoardAiContextEnvelope,
  type ResolvedBoardAiContextBlock,
} from './boardAiChatContext';

const DOC = 'aaaaaaaa-1111-4111-8111-111111111111';
const PAD = 'bbbbbbbb-2222-4222-8222-222222222222';

const block = (over: Partial<ResolvedBoardAiContextBlock> = {}): ResolvedBoardAiContextBlock => ({
  type: 'knowledge-page', label: 'doc.pdf — page 1', knowledgeDocumentId: DOC,
  pageNumber: 1, text: 'page text', ...over,
});

describe('28-29. the persisted envelope is built by the server', () => {
  it('carries identity plus its OWN label and excerpt', () => {
    const envelope = buildBoardAiContextEnvelope([block({ text: 'the authoritative page text' })])!;
    expect(envelope.version).toBe(BOARD_AI_CONTEXT_VERSION);
    expect(envelope.items[0]).toMatchObject({
      type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1,
      label: 'doc.pdf — page 1', excerpt: 'the authoritative page text',
    });
  });

  it('stores a selection quote only for a selection', () => {
    const selection = buildBoardAiContextEnvelope([block({
      type: 'knowledge-selection', charStart: 4, charEnd: 9, text: 'exact',
    })])!;
    expect(selection.items[0].selectedText).toBe('exact');
    expect(buildBoardAiContextEnvelope([block()])!.items[0].selectedText).toBeUndefined();
  });

  it('bounds what it stores, so a page never becomes a snapshot', () => {
    const envelope = buildBoardAiContextEnvelope([block({ text: 'x'.repeat(5_000) })])!;
    expect(envelope.items[0].excerpt!.length).toBeLessThan(400);
  });

  it('no context means no envelope at all', () => {
    expect(buildBoardAiContextEnvelope([])).toBeNull();
  });
});

describe('22-27. a stored envelope is a claim, never content', () => {
  it('reads back IDENTITY only, so a later turn must re-authorize', () => {
    const stored = {
      version: 1,
      items: [{
        type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 3,
        label: 'forged label', excerpt: 'forged excerpt',
      }],
    };
    const requests = boardAiContextRequestsFromStored(stored);
    expect(requests).toEqual([{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 3 }]);
    // 26. The forged display strings are not part of what gets resolved.
    expect(JSON.stringify(requests)).not.toContain('forged');
  });

  it('drops malformed, unknown and out-of-range items rather than throwing', () => {
    // One hand-written row must not brick the rest of a conversation.
    const requests = boardAiContextRequestsFromStored({
      version: 1,
      items: [
        { type: 'nonsense', knowledgeDocumentId: DOC },
        { type: 'knowledge-page', knowledgeDocumentId: DOC },
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 0 },
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1.5 },
        { type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 1, charStart: 5, charEnd: 5, selectedText: 'x' },
        { type: 'padlet', padletId: PAD },
      ],
    });
    expect(requests).toEqual([{ type: 'padlet', padletId: PAD }]);
  });

  it('refuses an envelope of another version, and anything that is not one', () => {
    expect(boardAiContextRequestsFromStored({ version: 99, items: [{ type: 'padlet', padletId: PAD }] })).toEqual([]);
    for (const bad of [null, undefined, 'string', 42, [], { items: 'no' }]) {
      expect(boardAiContextRequestsFromStored(bad)).toEqual([]);
    }
  });

  it('never reads back more items than the cap allows', () => {
    const items = Array.from({ length: 20 }, () => ({ type: 'padlet', padletId: PAD }));
    expect(boardAiContextRequestsFromStored({ version: 1, items })).toHaveLength(BOARD_AI_CONTEXT_MAX_ITEMS);
  });
});

describe('10-14. WHICH history is worth reading is decided before any read', () => {
  const envelope = (items: unknown[]) => ({ version: 1, items });
  const page = (n: number) => ({ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: n });

  it('10,11. at most 8 distinct identities are ever selected', () => {
    // Fifty messages, four fresh sources each -- two hundred identities.
    const envelopes = Array.from({ length: 50 }, (_, m) =>
      envelope(Array.from({ length: 4 }, (_, i) => page(m * 4 + i + 1))));
    const selected = selectHistoricalContextIdentities(envelopes);
    expect(selected).toHaveLength(BOARD_AI_CONTEXT_MAX_HISTORICAL_IDENTITIES);
    // The ninth distinct identity is never handed to a resolver, so it is
    // never read: the cost of a request stops growing with the thread.
    expect(selected.map((item) => (item as { pageNumber: number }).pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('12. the NEWEST occurrence wins when the budget runs out', () => {
    // Caller order is newest message first.
    const envelopes = [envelope([page(99)]), envelope([page(1)])];
    expect(selectHistoricalContextIdentities(envelopes, 1))
      .toEqual([{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 99 }]);
  });

  it('13,14. an identity re-attached every turn takes exactly one slot', () => {
    const envelopes = [
      ...Array.from({ length: 20 }, () => envelope([page(7)])),
      envelope([{ type: 'padlet', padletId: PAD }]),
    ];
    const selected = selectHistoricalContextIdentities(envelopes);
    // Without de-duplication the repeated page would fill all eight slots and
    // the note the user also referred to would never be read.
    expect(selected).toHaveLength(2);
    expect(selected[1]).toEqual({ type: 'padlet', padletId: PAD });
  });

  it('deduplicates on identity, never on the label a user wrote', () => {
    const envelopes = [
      envelope([{ ...page(3), label: 'one name', excerpt: 'a' }]),
      envelope([{ ...page(3), label: 'a different name', excerpt: 'b' }]),
    ];
    expect(selectHistoricalContextIdentities(envelopes)).toHaveLength(1);
  });

  it('tells the four identity kinds apart, and a selection by its range', () => {
    const selected = selectHistoricalContextIdentities([envelope([
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
      page(1),
      { type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 1, charStart: 0, charEnd: 5, selectedText: 'abcde' },
      { type: 'padlet', padletId: PAD },
    ])]);
    expect(selected).toHaveLength(4);
    expect(new Set(selected.map(boardAiContextIdentityKey)).size).toBe(4);

    // Two selections on the same page differing only in range stay distinct.
    const ranges = selectHistoricalContextIdentities([envelope([
      { type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 1, charStart: 0, charEnd: 5, selectedText: 'abcde' },
      { type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 1, charStart: 5, charEnd: 9, selectedText: 'fghi' },
    ])]);
    expect(ranges).toHaveLength(2);
  });

  it('9. malformed rows are skipped without consuming a slot', () => {
    const envelopes = [
      envelope([{ type: 'nonsense' }, { type: 'knowledge-page', knowledgeDocumentId: DOC }]),
      envelope([page(1)]),
    ];
    expect(selectHistoricalContextIdentities(envelopes))
      .toEqual([{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 }]);
  });

  it('a thread with no stored context asks for no reads at all', () => {
    expect(selectHistoricalContextIdentities([null, undefined, { version: 1, items: [] }])).toEqual([]);
  });
});

describe('19-21. display strings stay bound to their own stored item', () => {
  it('19,20. a dropped item never lends its label to the survivor', () => {
    const view = boardAiContextViewFromStored({
      version: 1,
      items: [
        // Malformed -- no pageNumber. Dropped whole.
        { type: 'knowledge-page', knowledgeDocumentId: DOC, label: 'LABEL-OF-DROPPED', excerpt: 'EXCERPT-OF-DROPPED' },
        { type: 'padlet', padletId: PAD, label: 'LABEL-OF-KEPT', excerpt: 'EXCERPT-OF-KEPT' },
      ],
    })!;
    expect(view.items).toHaveLength(1);
    expect(view.items[0].type).toBe('padlet');
    expect(view.items[0].label).toBe('LABEL-OF-KEPT');
    // 21. The excerpt travels with its own item too.
    expect(view.items[0].excerpt).toBe('EXCERPT-OF-KEPT');
    expect(JSON.stringify(view)).not.toContain('DROPPED');
  });

  it('keeps each label with its own item across several survivors', () => {
    const view = boardAiContextViewFromStored({
      version: 1,
      items: [
        { type: 'bogus', label: 'ZERO' },
        { type: 'padlet', padletId: PAD, label: 'FIRST' },
        { type: 'knowledge-page', knowledgeDocumentId: DOC, label: 'SKIPPED-NO-PAGE' },
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 2, label: 'SECOND' },
      ],
    })!;
    expect(view.items.map((item) => item.label)).toEqual(['FIRST', 'SECOND']);
  });

  it('an item with no display strings simply has none', () => {
    const view = boardAiContextViewFromStored({ version: 1, items: [{ type: 'padlet', padletId: PAD }] })!;
    expect(view.items[0].label).toBeUndefined();
    expect(view.items[0].excerpt).toBeUndefined();
  });
});

describe('32-34. the public view is re-derived, not forwarded', () => {
  it('returns only contract fields, dropping anything else the row holds', () => {
    const view = boardAiContextViewFromStored({
      version: 1,
      items: [{
        type: 'padlet', padletId: PAD, label: 'My note', excerpt: 'hello',
        signedUrl: 'https://leak', apiKey: 'sk-should-never-travel', storagePath: '/secret',
      }],
    })!;
    expect(Object.keys(view.items[0]).sort()).toEqual(['excerpt', 'label', 'padletId', 'type']);
    const serialized = JSON.stringify(view);
    for (const leak of ['signedUrl', 'apiKey', 'sk-', 'storagePath', 'https://']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('keeps enough for a chip to be redrawn after a reload', () => {
    const view = boardAiContextViewFromStored({
      version: 1,
      items: [{ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 7, label: 'doc.pdf — page 7' }],
    })!;
    expect(view.items[0]).toMatchObject({ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 7, label: 'doc.pdf — page 7' });
  });

  it('an empty or unusable envelope reads as no context', () => {
    expect(boardAiContextViewFromStored(null)).toBeNull();
    expect(boardAiContextViewFromStored({ version: 1, items: [] })).toBeNull();
  });
});

describe('38-42. one budget, current context first', () => {
  it('39-40. enforces the item and total-character caps', () => {
    const many = Array.from({ length: 10 }, (_, i) => block({ label: `b${i}`, text: 'x'.repeat(1_000) }));
    const bounded = boundResolvedContext(many);
    expect(bounded.length).toBeLessThanOrEqual(BOARD_AI_CONTEXT_MAX_ITEMS);
    expect(bounded.reduce((n, b) => n + b.text.length, 0)).toBeLessThanOrEqual(BOARD_AI_CONTEXT_MAX_TOTAL_CHARS);
  });

  it('clamps a single oversized block rather than dropping it', () => {
    const bounded = boundResolvedContext([block({ text: 'y'.repeat(BOARD_AI_CONTEXT_MAX_SINGLE_CHARS + 5_000) })]);
    expect(bounded).toHaveLength(1);
    expect(bounded[0].text.length).toBe(BOARD_AI_CONTEXT_MAX_SINGLE_CHARS);
  });

  it('38,42. the caller\'s order is the priority order -- oldest goes first', () => {
    // Each block is already at the single-item clamp, so the TOTAL budget is
    // what decides: two fit, the third does not.
    const size = BOARD_AI_CONTEXT_MAX_SINGLE_CHARS;
    const current = block({ label: 'CURRENT', text: 'x'.repeat(size) });
    const old1 = block({ label: 'OLD-1', text: 'y'.repeat(size) });
    const old2 = block({ label: 'OLD-2', text: 'z'.repeat(size) });
    // The route passes current blocks ahead of historical ones, so the oldest
    // is what falls off.
    const bounded = boundResolvedContext([current, old1, old2]);
    expect(bounded.map((b) => b.label)).toEqual(['CURRENT', 'OLD-1']);
    expect(bounded.reduce((n, b) => n + b.text.length, 0))
      .toBeLessThanOrEqual(BOARD_AI_CONTEXT_MAX_TOTAL_CHARS);
  });

  it('keeps the current block even when it alone fills the budget', () => {
    const huge = block({ label: 'CURRENT', text: 'x'.repeat(BOARD_AI_CONTEXT_MAX_TOTAL_CHARS * 2) });
    const bounded = boundResolvedContext([huge]);
    expect(bounded).toHaveLength(1);
    expect(bounded[0].label).toBe('CURRENT');
  });
});
