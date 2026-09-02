import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_CONTEXT_MAX_ITEMS,
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
