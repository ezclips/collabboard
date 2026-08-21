import type { DomainError } from '../../domain/core/errors';
import { domainError } from '../../domain/core/errors';
import type { BoardId, KnowledgeDocumentId } from '../../domain/core/ids';
import { err, ok, type Result } from '../../domain/core/result';
import type { KnowledgeDocumentProcessingStatus } from '../../domain/knowledge/knowledgePersistence';

interface SupabaseErrorLike {
  readonly message: string;
}

interface KnowledgeDocumentListRow {
  readonly id: string;
  readonly board_id: string;
  readonly original_filename: string;
  readonly file_size_bytes: number;
  readonly page_count: number | null;
  readonly processing_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface KnowledgeDocumentListItem {
  readonly id: KnowledgeDocumentId;
  readonly boardId: BoardId;
  readonly originalFilename: string;
  readonly fileSizeBytes: number;
  readonly pageCount: number | null;
  readonly processingStatus: KnowledgeDocumentProcessingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeDocumentsReadOrder {
  order(
    column: 'created_at',
    options: { ascending: boolean },
  ): Promise<{
    data: KnowledgeDocumentListRow[] | null;
    error: SupabaseErrorLike | null;
  }>;
}

export interface KnowledgeDocumentsReadFilter {
  eq(column: 'board_id', value: string): KnowledgeDocumentsReadOrder;
}

export interface KnowledgeDocumentsReadSupabaseClient {
  from(table: 'knowledge_documents'): {
    select(columns: string): KnowledgeDocumentsReadFilter;
  };
}

export interface KnowledgeDocumentReadRepository {
  listDocumentsByBoardId(
    boardId: BoardId,
  ): Promise<Result<readonly KnowledgeDocumentListItem[], DomainError>>;
}

const SAFE_LIST_COLUMNS =
  'id, board_id, original_filename, file_size_bytes, page_count, processing_status, created_at, updated_at';

function mapListRow(row: KnowledgeDocumentListRow): KnowledgeDocumentListItem {
  return {
    id: row.id as KnowledgeDocumentId,
    boardId: row.board_id as BoardId,
    originalFilename: row.original_filename,
    fileSizeBytes: Number(row.file_size_bytes),
    pageCount: row.page_count === null ? null : Number(row.page_count),
    processingStatus: row.processing_status as KnowledgeDocumentProcessingStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Read-only board document listing for browser status hydration/polling.
 * The select list deliberately excludes Storage paths, hashes, parser internals,
 * raw artifacts, and worker error details.
 */
export class SupabaseKnowledgeDocumentReadRepository implements KnowledgeDocumentReadRepository {
  constructor(private readonly client: KnowledgeDocumentsReadSupabaseClient) {}

  async listDocumentsByBoardId(
    boardId: BoardId,
  ): Promise<Result<readonly KnowledgeDocumentListItem[], DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .select(SAFE_LIST_COLUMNS)
        .eq('board_id', boardId)
        .order('created_at', { ascending: false });

      if (error) {
        return err(
          domainError('unavailable', 'Could not list Knowledge documents', { cause: error }),
        );
      }

      return ok((data ?? []).map(mapListRow));
    } catch (cause) {
      return err(
        domainError('unavailable', 'Could not list Knowledge documents', { cause }),
      );
    }
  }
}
