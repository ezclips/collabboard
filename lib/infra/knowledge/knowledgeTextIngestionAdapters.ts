// The Supabase side of ingesting a text source.
//
// A SIBLING OF SupabaseKnowledgeIngestionRepository, and the two differences
// are both consequences of there being no extraction worker on this path:
//
//   1. processing_status is written as 'ready', not left to the schema default
//      of 'uploaded'. Nothing will ever claim a text document and promote it,
//      so a defaulted row would sit in the library reporting itself as being
//      processed, forever, and would be excluded from every search that filters
//      on ready.
//   2. this repository writes CHUNKS. The PDF repository writes a document row
//      and stops, because its chunks arrive later from the worker.
//
// Everything else -- the bucket, the hasher, the id factory, the board
// authorizer -- is reused from knowledgeIngestionAdapters rather than
// duplicated, because none of it varies by source kind.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { KnowledgeDocumentId } from '../../domain/core/ids';
import type { KnowledgeDocument } from '../../domain/knowledge/knowledgePersistence';
import { buildKnowledgeTextSourceLocator } from '../../domain/knowledge/knowledgeTextSourceLocator';
import type {
  KnowledgeTextChunkInsert,
  KnowledgeTextDocumentInsert,
  KnowledgeTextRepository,
} from '../../domain/knowledge/knowledgeTextUpload';
import { mapKnowledgeDocumentRow } from './knowledgeIngestionAdapters';
import type { KnowledgeDocumentRow } from './knowledgeIngestionAdapters';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

/** The same row the PDF repository maps -- one shape, not a parallel guess. */
type DocumentRowLike = KnowledgeDocumentRow;

/** The insert builder, which is both awaitable and refinable -- supabase-js's shape. */
export interface KnowledgeTextInsertBuilder
  extends PromiseLike<{ error: SupabaseErrorLike | null }> {
  select(columns: string): {
    single(): Promise<{ data: DocumentRowLike | null; error: SupabaseErrorLike | null }>;
  };
}

export interface KnowledgeTextSupabaseClient {
  from(table: 'knowledge_documents' | 'knowledge_chunks'): {
    insert(
      payload: Record<string, unknown> | readonly Record<string, unknown>[],
    ): KnowledgeTextInsertBuilder;
    update(payload: Record<string, unknown>): {
      eq(column: string, value: string): KnowledgeTextInsertBuilder;
    };
    delete(): {
      eq(column: string, value: string): PromiseLike<{ error: SupabaseErrorLike | null }>;
    };
  };
}

/**
 * READINESS FOLLOWS PERSISTENCE.
 *
 * A text source is created NOT ready and is promoted only once its chunks are
 * written. Writing 'ready' on the insert was the obvious thing and was wrong:
 * between that row and the chunk write there is a window -- a crash, a lost
 * connection, a killed process -- in which a document exists that reports
 * itself searchable and contains nothing, and compensation cannot run because
 * the process that would have run it is gone.
 *
 * Reversing the order reverses which state survives a crash. A document stuck
 * at 'uploaded' is invisible to search and shows in the library as still
 * processing: wrong, but wrong in the direction that tells the truth about
 * what can be found in it. A 'ready' document with no chunks is a source that
 * claims to be searchable and silently is not.
 *
 * ONE TRANSACTION WOULD BE BETTER and is the end state: an RPC that inserts
 * the document, its chunks and its readiness together, so the window does not
 * exist rather than being survivable. That needs a migration, which is not
 * this commit's to apply.
 */
export const KNOWLEDGE_TEXT_INITIAL_STATUS = 'uploaded';
export const KNOWLEDGE_TEXT_READY_STATUS = 'ready';

export class SupabaseKnowledgeTextRepository implements KnowledgeTextRepository {
  constructor(private readonly client: KnowledgeTextSupabaseClient) {}

  async insertTextDocument(
    record: KnowledgeTextDocumentInsert,
  ): Promise<Result<KnowledgeDocument, DomainError>> {
    const { data, error } = await this.client
      .from('knowledge_documents')
      .insert({
        id: record.id,
        board_id: record.boardId,
        created_by: record.createdBy,
        kind: record.kind,
        original_filename: record.originalFilename,
        mime_type: record.mimeType,
        file_size_bytes: record.fileSizeBytes,
        storage_path: record.storagePath,
        content_sha256: record.contentSha256,
        // NOT ready yet. See KNOWLEDGE_TEXT_INITIAL_STATUS: this row becomes
        // searchable only once the chunks that make it searchable exist.
        processing_status: KNOWLEDGE_TEXT_INITIAL_STATUS,
        // A text source has no pages. NOT zero, which would claim a page count
        // was measured and found to be none.
        page_count: null,
      })
      .select('*')
      .single();

    if (error) {
      return err(domainError('unavailable', 'Could not save the document', { cause: error }));
    }
    if (!data) {
      return err(domainError('unavailable', 'Could not save the document'));
    }

    return ok(mapKnowledgeDocumentRow(data));
  }

  async insertTextChunks(
    chunks: readonly KnowledgeTextChunkInsert[],
  ): Promise<Result<void, DomainError>> {
    if (chunks.length === 0) return ok(undefined);

    // ONE statement for the whole document, not a loop. A per-chunk insert
    // would make partial success a routine outcome, and a document half of
    // whose text can be found is the state the caller's compensation exists to
    // rule out -- it cannot compensate for what it was not told failed.
    const { error } = await this.client.from('knowledge_chunks').insert(
      chunks.map((chunk) => ({
        document_id: chunk.documentId,
        chunk_index: chunk.chunkIndex,
        text: chunk.text,
        text_hash: chunk.textHash,
        // PAGELESS BY CONSTRUCTION. Explicitly null rather than omitted, so the
        // row states that this source has no pages instead of relying on a
        // column default to mean the same thing.
        page_start: null,
        page_end: null,
        char_start: chunk.charStart,
        char_end: chunk.charEnd,
        // THE SAME RANGE AGAIN, deliberately. The columns above are the truth;
        // this is how the truth reaches the two consumers, which read the
        // search function rather than the table -- and that function's
        // RETURNS TABLE carries source_locators but not the character columns.
        // See knowledgeTextSourceLocator for why it cannot simply be widened.
        source_locators: [buildKnowledgeTextSourceLocator(chunk.charStart, chunk.charEnd)],
      })),
    );

    if (error) {
      return err(domainError('unavailable', 'Could not save the indexed text', { cause: error }));
    }
    return ok(undefined);
  }

  async markDocumentReady(
    documentId: KnowledgeDocumentId,
  ): Promise<Result<KnowledgeDocument, DomainError>> {
    const { data, error } = await this.client
      .from('knowledge_documents')
      .update({ processing_status: KNOWLEDGE_TEXT_READY_STATUS })
      .eq('id', documentId)
      .select('*')
      .single();

    if (error) {
      return err(domainError('unavailable', 'Could not finish indexing the document', { cause: error }));
    }
    if (!data) {
      return err(domainError('unavailable', 'Could not finish indexing the document'));
    }
    return ok(mapKnowledgeDocumentRow(data));
  }

  async deleteDocument(documentId: KnowledgeDocumentId): Promise<Result<void, DomainError>> {
    // Chunks go with it through ON DELETE CASCADE, so this one statement is
    // the whole compensation for a failed chunk write.
    const { error } = await this.client
      .from('knowledge_documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      return err(domainError('unavailable', 'Could not remove the document', { cause: error }));
    }
    return ok(undefined);
  }
}
