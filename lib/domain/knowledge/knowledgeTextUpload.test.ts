import { describe, expect, it } from 'vitest';

import { createKnowledgeTextUpload } from './knowledgeTextUpload';
import type { KnowledgeTextChunkInsert, KnowledgeTextUploadDeps } from './knowledgeTextUpload';
import { ok, err } from '../core/result';
import { domainError } from '../core/errors';
import type { BoardId, KnowledgeDocumentId, UserId } from '../core/ids';

/**
 * Ordering and COMPENSATION are what this file exists for. Validation lives in
 * knowledgeTextIngestion and losslessness in knowledgeTextChunking; what can
 * only be checked here is that no failure leaves an inconsistent pair -- and
 * in particular that a document row never survives without its chunks. Such a
 * row appears in the library, reports itself ready, and can never be found or
 * cited: the user sees a source that is silently not there.
 */

const BOARD = 'b1' as unknown as BoardId;
const USER = 'u1' as unknown as UserId;
const DOC = 'd1' as unknown as KnowledgeDocumentId;

const utf8 = (text: string) => new TextEncoder().encode(text);

function deps(over: {
  authorized?: boolean;
  uploadFails?: boolean;
  documentFails?: boolean;
  chunksFail?: boolean;
  readyFails?: boolean;
  deleteFails?: boolean;
  removeFails?: boolean;
} = {}) {
  const calls: string[] = [];
  const written: KnowledgeTextChunkInsert[][] = [];
  const d: KnowledgeTextUploadDeps = {
    authorizer: {
      canMutateBoard: async () => { calls.push('authorize'); return ok(over.authorized !== false); },
    },
    repository: {
      insertTextDocument: async (record) => {
        calls.push('insertDocument');
        return over.documentFails
          ? err(domainError('unavailable', 'insert failed'))
          : ok({ id: record.id, boardId: record.boardId, originalFilename: record.originalFilename,
                 processingStatus: 'uploaded' } as never);
      },
      insertTextChunks: async (chunks) => {
        calls.push('insertChunks');
        written.push([...chunks]);
        return over.chunksFail ? err(domainError('unavailable', 'chunk insert failed')) : ok(undefined);
      },
      markDocumentReady: async (id) => {
        calls.push('markReady');
        return over.readyFails
          ? err(domainError('unavailable', 'promotion failed'))
          : ok({ id, boardId: BOARD, originalFilename: 'notes.txt', processingStatus: 'ready' } as never);
      },
      deleteDocument: async () => {
        calls.push('deleteDocument');
        return over.deleteFails ? err(domainError('unavailable', 'delete failed')) : ok(undefined);
      },
    },
    storage: {
      upload: async () => {
        calls.push('upload');
        return over.uploadFails ? err(domainError('unavailable', 'upload failed')) : ok(undefined);
      },
      remove: async () => {
        calls.push('remove');
        return over.removeFails ? err(domainError('unavailable', 'remove failed')) : ok(undefined);
      },
    },
    hasher: { sha256: async () => 'sha-canonical' },
    ids: { newDocumentId: () => DOC },
  };
  return { d, calls, written };
}

const upload = (text: string, over = {}, filename = 'notes.txt') => {
  const { d, calls, written } = deps(over);
  return createKnowledgeTextUpload(
    d,
    { boardId: BOARD, userId: USER, file: { filename, mimeType: 'text/plain', bytes: utf8(text) } },
    (chunk) => `h:${chunk.length}`,
  ).then((result) => ({ result, calls, written }));
};

const BODY = ['Alpha paragraph.', 'Beta paragraph.', 'Gamma paragraph.'].join('\n\n');

describe('the happy path, in order', () => {
  it('authorizes, uploads, inserts the document, then the chunks', async () => {
    const { result, calls } = await upload(BODY);
    expect(result.ok).toBe(true);
    // READINESS IS LAST. The promotion comes after the chunks exist, so a
    // crash anywhere before it leaves a document that is invisible to search
    // rather than one that claims to be searchable and is empty.
    expect(calls).toEqual(['authorize', 'upload', 'insertDocument', 'insertChunks', 'markReady']);
  });

  it('writes chunks that are contiguous, indexed from zero, and pageless', async () => {
    const { written } = await upload(BODY);
    const chunks = written[0];
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(BODY.length);
    // No page is written at all -- Decision (A), no synthetic pages.
    for (const chunk of chunks) expect('pageStart' in chunk).toBe(false);
    expect(chunks.map((c) => c.text).join('')).toBe(BODY);
  });

  it('normalises line endings before chunking, so offsets describe the canonical text', async () => {
    const { written } = await upload('Alpha.\r\n\r\nBeta.');
    expect(written[0].map((c) => c.text).join('')).toBe('Alpha.\n\nBeta.');
  });

  it('a blank file is accepted and writes NO chunks at all', async () => {
    const { result, calls } = await upload('   \n\n  ');
    expect(result.ok).toBe(true);
    expect(calls).not.toContain('insertChunks');
    // Still promoted: the upload succeeded and there is nothing pending.
    expect(calls).toContain('markReady');
  });
});

describe('nothing is written before the source is known to be sound', () => {
  it('an unauthorized caller never reaches storage', async () => {
    const { result, calls } = await upload(BODY, { authorized: false });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['authorize']);
  });

  it('an undecodable file never reaches storage', async () => {
    const { d, calls } = deps();
    const result = await createKnowledgeTextUpload(
      d,
      { boardId: BOARD, userId: USER, file: { filename: 'notes.txt', mimeType: 'text/plain', bytes: new Uint8Array([0xff, 0xfe]) } },
      () => 'h',
    );
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['authorize']);
  });

  it('a file containing NUL never reaches storage', async () => {
    const { result, calls } = await upload('a\u0000b');
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['authorize']);
  });
});

describe('compensation -- no failure leaves an inconsistent pair', () => {
  it('a failed upload writes no document row', async () => {
    const { result, calls } = await upload(BODY, { uploadFails: true });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['authorize', 'upload']);
  });

  it('a failed document insert removes the uploaded object', async () => {
    const { result, calls } = await upload(BODY, { documentFails: true });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['authorize', 'upload', 'insertDocument', 'remove']);
  });

  it('A FAILED CHUNK WRITE REMOVES THE DOCUMENT ROW AND THE OBJECT', async () => {
    // The state this whole ordering exists to rule out: a ready-looking source
    // in the library that can never be found or cited.
    const { result, calls } = await upload(BODY, { chunksFail: true });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['authorize', 'upload', 'insertDocument', 'insertChunks', 'deleteDocument', 'remove']);
  });

  it('the original error survives compensation rather than being masked', async () => {
    const { result } = await upload(BODY, { chunksFail: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('chunk insert failed');
  });
});

describe('readiness follows persistence', () => {
  it('the document is never promoted when the chunk write fails', async () => {
    const { result, calls } = await upload(BODY, { chunksFail: true });
    expect(result.ok).toBe(false);
    expect(calls).not.toContain('markReady');
  });

  it('a failed promotion does NOT delete a complete document', async () => {
    // The chunks are real and correct. Deleting good work to tidy a flag would
    // destroy the upload; the row stays at 'uploaded', invisible to search and
    // shown as still processing, which is the honest state to be stuck in.
    const { result, calls } = await upload(BODY, { readyFails: true });
    expect(result.ok).toBe(false);
    expect(calls).not.toContain('deleteDocument');
    expect(calls).not.toContain('remove');
  });
});

describe('a compensation that fails is reported, not swallowed', () => {
  it('names the document row it could not remove', async () => {
    const { result } = await upload(BODY, { chunksFail: true, deleteFails: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The ORIGINAL cause is never replaced -- that is what the caller acts on.
    expect(result.error.message).toBe('chunk insert failed');
    expect(result.error.details).toMatchObject({ cleanupFailed: ['document row'] });
  });

  it('names the stored file it could not remove', async () => {
    const { result } = await upload(BODY, { chunksFail: true, removeFails: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ cleanupFailed: ['stored file'] });
  });

  it('names both when neither could be removed', async () => {
    const { result } = await upload(BODY, { chunksFail: true, deleteFails: true, removeFails: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ cleanupFailed: ['document row', 'stored file'] });
  });

  it('says nothing about cleanup when cleanup worked', async () => {
    // Residue nobody knows about is the thing being ruled out. Residue that
    // does not exist must not be announced.
    const { result } = await upload(BODY, { chunksFail: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error.details as Record<string, unknown> | undefined)?.cleanupFailed).toBeUndefined();
  });
});

/**
 * BLANK AND WHITESPACE-ONLY SOURCES -- demonstrated, not described.
 *
 * THREE answers for three situations, and the shape was found by running it
 * rather than by reading the code -- an earlier description of this as a
 * two-way asymmetry was wrong:
 *
 *   - a ZERO-BYTE file is REFUSED, on size, before anything is decoded.
 *   - a whitespace-only .txt is ACCEPTED and produces no chunks. It is
 *     transparently blank: the person who chose it can open it and see that.
 *   - a .docx that extracts to nothing is REFUSED, because it is not
 *     transparent -- a document full of screenshots looks full.
 *
 * "Nothing at all" is trim(), not length === 0, in both the chunker and the
 * refusal: a file containing one newline is as empty as a file containing
 * none, and treating it as content would create a chunk of whitespace that
 * search can match and a citation can point at.
 */
describe('a blank text source is accepted and indexes nothing', () => {
  it('a ZERO-BYTE file is refused outright -- the third case', async () => {
    // Found by running this: the behaviour is three-way, not two-way. A file
    // with no bytes never reaches the chunker at all; Stage 1 refuses it on
    // size before any decoding happens.
    const { result, calls } = await upload('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('The selected file is empty');
    // Refused before any external effect: nothing uploaded, nothing inserted.
    expect(calls).toEqual(['authorize']);
  });

  it.each([
    ['one newline', '\n'],
    ['spaces and tabs and newlines', '  \t\n \r\n  '],
  ])('%s: the document is created, and NO chunks are written', async (_label, text) => {
    const { result, calls, written } = await upload(text);

    expect(result.ok).toBe(true);
    // The row exists and reaches ready...
    expect(calls).toContain('insertDocument');
    expect(calls).toContain('markReady');
    // ...and insertTextChunks is never called at all. Not called with an empty
    // array -- not called, so there is nothing for search to match.
    expect(calls).not.toContain('insertChunks');
    expect(written).toEqual([]);
  });

  it('THE CONSEQUENCE, stated: ready, visible in the library, and unfindable', async () => {
    // This is the honest description of the state, and it is the reason the
    // DOCX path refuses instead. A ready document with no chunks cannot be
    // found by search and cannot be cited; it can only be opened. For a file
    // the user knows is blank that is the truth. For a Word document they
    // believe is full of content it would be a lie, which is why that path
    // does not reach this state.
    const { result, written } = await upload('   \n  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(written).toEqual([]);
  });

  it('a source with ANY real text does write chunks -- the positive control', async () => {
    // Without this, the assertions above would also pass if chunking were
    // broken for every input.
    const { calls, written } = await upload('  \n Alpha. \n ');
    expect(calls).toContain('insertChunks');
    expect(written[0].length).toBeGreaterThan(0);
  });
});
