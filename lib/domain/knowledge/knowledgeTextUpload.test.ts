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
                 processingStatus: 'ready' } as never);
      },
      insertTextChunks: async (chunks) => {
        calls.push('insertChunks');
        written.push([...chunks]);
        return over.chunksFail ? err(domainError('unavailable', 'chunk insert failed')) : ok(undefined);
      },
      deleteDocument: async () => { calls.push('deleteDocument'); return ok(undefined); },
    },
    storage: {
      upload: async () => {
        calls.push('upload');
        return over.uploadFails ? err(domainError('unavailable', 'upload failed')) : ok(undefined);
      },
      remove: async () => { calls.push('remove'); return ok(undefined); },
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
    expect(calls).toEqual(['authorize', 'upload', 'insertDocument', 'insertChunks']);
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
