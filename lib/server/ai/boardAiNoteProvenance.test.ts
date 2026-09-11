import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardAiProvenanceProof } from './boardAiProvenanceProof';
import {
  resolveProvenNoteReferences,
  type StoredAssistantMessage,
} from './boardAiNoteProvenance';

/**
 * PDF_AI_PROVENANCE_PROOF_SECRET_RESUME_1 -- the authority boundary.
 *
 * `board_ai_messages` rows are writable by the thread's owner. These cases are
 * the difference between provenance the AI route generated and JSON a user
 * wrote into their own thread, and they run through the real resolver with the
 * real proof verifier.
 */
const ENV_VAR = 'BOARD_AI_PROVENANCE_SIGNING_KEY';
const TEST_KEY = Buffer.alloc(32, 11).toString('base64');

const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const PAGE_TEXT = 'The quick brown fox jumps over the lazy dog, repeatedly and with enthusiasm.';

const pageReader = vi.fn(async (documentId: string, pageNumber: number) =>
  (documentId === DOC_A && pageNumber === 5 ? PAGE_TEXT : null));

const selectionItem = {
  type: 'knowledge-selection',
  knowledgeDocumentId: DOC_A,
  pageNumber: 5,
  charStart: 4,
  charEnd: 19,
  label: 'p. 5',
};
const pageItem = { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 5, label: 'p. 5' };

/** A genuine assistant row, as the AI route would have written it. */
function genuine(items: readonly Record<string, unknown>[], over: Partial<StoredAssistantMessage> = {}): StoredAssistantMessage {
  const base = {
    id: 'msg-1',
    threadId: 'thread-1',
    boardId: 'board-1',
    role: 'assistant',
    content: 'the answer',
    ...over,
  };
  return {
    ...base,
    citations: {
      version: 1,
      items,
      proof: createBoardAiProvenanceProof({
        messageId: base.id,
        threadId: base.threadId,
        boardId: base.boardId,
        content: base.content,
        citationItems: items,
      }),
    },
  } as StoredAssistantMessage;
}

let originalKey: string | undefined;
beforeEach(() => {
  originalKey = process.env[ENV_VAR];
  process.env[ENV_VAR] = TEST_KEY;
  pageReader.mockClear();
});
afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalKey;
});

describe('a genuine signed message yields provenance', () => {
  it('A. a proven page citation becomes one page reference', async () => {
    const result = await resolveProvenNoteReferences(genuine([pageItem]), pageReader);
    expect(result).toEqual({
      ok: true,
      references: [{
        sourceDocumentId: DOC_A, pageStart: 5, pageEnd: 5,
        quoteText: null, charStart: null, charEnd: null, selectedText: null,
      }],
    });
    // A page citation needs no page text.
    expect(pageReader).not.toHaveBeenCalled();
  });

  it('B/C. a proven selection re-reads the page and derives the quote SERVER-side', async () => {
    const result = await resolveProvenNoteReferences(genuine([selectionItem]), pageReader);
    expect(result.ok).toBe(true);
    expect(pageReader).toHaveBeenCalledWith(DOC_A, 5);
    const reference = (result as unknown as { references: readonly Record<string, unknown>[] }).references[0];
    // The exact span survives...
    expect(reference.charStart).toBe(4);
    expect(reference.charEnd).toBe(19);
    // ...and the quote is the server's own slice of the authoritative page,
    // never a string the browser supplied.
    expect(reference.selectedText).toBe(PAGE_TEXT.slice(4, 19));
    expect(reference.selectedText).toBe('quick brown fox');
    // Not degraded to page-only, which the write command would reject anyway
    // with charStart/charEnd + selectedText:null -- the HIGH 1 finding.
    expect(reference.selectedText).not.toBeNull();
  });

  it('multiple proven citations become multiple references', async () => {
    const result = await resolveProvenNoteReferences(
      genuine([pageItem, { ...pageItem, pageNumber: 9, label: 'p. 9' }]),
      pageReader,
    );
    expect(result.ok && result.references).toHaveLength(2);
  });

  it('an answer that cited nothing is a SUCCESS with no references', async () => {
    // Unsourced is a valid outcome: the Note still saves.
    const unsourced: StoredAssistantMessage = {
      id: 'msg-1', threadId: 'thread-1', boardId: 'board-1',
      role: 'assistant', content: 'the answer', citations: null,
    };
    expect(await resolveProvenNoteReferences(unsourced, pageReader)).toEqual({ ok: true, references: [] });
  });
});

describe('a message the server did not sign yields NO provenance', () => {
  it('E. a hand-written assistant row with valid-looking citations is refused', async () => {
    // The attack this exists to stop: an authenticated user inserts a row into
    // their own thread citing a page their board can already read. The JSON
    // parses; the authenticity does not exist.
    const handWritten: StoredAssistantMessage = {
      id: 'msg-1', threadId: 'thread-1', boardId: 'board-1',
      role: 'assistant', content: 'I made this up',
      citations: { version: 1, items: [pageItem] },
    };
    expect(await resolveProvenNoteReferences(handWritten, pageReader))
      .toEqual({ ok: false, reason: 'unsigned_or_forged' });
  });

  it('...and a hand-written row that also invents a proof is refused', async () => {
    const forged: StoredAssistantMessage = {
      id: 'msg-1', threadId: 'thread-1', boardId: 'board-1',
      role: 'assistant', content: 'I made this up',
      citations: {
        version: 1,
        items: [pageItem],
        proof: { version: 1, algorithm: 'HMAC-SHA-256', signature: 'AAAA' },
      },
    };
    expect(await resolveProvenNoteReferences(forged, pageReader))
      .toEqual({ ok: false, reason: 'unsigned_or_forged' });
  });

  it('F. a proof copied onto another message id does not validate', async () => {
    const real = genuine([pageItem]);
    const transplanted: StoredAssistantMessage = { ...real, id: 'msg-2' };
    expect(await resolveProvenNoteReferences(transplanted, pageReader))
      .toEqual({ ok: false, reason: 'unsigned_or_forged' });
  });

  it('L. ...nor onto another thread or board', async () => {
    const real = genuine([pageItem]);
    for (const over of [{ threadId: 'thread-2' }, { boardId: 'board-2' }]) {
      expect(await resolveProvenNoteReferences({ ...real, ...over }, pageReader), JSON.stringify(over))
        .toEqual({ ok: false, reason: 'unsigned_or_forged' });
    }
  });

  it('G. changing the answer text after signing invalidates it', async () => {
    const real = genuine([pageItem]);
    expect(await resolveProvenNoteReferences({ ...real, content: 'a different answer' }, pageReader))
      .toEqual({ ok: false, reason: 'unsigned_or_forged' });
  });

  it('H/I/J. editing the cited document, page or offsets invalidates it', async () => {
    const real = genuine([selectionItem]);
    const envelope = real.citations as { version: number; items: unknown[]; proof: unknown };
    const mutations = [
      { ...selectionItem, knowledgeDocumentId: DOC_B },
      { ...selectionItem, pageNumber: 6 },
      { ...selectionItem, charStart: 0 },
      { ...selectionItem, charEnd: 40 },
    ];
    for (const item of mutations) {
      const tampered: StoredAssistantMessage = {
        ...real,
        citations: { ...envelope, items: [item] },
      };
      expect(await resolveProvenNoteReferences(tampered, pageReader), JSON.stringify(item))
        .toEqual({ ok: false, reason: 'unsigned_or_forged' });
    }
  });

  it('I/N. an old unsigned message and an unknown proof version both fail closed', async () => {
    const real = genuine([pageItem]);
    const envelope = real.citations as { version: number; items: unknown[]; proof: Record<string, unknown> };
    // Pre-proof message: citations, no proof at all.
    expect(await resolveProvenNoteReferences(
      { ...real, citations: { version: 1, items: [pageItem] } }, pageReader,
    )).toEqual({ ok: false, reason: 'unsigned_or_forged' });
    // A proof claiming a version this server does not issue.
    expect(await resolveProvenNoteReferences(
      { ...real, citations: { ...envelope, proof: { ...envelope.proof, version: 2 } } }, pageReader,
    )).toEqual({ ok: false, reason: 'unsigned_or_forged' });
  });

  it('a user row is refused before any proof work happens', async () => {
    const userRow = { ...genuine([pageItem]), role: 'user' };
    expect(await resolveProvenNoteReferences(userRow, pageReader))
      .toEqual({ ok: false, reason: 'not_assistant' });
  });

  it('a missing message is refused', async () => {
    expect(await resolveProvenNoteReferences(null, pageReader))
      .toEqual({ ok: false, reason: 'message_not_found' });
  });

  it('J. malformed citation storage fails closed to no references', async () => {
    // The sanitizing parser rejects it before the proof is even consulted, and
    // "no usable citations" is an unsourced save rather than forged provenance.
    for (const bad of [{ version: 99, items: [pageItem] }, 'x', 42, []]) {
      const result = await resolveProvenNoteReferences(
        { id: 'm', threadId: 't', boardId: 'b', role: 'assistant', content: 'c', citations: bad },
        pageReader,
      );
      expect(result, JSON.stringify(bad)).toEqual({ ok: true, references: [] });
    }
  });
});

describe('Q. a proven citation whose source is gone fails closed', () => {
  it('an unreadable page refuses rather than guessing', async () => {
    const unreadable = vi.fn(async () => null);
    const result = await resolveProvenNoteReferences(genuine([selectionItem]), unreadable);
    expect(result).toEqual({ ok: false, reason: 'source_unavailable' });
  });

  it('a span past the end of the real page refuses -- and is NOT widened to the page', async () => {
    const shortPage = vi.fn(async () => 'tiny');
    const result = await resolveProvenNoteReferences(genuine([selectionItem]), shortPage);
    // Silently degrading an exact citation to page-only would misstate what
    // the answer actually used.
    expect(result).toEqual({ ok: false, reason: 'span_unresolvable' });
  });
});
