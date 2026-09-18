import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_DRAFT_CONTEXT_MAX,
  addBoardAiDraftContext,
  boardAiDraftContextPayload,
  boardAiDraftFromBoardItem,
  boardAiDraftFromDocument,
  boardAiDraftFromPage,
  boardAiDraftFromSelection,
  boardAiDraftKey,
  blockingBoardAiDraftContext,
  removeBoardAiDraftContext,
  withBoardAiDraftReadiness,
  type BoardAiDraftContextItem,
} from './boardAiChatDraftContext';

const DOC = 'aaaaaaaa-1111-4111-8111-111111111111';
const PAD = 'bbbbbbbb-2222-4222-8222-222222222222';

describe('3,4,5,6. only board items with a real text authority become drafts', () => {
  it('3,4. a text or note post attaches ITSELF, by id', () => {
    for (const type of ['text', 'note']) {
      const draft = boardAiDraftFromBoardItem({ id: PAD, type, title: 'Planning' })!;
      expect(draft.request, type).toEqual({ type: 'padlet', padletId: PAD });
      expect(draft.label).toBe('Planning');
    }
  });

  it('5. a PDF placement attaches its DOCUMENT, not the card', () => {
    const draft = boardAiDraftFromBoardItem({
      id: PAD, type: 'card', title: 'A2.pdf',
      knowledgeDocumentId: DOC, knowledgeOriginalFilename: 'A2.pdf',
    })!;
    // The card's own row says nothing; the document is where the text lives.
    expect(draft.request).toEqual({ type: 'knowledge-document', knowledgeDocumentId: DOC });
    expect(draft.label).toBe('A2.pdf');
  });

  it('6. every type the server would refuse yields no draft at all', () => {
    for (const type of ['card', 'todo', 'image', 'drawing', 'file', 'map', 'link', 'table', 'comment']) {
      // `card` without a placement is clipart or a Document card -- D1 removed
      // both, so offering an attach action here would promise a refusal.
      expect(boardAiDraftFromBoardItem({ id: PAD, type, title: 't' }), type).toBeNull();
    }
  });

  it('an untitled post still has something to show on its chip', () => {
    expect(boardAiDraftFromBoardItem({ id: PAD, type: 'note', title: '  ' })!.label).toBe('Note');
  });

  it('a page draft says on its chip that only text travels', () => {
    // A page's images do NOT travel; only an area crop carries pixels. Without
    // this the honest "I have no image" reads as a broken attachment.
    expect(boardAiDraftFromPage(DOC, 'A2.pdf', 6).detail).toBe('p. 6 · text only');
    // The request itself is unchanged: this is a label, not a payload.
    expect(boardAiDraftFromPage(DOC, 'A2.pdf', 6).request)
      .toEqual({ type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6 });
  });

  it('a document draft says on its chip that only text travels', () => {
    // A whole PDF attaches as bounded TEXT, never its images -- only an area
    // crop carries pixels. Same claim the page chip makes.
    expect(boardAiDraftFromDocument(DOC, 'A2.pdf').detail).toBe('text only');
  });
});

describe('9,10. identity decides what is a duplicate', () => {
  const page = (n: number) => boardAiDraftFromPage(DOC, 'A2.pdf', n);

  it('9. the same source twice is one chip', () => {
    const first = addBoardAiDraftContext([], page(6));
    const second = addBoardAiDraftContext(first.items, page(6));
    expect(second.outcome).toBe('duplicate');
    expect(second.items).toHaveLength(1);
  });

  it('deduplicates on identity, not on the label a browser drew', () => {
    const a = boardAiDraftFromPage(DOC, 'A2.pdf', 6);
    const b = { ...boardAiDraftFromPage(DOC, 'renamed.pdf', 6), label: 'renamed.pdf' };
    expect(addBoardAiDraftContext([a], b).outcome).toBe('duplicate');
  });

  it('10. two different ranges on one page stay two attachments', () => {
    const one = boardAiDraftFromSelection(DOC, 'A2.pdf', {
      pageNumber: 6, charStart: 0, charEnd: 10, selectedText: 'first ten',
    })!;
    const two = boardAiDraftFromSelection(DOC, 'A2.pdf', {
      pageNumber: 6, charStart: 20, charEnd: 30, selectedText: 'later ten',
    })!;
    expect(boardAiDraftKey(one)).not.toBe(boardAiDraftKey(two));
    expect(addBoardAiDraftContext([one], two).items).toHaveLength(2);
  });

  it('a page, a selection on it and the whole document are three things', () => {
    const keys = new Set([
      boardAiDraftKey(boardAiDraftFromDocument(DOC, 'A2.pdf')),
      boardAiDraftKey(boardAiDraftFromPage(DOC, 'A2.pdf', 6)),
      boardAiDraftKey(boardAiDraftFromSelection(DOC, 'A2.pdf', {
        pageNumber: 6, charStart: 0, charEnd: 5, selectedText: 'abcde',
      })!),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('11. the ceiling refuses rather than replaces', () => {
  it('a fifth attachment is rejected, and the four chosen ones survive', () => {
    let items: readonly BoardAiDraftContextItem[] = [];
    for (let n = 1; n <= BOARD_AI_DRAFT_CONTEXT_MAX; n += 1) {
      items = addBoardAiDraftContext(items, boardAiDraftFromPage(DOC, 'A2.pdf', n)).items;
    }
    const fifth = addBoardAiDraftContext(items, boardAiDraftFromPage(DOC, 'A2.pdf', 99));
    expect(fifth.outcome).toBe('full');
    // No silent replacement: what the user picked is still exactly what is held.
    expect(fifth.items).toBe(items);
    expect(fifth.items).toHaveLength(4);
  });
});

describe('8. removing a chip removes only that chip', () => {
  it('drops the named attachment and keeps the rest', () => {
    const a = boardAiDraftFromPage(DOC, 'A2.pdf', 1);
    const b = boardAiDraftFromPage(DOC, 'A2.pdf', 2);
    const left = removeBoardAiDraftContext([a, b], boardAiDraftKey(a));
    expect(left).toHaveLength(1);
    expect(left[0]).toBe(b);
  });
});

describe('14,15,32. the payload is identity and provenance, never content', () => {
  it('14. each type sends exactly the contract fields', () => {
    const payload = boardAiDraftContextPayload([
      boardAiDraftFromDocument(DOC, 'A2.pdf'),
      boardAiDraftFromPage(DOC, 'A2.pdf', 6),
      boardAiDraftFromSelection(DOC, 'A2.pdf', {
        pageNumber: 6, charStart: 4, charEnd: 9, selectedText: 'exact',
      })!,
      boardAiDraftFromBoardItem({ id: PAD, type: 'note', title: 'Planning' })!,
    ])!;
    expect(payload.items).toEqual([
      { type: 'knowledge-document', knowledgeDocumentId: DOC },
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6 },
      {
        type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 6,
        charStart: 4, charEnd: 9, selectedText: 'exact',
      },
      { type: 'padlet', padletId: PAD },
    ]);
  });

  it('15. a chip\'s label and detail never travel', () => {
    const draft = boardAiDraftFromPage(DOC, 'CONFIDENTIAL-NAME.pdf', 6);
    expect(draft.label).toBe('CONFIDENTIAL-NAME.pdf');
    const serialized = JSON.stringify(boardAiDraftContextPayload([draft]));
    expect(serialized).not.toContain('CONFIDENTIAL-NAME');
    expect(serialized).not.toContain('label');
    expect(serialized).not.toContain('detail');
  });

  it('a field bolted onto a draft cannot leak into the request', () => {
    // The payload rebuilds each item field by field rather than spreading it.
    const rogue = {
      ...boardAiDraftFromPage(DOC, 'A2.pdf', 6),
      request: {
        ...boardAiDraftFromPage(DOC, 'A2.pdf', 6).request,
        pageText: 'THE WHOLE PAGE', apiKey: 'sk-leak',
      },
    } as unknown as BoardAiDraftContextItem;
    const serialized = JSON.stringify(boardAiDraftContextPayload([rogue]));
    expect(serialized).not.toContain('THE WHOLE PAGE');
    expect(serialized).not.toContain('sk-leak');
  });

  it('32. a selection sends its own span, never the surrounding page', () => {
    const draft = boardAiDraftFromSelection(DOC, 'A2.pdf', {
      pageNumber: 6, charStart: 4, charEnd: 9, selectedText: 'exact',
    })!;
    const item = boardAiDraftContextPayload([draft])!.items[0] as { selectedText: string };
    expect(item.selectedText).toBe('exact');
  });

  it('nothing attached means no context field in the body at all', () => {
    expect(boardAiDraftContextPayload([])).toBeUndefined();
  });
});

describe('36. an incomplete selection offers no handoff', () => {
  it('refuses every malformed span rather than repairing one', () => {
    for (const bad of [
      { pageNumber: 0, charStart: 0, charEnd: 5, selectedText: 'abcde' },
      { pageNumber: 1, charStart: -1, charEnd: 5, selectedText: 'abcde' },
      { pageNumber: 1, charStart: 5, charEnd: 5, selectedText: 'abcde' },
      { pageNumber: 1, charStart: 9, charEnd: 5, selectedText: 'abcde' },
      { pageNumber: 1, charStart: 0, charEnd: 5, selectedText: '' },
      { pageNumber: 1.5, charStart: 0, charEnd: 5, selectedText: 'abcde' },
    ]) {
      // A repaired selection is not the one the user made.
      expect(boardAiDraftFromSelection(DOC, 'A2.pdf', bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('a long selection is quoted briefly on the chip but sent in full', () => {
    const long = 'x'.repeat(500);
    const draft = boardAiDraftFromSelection(DOC, 'A2.pdf', {
      pageNumber: 1, charStart: 0, charEnd: 500, selectedText: long,
    })!;
    expect(draft.detail!.length).toBeLessThan(120);
    const item = boardAiDraftContextPayload([draft])!.items[0] as { selectedText: string };
    expect(item.selectedText).toBe(long);
  });
});

/**
 * A FRESHLY UPLOADED PDF IS NOT A READABLE SOURCE YET.
 *
 * Ingestion is asynchronous, and every reader filters on
 * `processing_status = 'ready'`. A pending document therefore resolves to no
 * text at all -- so sending one would hand the model an attachment containing
 * nothing, and the model would answer honestly from nothing while the user read
 * a confident reply about the file they just uploaded.
 *
 * That is the same silent shape as the truncated chat answer and the
 * intermittent classifier: a real response, drawn from less than the user
 * believes it had. The difference is that this one can be prevented outright,
 * because the composer knows the document is not ready.
 */
describe('37. readiness: an attachment that cannot be read yet says so', () => {
  it('a fresh upload is pending, and a ready one carries no readiness at all', () => {
    expect(boardAiDraftFromDocument(DOC, 'A2.pdf', 'uploaded').readiness).toBe('pending');
    expect(boardAiDraftFromDocument(DOC, 'A2.pdf', 'processing').readiness).toBe('pending');
    expect(boardAiDraftFromDocument(DOC, 'A2.pdf', 'failed').readiness).toBe('failed');
    expect(boardAiDraftFromDocument(DOC, 'A2.pdf', 'ready').readiness).toBeUndefined();
  });

  it('every other caller is untouched -- they attach sources that were ready long ago', () => {
    // Omitting the status must not mean "pending": the PDF reader and the board
    // selection attach documents the user was already reading.
    expect(boardAiDraftFromDocument(DOC, 'A2.pdf').readiness).toBeUndefined();
    expect(boardAiDraftFromPage(DOC, 'A2.pdf', 3).readiness).toBeUndefined();
    expect(boardAiDraftFromBoardItem({
      id: PAD, type: 'note', title: 'A note',
    })!.readiness).toBeUndefined();
  });

  it('blocking is decided in ONE place, and both unusable states block', () => {
    const pending = boardAiDraftFromDocument(DOC, 'A2.pdf', 'processing');
    const failed = boardAiDraftFromDocument(PAD, 'B.pdf', 'failed');
    const ready = boardAiDraftFromDocument('cccccccc-3333-4333-8333-333333333333', 'C.pdf', 'ready');

    expect(blockingBoardAiDraftContext([ready])).toEqual([]);
    expect(blockingBoardAiDraftContext([ready, pending])).toEqual([pending]);
    // 'failed' never resolves itself, so it blocks until the user removes it.
    expect(blockingBoardAiDraftContext([ready, failed])).toEqual([failed]);
  });

  it('READINESS IS NEVER SENT -- the payload is identical either way', () => {
    // The whole reason this field is safe to add: the payload builder rebuilds
    // each item field by field rather than spreading it.
    const pending = boardAiDraftFromDocument(DOC, 'A2.pdf', 'uploaded');
    const ready = boardAiDraftFromDocument(DOC, 'A2.pdf', 'ready');
    expect(boardAiDraftContextPayload([pending])).toEqual(boardAiDraftContextPayload([ready]));
    expect(JSON.stringify(boardAiDraftContextPayload([pending]))).not.toContain('readiness');
    expect(JSON.stringify(boardAiDraftContextPayload([pending]))).not.toContain('pending');
  });

  it('the status update clears readiness entirely rather than leaving a stale flag', () => {
    const items = [boardAiDraftFromDocument(DOC, 'A2.pdf', 'uploaded')];
    const ready = withBoardAiDraftReadiness(items, DOC, 'ready');
    expect(ready[0].readiness).toBeUndefined();
    expect('readiness' in ready[0]).toBe(false);
    // Identity is preserved: the same document, still attached.
    expect(boardAiDraftKey(ready[0])).toBe(boardAiDraftKey(items[0]));
  });

  it('a status update touches only the document it names', () => {
    const other = 'cccccccc-3333-4333-8333-333333333333';
    const items = [
      boardAiDraftFromDocument(DOC, 'A2.pdf', 'uploaded'),
      boardAiDraftFromDocument(other, 'C.pdf', 'uploaded'),
      boardAiDraftFromBoardItem({ id: PAD, type: 'note', title: 'A note' })!,
    ];
    const updated = withBoardAiDraftReadiness(items, DOC, 'ready');
    expect(updated[0].readiness).toBeUndefined();
    expect(updated[1].readiness).toBe('pending');
    // A card attachment names no document, so it can never be matched by one.
    expect(updated[2]).toBe(items[2]);
  });

  it('pending becomes failed when ingestion gives up', () => {
    const items = [boardAiDraftFromDocument(DOC, 'A2.pdf', 'uploaded')];
    expect(withBoardAiDraftReadiness(items, DOC, 'failed')[0].readiness).toBe('failed');
  });

  it('an unrecognised status does not strand a chip as pending forever', () => {
    const items = [boardAiDraftFromDocument(DOC, 'A2.pdf', 'uploaded')];
    // Better to let the send through and have the server refuse an empty
    // document than to leave the composer permanently blocked on a status
    // this build does not know about.
    expect(withBoardAiDraftReadiness(items, DOC, 'something-new')[0].readiness).toBeUndefined();
  });
});
