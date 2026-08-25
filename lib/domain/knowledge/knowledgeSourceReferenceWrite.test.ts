import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SOURCE_REFERENCE_QUOTE_LENGTH,
  createCreateKnowledgeSourceReferenceCommand,
} from './knowledgeSourceReferenceWrite';
import type {
  CreateKnowledgeSourceReferenceInput,
  KnowledgeSourceReferenceInsert,
} from './knowledgeSourceReferenceWrite';
import { asBoardId, asKnowledgeDocumentId, asPostId, asUserId } from '../core/ids';
import { domainError } from '../core/errors';
import { err, ok } from '../core/result';

const BOARD_A = asBoardId('11111111-1111-4111-8111-111111111111');
const BOARD_B = asBoardId('99999999-9999-4999-8999-999999999999');
const USER = asUserId('user-1');
const PADLET = asPostId('22222222-2222-4222-8222-222222222222');
const DOCUMENT = asKnowledgeDocumentId('33333333-3333-4333-8333-333333333333');

function reference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reference-1',
    targetPadletId: PADLET,
    sourceDocumentId: DOCUMENT,
    pageStart: 2,
    pageEnd: 2,
    quoteText: 'a quoted passage',
    quoteHash: 'server-hash',
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

/** The canonical stored page used by the exact-span cases. */
const PAGE_TEXT = 'prefix 😀 alpha\nbeta suffix';

type SetupOverrides = {
  canWrite?: boolean;
  document?: { boardId?: unknown; pageCount?: number | null; processingStatus?: string } | null;
  padlet?: { boardId?: unknown } | null;
  pageText?: string | null;
  pageFails?: boolean;
};

function setup(overrides: SetupOverrides = {}) {
  const authorizer = { canWriteBoard: vi.fn(async () => ok(overrides.canWrite ?? true)) };
  const document = overrides.document === undefined
    ? { boardId: BOARD_A, pageCount: 10, processingStatus: 'ready' }
    : overrides.document;
  const padlet = overrides.padlet === undefined ? { boardId: BOARD_A } : overrides.padlet;
  const pageText = overrides.pageText === undefined ? PAGE_TEXT : overrides.pageText;
  const repository = {
    findSourceDocument: vi.fn(async () => ok(document as never)),
    findTargetPadlet: vi.fn(async () => ok(padlet as never)),
    findPageText: vi.fn(async () => (overrides.pageFails
      ? err(domainError('unavailable', 'Could not read the source page')) as never
      : ok(pageText) as never)),
  };
  const writer = { insertSourceReference: vi.fn(async (_row: KnowledgeSourceReferenceInsert) => ok(reference() as never)) };
  // Distinguishable from any caller-supplied value.
  const hasher = { hashQuoteText: vi.fn((text: string) => `sha256(${text})`) };
  return {
    create: createCreateKnowledgeSourceReferenceCommand({ authorizer, repository, writer, hasher }),
    authorizer, repository, writer, hasher,
  };
}

function input(overrides: Partial<CreateKnowledgeSourceReferenceInput> = {}): CreateKnowledgeSourceReferenceInput {
  return {
    boardId: BOARD_A,
    userId: USER,
    targetPadletId: PADLET,
    sourceDocumentId: DOCUMENT,
    pageStart: 2,
    pageEnd: 2,
    quoteText: 'a quoted passage',
    charStart: null,
    charEnd: null,
    selectedText: null,
    ...overrides,
  };
}

function insertedRow(state: ReturnType<typeof setup>): KnowledgeSourceReferenceInsert {
  return state.writer.insertSourceReference.mock.calls[0][0] as KnowledgeSourceReferenceInsert;
}

describe('P6J-F4-A create knowledge source reference', () => {
  it('lets a board owner or editor create a page-level reference', async () => {
    for (const canWrite of [true, true]) {
      const state = setup({ canWrite });
      const result = await state.create(input());
      expect(result.ok).toBe(true);
      expect(state.authorizer.canWriteBoard).toHaveBeenCalledWith(BOARD_A, USER);
      expect(state.writer.insertSourceReference).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects a caller without board write access before touching the source', async () => {
    const state = setup({ canWrite: false });

    const result = await state.create(input());

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('permission_denied');
    expect(state.repository.findSourceDocument).not.toHaveBeenCalled();
    expect(state.repository.findTargetPadlet).not.toHaveBeenCalled();
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('rejects invalid page ranges and quotes before any dependency runs', async () => {
    const cases: Partial<CreateKnowledgeSourceReferenceInput>[] = [
      { pageStart: 0 },
      { pageStart: -1 },
      { pageStart: 1.5 },
      { pageStart: Number.NaN },
      { pageStart: 5, pageEnd: 4 },
      { pageEnd: 2.5 },
      { quoteText: '' },
      { quoteText: 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 1) },
    ];
    for (const override of cases) {
      const state = setup();
      const result = await state.create(input(override));
      expect(result.ok, JSON.stringify(Object.keys(override))).toBe(false);
      expect(result.ok === false && result.error.code).toBe('validation');
      expect(state.authorizer.canWriteBoard).not.toHaveBeenCalled();
      expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
    }
  });

  it('accepts a quote exactly at the maximum length', async () => {
    const state = setup();
    const result = await state.create(input({ quoteText: 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH) }));
    expect(result.ok).toBe(true);
  });

  it('rejects a missing, unready, mismatched or too-short source document', async () => {
    const cases: Array<[string, SetupOverrides['document'], string]> = [
      ['missing', null, 'not_found'],
      ['other board', { boardId: BOARD_B, pageCount: 10, processingStatus: 'ready' }, 'validation'],
      ['processing', { boardId: BOARD_A, pageCount: 10, processingStatus: 'processing' }, 'validation'],
      ['failed', { boardId: BOARD_A, pageCount: 10, processingStatus: 'failed' }, 'validation'],
      ['unknown page count', { boardId: BOARD_A, pageCount: null, processingStatus: 'ready' }, 'validation'],
      ['page beyond document', { boardId: BOARD_A, pageCount: 1, processingStatus: 'ready' }, 'validation'],
    ];
    for (const [label, document, code] of cases) {
      const state = setup({ document });
      const result = await state.create(input({ pageStart: 2, pageEnd: 2 }));
      expect(result.ok, label).toBe(false);
      expect(result.ok === false && result.error.code, label).toBe(code);
      expect(state.writer.insertSourceReference, label).not.toHaveBeenCalled();
    }
  });

  it('rejects a missing or cross-board target post', async () => {
    for (const [padlet, code] of [[null, 'not_found'], [{ boardId: BOARD_B }, 'validation']] as const) {
      const state = setup({ padlet });
      const result = await state.create(input());
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe(code);
      expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
    }
  });

  it('scopes both lookups to the requested board', async () => {
    const state = setup();

    await state.create(input());

    expect(state.repository.findSourceDocument).toHaveBeenCalledWith(DOCUMENT, BOARD_A);
    expect(state.repository.findTargetPadlet).toHaveBeenCalledWith(PADLET, BOARD_A);
  });

  it('derives the quote hash from the stored snapshot and never from the caller', async () => {
    const state = setup();
    // Structurally extended: a client could put these on the wire.
    // Structurally extended: a client could put these on the wire. Offsets are
    // omitted here because from B4-B2A they select the exact-span mode, which
    // has its own suite below; hash and locator remain unreachable in both.
    const hostile = { ...input({ quoteText: '  Padded\r\nQuote  ' }), quoteHash: 'attacker-value', locator: { coordinateSystem: 'pdf' } };

    await state.create(hostile as CreateKnowledgeSourceReferenceInput);

    const row = insertedRow(state);
    expect(state.hasher.hashQuoteText).toHaveBeenCalledWith('  Padded\r\nQuote  ');
    expect(row.quoteHash).toBe('sha256(  Padded\r\nQuote  )');
    expect(row.quoteHash).not.toBe('attacker-value');
    // Not trimmed, not normalised: the snapshot must match its hash byte for byte.
    expect(row.quoteText).toBe('  Padded\r\nQuote  ');
    expect(JSON.stringify(row)).not.toContain('attacker-value');
  });

  it('writes null offsets and no locator for a page-only request', async () => {
    const state = setup();
    const hostile = { ...input(), locator: { coordinateSystem: 'pdf', sourceElementId: 'e1' } };

    await state.create(hostile as CreateKnowledgeSourceReferenceInput);

    const row = insertedRow(state);
    // The insert payload carries offsets from B4-B2A, but still has no field
    // for a locator, so highlight geometry remains unwritable.
    expect(Object.keys(row).sort()).toEqual([
      'charEnd', 'charStart', 'pageEnd', 'pageStart', 'quoteHash', 'quoteText',
      'sourceDocumentId', 'targetPadletId',
    ]);
    expect(row.charStart).toBeNull();
    expect(row.charEnd).toBeNull();
    expect(JSON.stringify(row)).not.toContain('coordinateSystem');
    expect(JSON.stringify(row)).not.toContain('sourceElementId');
  });

  it('keeps a null quote unhashed', async () => {
    const state = setup();

    await state.create(input({ quoteText: null }));

    expect(state.hasher.hashQuoteText).not.toHaveBeenCalled();
    expect(insertedRow(state).quoteText).toBeNull();
    expect(insertedRow(state).quoteHash).toBeNull();
  });

  it('returns the written reference in the existing domain shape', async () => {
    const state = setup();

    const result = await state.create(input());

    expect(result).toEqual({ ok: true, value: reference() });
  });

  it('creates a distinct reference per call without deduplicating identical citations', async () => {
    const state = setup();
    state.writer.insertSourceReference
      .mockResolvedValueOnce(ok(reference({ id: 'reference-1' }) as never))
      .mockResolvedValueOnce(ok(reference({ id: 'reference-2' }) as never));

    const first = await state.create(input());
    const second = await state.create(input());

    expect(state.writer.insertSourceReference).toHaveBeenCalledTimes(2);
    expect(state.writer.insertSourceReference.mock.calls[0][0]).toEqual(state.writer.insertSourceReference.mock.calls[1][0]);
    expect(first.ok && first.value.id).toBe('reference-1');
    expect(second.ok && second.value.id).toBe('reference-2');
  });
});

// ============================================================================
// P6J-F6-B4-B2A -- exact spans, validated against the canonical stored page
// ============================================================================

/** 'alpha' sits at UTF-16 [10,15); the emoji before it occupies two units. */
const ALPHA = { charStart: 10, charEnd: 15, selectedText: 'alpha', quoteText: null } as const;

describe('P6J-F6-B4-B2A exact source spans', () => {
  it('A: a page-only request is unchanged and reads no page', async () => {
    const state = setup();

    const result = await state.create(input());

    expect(result.ok).toBe(true);
    expect(state.repository.findPageText).not.toHaveBeenCalled();
    expect(state.hasher.hashQuoteText).toHaveBeenCalledWith('a quoted passage');
    expect(insertedRow(state)).toMatchObject({
      quoteText: 'a quoted passage',
      quoteHash: 'sha256(a quoted passage)',
      charStart: null,
      charEnd: null,
    });
  });

  it('A: a page-only request with a null quote still reads no page', async () => {
    const state = setup();

    expect((await state.create(input({ quoteText: null }))).ok).toBe(true);
    expect(state.repository.findPageText).not.toHaveBeenCalled();
    expect(insertedRow(state)).toMatchObject({ quoteText: null, quoteHash: null, charStart: null, charEnd: null });
  });

  it('B/C: a half-specified offset pair is refused before any lookup', async () => {
    for (const half of [{ charStart: 10, charEnd: null }, { charStart: null, charEnd: 15 }]) {
      const state = setup();
      const result = await state.create(input({ ...half, quoteText: null, selectedText: 'alpha' }));

      expect(result.ok, JSON.stringify(half)).toBe(false);
      expect(result.ok === false && result.error.code).toBe('validation');
      expect(state.authorizer.canWriteBoard).not.toHaveBeenCalled();
      expect(state.repository.findPageText).not.toHaveBeenCalled();
      expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
    }
  });

  it('D: an exact span may not cross pages', async () => {
    const state = setup();

    const result = await state.create(input({ ...ALPHA, pageStart: 2, pageEnd: 3 }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('validation');
    expect(state.repository.findPageText).not.toHaveBeenCalled();
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('E: an exact span may not also carry a client quote', async () => {
    const state = setup();

    const result = await state.create(input({ ...ALPHA, quoteText: 'alpha' }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('validation');
    expect(state.repository.findPageText).not.toHaveBeenCalled();
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('F/G: structural coordinate and evidence rules run before any dependency', async () => {
    const cases: Partial<CreateKnowledgeSourceReferenceInput>[] = [
      { ...ALPHA, selectedText: null },
      { ...ALPHA, selectedText: '' },
      { ...ALPHA, charStart: -1 },
      { ...ALPHA, charStart: 10.5 },
      { ...ALPHA, charEnd: Number.NaN },
      { ...ALPHA, charEnd: Number.POSITIVE_INFINITY },
      { ...ALPHA, charStart: 15, charEnd: 10 },
      { ...ALPHA, charStart: 10, charEnd: 10 },
      { ...ALPHA, selectedText: 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 1) },
    ];
    for (const override of cases) {
      const state = setup();
      const result = await state.create(input(override));

      expect(result.ok, JSON.stringify({ ...override, selectedText: undefined })).toBe(false);
      expect(result.ok === false && result.error.code).toBe('validation');
      expect(state.authorizer.canWriteBoard).not.toHaveBeenCalled();
      expect(state.repository.findPageText).not.toHaveBeenCalled();
      expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
    }
  });

  it('H: the canonical page is read only after board, document and target checks', async () => {
    const state = setup();

    expect((await state.create(input(ALPHA))).ok).toBe(true);

    const order = (mock: { mock: { invocationCallOrder: number[] } }) => mock.mock.invocationCallOrder[0];
    expect(order(state.authorizer.canWriteBoard)).toBeLessThan(order(state.repository.findSourceDocument));
    expect(order(state.repository.findSourceDocument)).toBeLessThan(order(state.repository.findTargetPadlet));
    expect(order(state.repository.findTargetPadlet)).toBeLessThan(order(state.repository.findPageText));
    expect(order(state.repository.findPageText)).toBeLessThan(order(state.writer.insertSourceReference));
  });

  it('I: stores the SERVER slice, its server hash and the offsets', async () => {
    const state = setup();

    const result = await state.create(input(ALPHA));

    expect(result.ok).toBe(true);
    expect(state.repository.findPageText).toHaveBeenCalledWith(DOCUMENT, 2);
    expect(insertedRow(state)).toEqual({
      targetPadletId: PADLET,
      sourceDocumentId: DOCUMENT,
      pageStart: 2,
      pageEnd: 2,
      quoteText: 'alpha',
      quoteHash: 'sha256(alpha)',
      charStart: 10,
      charEnd: 15,
    });
    // The canonical slice is what was hashed -- never the client's string.
    expect(state.hasher.hashQuoteText).toHaveBeenCalledTimes(1);
    expect(state.hasher.hashQuoteText).toHaveBeenCalledWith(PAGE_TEXT.slice(10, 15));
  });

  it('I: offsets are UTF-16 code units, so a surrogate pair spans two', async () => {
    const state = setup();

    const result = await state.create(input({ charStart: 7, charEnd: 9, selectedText: '😀', quoteText: null }));

    expect(result.ok).toBe(true);
    expect(insertedRow(state)).toMatchObject({ quoteText: '😀', charStart: 7, charEnd: 9 });
  });

  it('I: preserves whitespace and newlines exactly, with no trimming', async () => {
    const state = setup();
    // '\nbeta' -- leading newline retained on both sides of the comparison.
    const start = PAGE_TEXT.indexOf('\nbeta');
    const selectedText = PAGE_TEXT.slice(start, start + 5);

    const result = await state.create(input({ charStart: start, charEnd: start + 5, selectedText, quoteText: null }));

    expect(result.ok).toBe(true);
    expect(insertedRow(state).quoteText).toBe('\nbeta');
  });

  it('J: refuses when the client selection disagrees with the stored page', async () => {
    const state = setup();

    // Correct coordinates, wrong claim about what they contain.
    const result = await state.create(input({ ...ALPHA, selectedText: 'ALPHA' }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('validation');
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
    expect(state.hasher.hashQuoteText).not.toHaveBeenCalled();
  });

  it('J: a trailing-space difference is a mismatch, not a near-enough match', async () => {
    const state = setup();

    const result = await state.create(input({ ...ALPHA, selectedText: 'alpha ' }));

    expect(result.ok).toBe(false);
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('K: refuses offsets past the end of the canonical page', async () => {
    const state = setup();

    const result = await state.create(input({
      charStart: PAGE_TEXT.length - 1, charEnd: PAGE_TEXT.length + 1, selectedText: 'x', quoteText: null,
    }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('validation');
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('L: refuses a derived quote longer than the domain cap', async () => {
    const long = 'y'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 10);
    const state = setup({ pageText: long });

    const result = await state.create(input({
      charStart: 0, charEnd: long.length, selectedText: long, quoteText: null,
    }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('validation');
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('M: fails closed when the canonical page is missing', async () => {
    const state = setup({ pageText: null });

    const result = await state.create(input(ALPHA));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('not_found');
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('N: propagates a page read failure without inserting', async () => {
    const state = setup({ pageFails: true });

    const result = await state.create(input(ALPHA));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('unavailable');
    expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
  });

  it('O/P: authority and same-board failures never reach the page read', async () => {
    const cases: SetupOverrides[] = [
      { canWrite: false },
      { document: null },
      { document: { boardId: BOARD_B, pageCount: 10, processingStatus: 'ready' } },
      { document: { boardId: BOARD_A, pageCount: 10, processingStatus: 'processing' } },
      { document: { boardId: BOARD_A, pageCount: null, processingStatus: 'ready' } },
      { padlet: null },
      { padlet: { boardId: BOARD_B } },
    ];
    for (const override of cases) {
      const state = setup(override);
      const result = await state.create(input(ALPHA));

      expect(result.ok, JSON.stringify(override)).toBe(false);
      expect(state.repository.findPageText, JSON.stringify(override)).not.toHaveBeenCalled();
      expect(state.writer.insertSourceReference).not.toHaveBeenCalled();
    }
  });

  it('P: a page range beyond the document is refused before the page read', async () => {
    const state = setup({ document: { boardId: BOARD_A, pageCount: 1, processingStatus: 'ready' } });

    const result = await state.create(input(ALPHA));

    expect(result.ok).toBe(false);
    expect(state.repository.findPageText).not.toHaveBeenCalled();
  });

  it('Q/R: the client selection never reaches the insert, and cannot carry a hash', async () => {
    const state = setup();

    await state.create(input(ALPHA));

    const row = insertedRow(state) as unknown as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([
      'charEnd', 'charStart', 'pageEnd', 'pageStart', 'quoteHash', 'quoteText',
      'sourceDocumentId', 'targetPadletId',
    ]);
    expect(row).not.toHaveProperty('selectedText');
    expect(row).not.toHaveProperty('locator');
    // The stored hash is the hasher's output over the canonical slice, so no
    // caller-supplied value could have become it.
    expect(row.quoteHash).toBe('sha256(alpha)');
  });

  it('Q/R: the exact-span insert is fed the server slice at the source, not the client string', () => {
    // Behaviour alone cannot prove this: the equality check above guarantees
    // selectedText and canonicalQuote hold the SAME string by the time the
    // insert runs, so swapping them is invisible at runtime. The protection
    // that matters is which expression the payload is built from, and that is
    // only observable in the source. Line comments only -- the block-comment
    // strip has destroyed live code in this repository before.
    const source = fs
      .readFileSync(path.join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceReferenceWrite.ts'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');

    const start = source.indexOf('quoteText: canonicalQuote,');
    expect(start, 'the exact-span insert must store the canonical slice').toBeGreaterThanOrEqual(0);
    const insert = source.slice(start, start + 260);
    expect(insert).toContain('quoteHash: dependencies.hasher.hashQuoteText(canonicalQuote)');
    expect(insert, 'the client string must never reach the insert payload')
      .not.toContain('input.selectedText');
    // And the canonical slice is taken from the stored page, by the offsets.
    expect(source).toContain('const canonicalQuote = pageText.slice(mode.charStart, mode.charEnd);');
    // selectedText is used exactly once in the command: the comparison.
    expect((source.match(/input\.selectedText !== canonicalQuote/g) ?? []).length).toBe(1);
  });
});
