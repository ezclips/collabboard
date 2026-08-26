import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { asBoardId, asKnowledgeDocumentId, asUserId } from '../../domain/core/ids';
import {
  cleanupKnowledgeArtifacts,
  deleteKnowledgeBoard,
  deleteKnowledgeDocument,
} from '../../domain/knowledge/knowledgeDeletion';
import { createKnowledgePdfUpload } from '../../domain/knowledge/knowledgeIngestion';
import {
  KNOWLEDGE_STORAGE_BUCKET,
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeStorageGateway,
} from './knowledgeIngestionAdapters';
import {
  SupabaseBoardDeletionAuthorizer,
  SupabaseKnowledgeDeletionRepository,
} from './knowledgeDeletionAdapters';

const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack
  ? JSON.parse(fs.readFileSync(envPath, 'utf8'))
  : {};

const BOARD_A = asBoardId(env.P4_BOARD_A || '00000000-0000-0000-0000-000000002011');
const BOARD_B = asBoardId(env.P4_BOARD_B || '00000000-0000-0000-0000-000000002012');
const OWNER = asUserId(env.P4_OWNER || '00000000-0000-0000-0000-000000001011');
const EDITOR = asUserId(env.P4_EDITOR || '00000000-0000-0000-0000-000000001012');
const VIEWER = asUserId(env.P4_VIEWER || '00000000-0000-0000-0000-000000001013');
const UNRELATED = asUserId(env.P4_UNRELATED || '00000000-0000-0000-0000-000000001014');

function pdf(label: string): Uint8Array {
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${label}\n%%EOF`, 'utf8'));
}

describe.skipIf(!hasLocalStack)('P4D deletion -- local Postgres and Storage integration', () => {
  let client: SupabaseClient;
  let authorizer: SupabaseKnowledgeBoardAuthorizer;
  let repository: SupabaseKnowledgeDeletionRepository;
  let storage: SupabaseKnowledgeStorageGateway;
  let boardAuthorizer: SupabaseBoardDeletionAuthorizer;

  beforeAll(() => {
    const hostname = new URL(env.P4_SUPABASE_URL).hostname;
    expect(['127.0.0.1', 'localhost']).toContain(hostname);
    client = createClient(env.P4_SUPABASE_URL, env.P4_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    authorizer = new SupabaseKnowledgeBoardAuthorizer(client as never);
    repository = new SupabaseKnowledgeDeletionRepository(client as never);
    storage = new SupabaseKnowledgeStorageGateway(client as never);
    boardAuthorizer = new SupabaseBoardDeletionAuthorizer(client as never);
  });

  async function uploadDocument(boardId: typeof BOARD_A, label: string) {
    const result = await createKnowledgePdfUpload(
      {
        authorizer,
        repository: {
          insertDocument: async (record) => {
            const { data, error } = await client
              .from('knowledge_documents')
              .insert({
                id: record.id,
                board_id: record.boardId,
                created_by: record.createdBy,
                kind: 'pdf',
                original_filename: record.originalFilename,
                mime_type: record.mimeType,
                file_size_bytes: record.fileSizeBytes,
                storage_path: record.storagePath,
                content_sha256: record.contentSha256,
              })
              .select('*')
              .single();
            if (error || !data) {
              return {
                ok: false as const,
                error: { code: 'unavailable' as const, message: error?.message || 'insert failed' },
              };
            }
            return {
              ok: true as const,
              value: {
                id: data.id,
                boardId: data.board_id,
                createdBy: data.created_by,
                kind: 'pdf' as const,
                originalFilename: data.original_filename,
                mimeType: data.mime_type,
                fileSizeBytes: Number(data.file_size_bytes),
                storagePath: data.storage_path,
                contentSha256: data.content_sha256,
                pageCount: data.page_count,
                processingStatus: data.processing_status,
                processingError: data.processing_error,
                parserName: data.parser_name,
                parserVersion: data.parser_version,
                parserOptionsHash: data.parser_options_hash,
                rawArtifactPath: data.raw_artifact_path,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
              },
            };
          },
        },
        storage,
        hasher: new NodeKnowledgeContentHasher(),
        ids: new RandomKnowledgeDocumentIdFactory(),
      },
      {
        boardId,
        userId: OWNER,
        file: { filename: `${label}.pdf`, mimeType: 'application/pdf', bytes: pdf(label) },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }

  async function addDerivedRows(documentId: string, padletId: string, rawPath?: string) {
    if (rawPath) {
      const uploaded = await client.storage
        .from(KNOWLEDGE_STORAGE_BUCKET)
        .upload(rawPath, pdf('raw artifact'), { contentType: 'application/json' });
      expect(uploaded.error).toBeNull();
      const updated = await client
        .from('knowledge_documents')
        .update({ raw_artifact_path: rawPath })
        .eq('id', documentId);
      expect(updated.error).toBeNull();
    }

    expect(
      (
        await client.from('knowledge_pages').insert({
          document_id: documentId,
          page_number: 1,
          text: 'page',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await client.from('knowledge_chunks').insert({
          document_id: documentId,
          page_start: 1,
          page_end: 1,
          text: 'chunk',
          text_hash: 'b'.repeat(64),
          chunk_index: 0,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await client.from('source_references').insert({
          target_padlet_id: padletId,
          source_document_id: documentId,
          page_start: 1,
          page_end: 1,
          quote_text: 'page',
        })
      ).error,
    ).toBeNull();
  }

  async function objectExists(pathname: string): Promise<boolean> {
    const read = await client.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(pathname);
    return !read.error;
  }

  it('owner deletes a document and all DB cascades while preserving its Padlet', async () => {
    const document = await uploadDocument(BOARD_A, 'single-delete');
    const rawPath = `knowledge/${BOARD_A}/raw-single.json`;
    await addDerivedRows(document.id, '00000000-0000-0000-0000-000000003011', rawPath);

    const result = await deleteKnowledgeDocument(
      { authorizer, repository, storage },
      { documentId: asKnowledgeDocumentId(document.id), userId: OWNER },
    );

    expect(result.ok).toBe(true);
    expect((await client.from('knowledge_documents').select('id').eq('id', document.id)).data).toEqual([]);
    expect((await client.from('knowledge_pages').select('id').eq('document_id', document.id)).data).toEqual([]);
    expect((await client.from('knowledge_chunks').select('id').eq('document_id', document.id)).data).toEqual([]);
    expect((await client.from('source_references').select('id').eq('source_document_id', document.id)).data).toEqual([]);
    expect((await client.from('padlets').select('id').eq('id', '00000000-0000-0000-0000-000000003011')).data).toHaveLength(1);
    expect(await objectExists(document.storagePath)).toBe(false);
    expect(await objectExists(rawPath)).toBe(false);
  });

  it('blocks viewer and unrelated users before DB deletion', async () => {
    const viewerDocument = await uploadDocument(BOARD_A, 'viewer-blocked');
    const unrelatedDocument = await uploadDocument(BOARD_A, 'unrelated-blocked');

    for (const userId of [VIEWER, UNRELATED]) {
      const documentId = userId === VIEWER ? viewerDocument.id : unrelatedDocument.id;
      const result = await deleteKnowledgeDocument(
        { authorizer, repository, storage },
        { documentId: asKnowledgeDocumentId(documentId), userId },
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('permission_denied');
    }
  });

  it('allows an editor to delete a document', async () => {
    const document = await uploadDocument(BOARD_A, 'editor-delete');
    const result = await deleteKnowledgeDocument(
      { authorizer, repository, storage },
      { documentId: asKnowledgeDocumentId(document.id), userId: EDITOR },
    );
    expect(result.ok).toBe(true);
  });

  it('deletes a board through the hard-delete service and cleans two documents', async () => {
    const first = await uploadDocument(BOARD_B, 'board-delete-a');
    const second = await uploadDocument(BOARD_B, 'board-delete-b');
    const rawPath = `knowledge/${BOARD_B}/raw-board-delete.json`;
    await addDerivedRows(first.id, '00000000-0000-0000-0000-000000003012');
    await addDerivedRows(second.id, '00000000-0000-0000-0000-000000003012', rawPath);

    const result = await deleteKnowledgeBoard(
      { authorizer: boardAuthorizer, repository, storage },
      { boardId: BOARD_B, userId: OWNER },
    );

    expect(result.ok).toBe(true);
    expect((await client.from('boards').select('id').eq('id', BOARD_B)).data).toEqual([]);
    expect((await client.from('knowledge_documents').select('id').eq('id', first.id)).data).toEqual([]);
    expect((await client.from('knowledge_documents').select('id').eq('id', second.id)).data).toEqual([]);
    expect((await client.from('knowledge_pages').select('id').in('document_id', [first.id, second.id])).data).toEqual([]);
    expect((await client.from('knowledge_chunks').select('id').in('document_id', [first.id, second.id])).data).toEqual([]);
    expect((await client.from('source_references').select('id').in('source_document_id', [first.id, second.id])).data).toEqual([]);
    expect(await objectExists(first.storagePath)).toBe(false);
    expect(await objectExists(second.storagePath)).toBe(false);
    expect(await objectExists(rawPath)).toBe(false);
  });
  /**
   * P6J-F9-A1a. Most attempted paths are absent: page derivatives are optional
   * and none are generated yet, so cleanup routinely asks Storage to remove
   * objects that were never written. That must be harmless -- proven here
   * against the real local Storage API rather than assumed.
   */
  it('removes a batch mixing one real object with never-written paths', async () => {
    const existing = `knowledge/${BOARD_A}/missing-mix/original.pdf`;
    const uploaded = await client.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .upload(existing, pdf('missing-mix'), { contentType: 'application/pdf' });
    expect(uploaded.error).toBeNull();

    const result = await storage.removeMany([
      existing,
      `knowledge/${BOARD_A}/missing-mix/pages/1.webp`,
      `knowledge/${BOARD_A}/missing-mix/pages/2.webp`,
    ]);

    expect(result.ok).toBe(true);
    expect(await objectExists(existing)).toBe(false);
  });

  it('reports complete cleanup when no derivative was ever generated', async () => {
    const document = await uploadDocument(BOARD_A, 'missing-derivatives');
    const documentId = asKnowledgeDocumentId(document.id);

    const cleanup = await cleanupKnowledgeArtifacts(storage, [
      { boardId: BOARD_A, documentId, storagePath: document.storagePath, rawArtifactPath: null, pageCount: 3 },
    ]);

    // The real PDF plus three derivative paths that were never written.
    expect(cleanup.attemptedPaths).toHaveLength(4);
    expect(cleanup.status).toBe('complete');
    expect(cleanup.failedPaths).toEqual([]);
    expect(await objectExists(document.storagePath)).toBe(false);

    // A batch of nothing but absent paths is equally harmless.
    const allMissing = await cleanupKnowledgeArtifacts(storage, [
      {
        boardId: BOARD_A,
        documentId,
        storagePath: `knowledge/${BOARD_A}/${document.id}/never-written.pdf`,
        rawArtifactPath: null,
        pageCount: 2,
      },
    ]);
    expect(allMissing).toMatchObject({ status: 'complete', failedPaths: [] });

    await client.from('knowledge_documents').delete().eq('id', document.id);
  });
});
