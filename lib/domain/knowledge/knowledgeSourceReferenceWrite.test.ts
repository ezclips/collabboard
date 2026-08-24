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
import { ok } from '../core/result';

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

type SetupOverrides = {
  canWrite?: boolean;
  document?: { boardId?: unknown; pageCount?: number | null; processingStatus?: string } | null;
  padlet?: { boardId?: unknown } | null;
};

function setup(overrides: SetupOverrides = {}) {
  const authorizer = { canWriteBoard: vi.fn(async () => ok(overrides.canWrite ?? true)) };
  const document = overrides.document === undefined
    ? { boardId: BOARD_A, pageCount: 10, processingStatus: 'ready' }
    : overrides.document;
  const padlet = overrides.padlet === undefined ? { boardId: BOARD_A } : overrides.padlet;
  const repository = {
    findSourceDocument: vi.fn(async () => ok(document as never)),
    findTargetPadlet: vi.fn(async () => ok(padlet as never)),
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
    const hostile = { ...input({ quoteText: '  Padded\r\nQuote  ' }), quoteHash: 'attacker-value', charStart: 5, charEnd: 9, locator: { coordinateSystem: 'pdf' } };

    await state.create(hostile as CreateKnowledgeSourceReferenceInput);

    const row = insertedRow(state);
    expect(state.hasher.hashQuoteText).toHaveBeenCalledWith('  Padded\r\nQuote  ');
    expect(row.quoteHash).toBe('sha256(  Padded\r\nQuote  )');
    expect(row.quoteHash).not.toBe('attacker-value');
    // Not trimmed, not normalised: the snapshot must match its hash byte for byte.
    expect(row.quoteText).toBe('  Padded\r\nQuote  ');
    expect(JSON.stringify(row)).not.toContain('attacker-value');
  });

  it('writes no char offsets or locator, even when the caller supplies them', async () => {
    const state = setup();
    const hostile = { ...input(), charStart: 5, charEnd: 9, locator: { coordinateSystem: 'pdf', sourceElementId: 'e1' } };

    await state.create(hostile as CreateKnowledgeSourceReferenceInput);

    const row = insertedRow(state);
    // The insert payload has no field to carry advanced provenance at all.
    expect(Object.keys(row).sort()).toEqual([
      'pageEnd', 'pageStart', 'quoteHash', 'quoteText', 'sourceDocumentId', 'targetPadletId',
    ]);
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
