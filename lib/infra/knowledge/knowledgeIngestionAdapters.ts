import { createHash, randomUUID } from 'node:crypto';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { BoardId, KnowledgeDocumentId, UserId } from '../../domain/core/ids';
import { asKnowledgeDocumentId } from '../../domain/core/ids';
import type { KnowledgeDocument } from '../../domain/knowledge/knowledgePersistence';
import type {
  KnowledgeBoardAuthorizer,
  KnowledgeContentHasher,
  KnowledgeDocumentIdFactory,
  KnowledgeDocumentInsert,
  KnowledgeIngestionRepository,
  KnowledgeStorageGateway,
} from '../../domain/knowledge/knowledgeIngestion';

/**
 * Dedicated private bucket for Knowledge source binaries.
 *
 * Deliberately NOT `padlet-files`: every bucket this project provisions today
 * (`padlet-files`, `images`, `thumbnails`) is public, and a public bucket
 * would hand out board-scoped PDFs to anyone holding the URL, defeating the
 * RLS the P3 migration exists to enforce. The upload *mechanism* is reused;
 * only the destination differs. The bucket is provisioned by the normal
 * post-baseline migration
 * `20260820_provision_knowledge_documents_bucket.sql`.
 */
export const KNOWLEDGE_STORAGE_BUCKET = 'knowledge-documents';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

/** SHA-256 over the exact bytes that were uploaded. */
export class NodeKnowledgeContentHasher implements KnowledgeContentHasher {
  async sha256(bytes: Uint8Array): Promise<string> {
    return createHash('sha256').update(bytes).digest('hex');
  }
}

export class RandomKnowledgeDocumentIdFactory implements KnowledgeDocumentIdFactory {
  newDocumentId(): KnowledgeDocumentId {
    return asKnowledgeDocumentId(randomUUID());
  }
}

// ---------------------------------------------------------------------------
// Board authorization
// ---------------------------------------------------------------------------

/** Chainable `.eq()` filter builder, matching supabase-js's shape. */
export interface KnowledgeAuthFilter {
  eq(column: string, value: string): KnowledgeAuthFilter;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: SupabaseErrorLike | null;
  }>;
}

export interface KnowledgeAuthSupabaseClient {
  from(table: 'boards' | 'board_collaborators'): {
    select(columns: string): KnowledgeAuthFilter;
  };
}

/**
 * Mirrors P3's `knowledge_documents_insert` policy predicate exactly:
 *
 *   board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
 *   OR board_id IN (SELECT board_id FROM board_collaborators
 *                   WHERE user_id = auth.uid() AND role = 'editor')
 *
 * Anything short of that -- non-member, or a collaborator whose role is not
 * 'editor' (e.g. 'viewer') -- is denied. No Knowledge-specific membership
 * concept is introduced.
 */
export class SupabaseKnowledgeBoardAuthorizer implements KnowledgeBoardAuthorizer {
  constructor(private readonly client: KnowledgeAuthSupabaseClient) {}

  async canMutateBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>> {
    // Branch 1: board owner (boards.user_id = the acting user).
    const owner = await this.client
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (owner.error) {
      return err(
        domainError('unavailable', 'Could not verify board permissions', { cause: owner.error }),
      );
    }
    if (owner.data !== null) return ok(true);

    // Branch 2: collaborator whose role is exactly 'editor'. A 'viewer' (or
    // any other role) yields no row and is therefore denied.
    const editor = await this.client
      .from('board_collaborators')
      .select('role')
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .eq('role', 'editor')
      .maybeSingle();

    if (editor.error) {
      return err(
        domainError('unavailable', 'Could not verify board permissions', { cause: editor.error }),
      );
    }

    return ok(editor.data !== null);
  }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface KnowledgeStorageSupabaseClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options?: { contentType?: string; upsert?: boolean },
      ): Promise<{ error: SupabaseErrorLike | null }>;
      remove(paths: readonly string[]): Promise<{ error: SupabaseErrorLike | null }>;
    };
  };
}

export class SupabaseKnowledgeStorageGateway implements KnowledgeStorageGateway {
  constructor(
    private readonly client: KnowledgeStorageSupabaseClient,
    private readonly bucket: string = KNOWLEDGE_STORAGE_BUCKET,
  ) {}

  async upload(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<Result<void, DomainError>> {
    try {
      const { error } = await this.client.storage
        .from(this.bucket)
        // upsert stays false: the path is document-id scoped, so a collision
        // means an id clash, which must surface rather than overwrite.
        .upload(path, bytes, { contentType, upsert: false });
      if (error) {
        return err(domainError('unavailable', 'Could not upload the PDF', { cause: error }));
      }
      return ok(undefined);
    } catch (cause: unknown) {
      return err(domainError('unavailable', 'Could not upload the PDF', { cause }));
    }
  }

  async remove(path: string): Promise<Result<void, DomainError>> {
    try {
      const { error } = await this.client.storage.from(this.bucket).remove([path]);
      if (error) {
        return err(
          domainError('unavailable', 'Could not remove the uploaded PDF', { cause: error }),
        );
      }
      return ok(undefined);
    } catch (cause: unknown) {
      return err(domainError('unavailable', 'Could not remove the uploaded PDF', { cause }));
    }
  }

  /**
   * P6J-F9-A1a. One Storage request for the whole batch -- never a loop over
   * `remove`. An empty batch is a no-op rather than an empty API call.
   */
  async removeMany(paths: readonly string[]): Promise<Result<void, DomainError>> {
    if (paths.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.storage.from(this.bucket).remove(paths);
      if (error) {
        return err(
          domainError('unavailable', 'Could not remove the Knowledge artifacts', { cause: error }),
        );
      }
      return ok(undefined);
    } catch (cause: unknown) {
      return err(domainError('unavailable', 'Could not remove the Knowledge artifacts', { cause }));
    }
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

interface KnowledgeDocumentRow {
  readonly id: string;
  readonly board_id: string;
  readonly created_by: string | null;
  readonly kind: string;
  readonly original_filename: string;
  readonly mime_type: string;
  readonly file_size_bytes: number;
  readonly storage_path: string;
  readonly content_sha256: string;
  readonly page_count: number | null;
  readonly processing_status: string;
  readonly processing_error: string | null;
  readonly parser_name: string | null;
  readonly parser_version: string | null;
  readonly parser_options_hash: string | null;
  readonly raw_artifact_path: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface KnowledgeDocumentsSupabaseClient {
  from(table: 'knowledge_documents'): {
    insert(payload: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: KnowledgeDocumentRow | null; error: SupabaseErrorLike | null }>;
      };
    };
  };
}

export function mapKnowledgeDocumentRow(row: KnowledgeDocumentRow): KnowledgeDocument {
  return {
    id: row.id as KnowledgeDocument['id'],
    boardId: row.board_id as KnowledgeDocument['boardId'],
    createdBy: row.created_by as KnowledgeDocument['createdBy'],
    kind: 'pdf',
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    storagePath: row.storage_path,
    contentSha256: row.content_sha256,
    pageCount: row.page_count,
    processingStatus: row.processing_status as KnowledgeDocument['processingStatus'],
    processingError: row.processing_error,
    parserName: row.parser_name,
    parserVersion: row.parser_version,
    parserOptionsHash: row.parser_options_hash,
    rawArtifactPath: row.raw_artifact_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts only the columns ingestion owns. `processing_status` is left to the
 * schema default ('uploaded'); page_count, the parser_* fields and
 * raw_artifact_path are never written here -- they belong to the extraction
 * worker and must stay NULL after ingestion.
 */
export class SupabaseKnowledgeIngestionRepository implements KnowledgeIngestionRepository {
  constructor(private readonly client: KnowledgeDocumentsSupabaseClient) {}

  async insertDocument(
    record: KnowledgeDocumentInsert,
  ): Promise<Result<KnowledgeDocument, DomainError>> {
    const { data, error } = await this.client
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

    if (error) {
      return err(domainError('unavailable', 'Could not save the document', { cause: error }));
    }
    if (!data) {
      return err(domainError('unavailable', 'Could not save the document'));
    }

    return ok(mapKnowledgeDocumentRow(data));
  }
}
