import { createHash } from 'node:crypto';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { asBoardId, asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../../domain/core/ids';
import type { BoardId, KnowledgeDocumentId, PostId, UserId } from '../../domain/core/ids';
import type { KnowledgeSourceLocator, SourceReference } from '../../domain/knowledge/knowledgePersistence';
import type {
  KnowledgeQuoteHasher,
  KnowledgeSourceReferenceBoardWriteAuthorizer,
  KnowledgeSourceReferenceInsert,
  KnowledgeSourceReferenceSourceDocument,
  KnowledgeSourceReferenceTargetPadlet,
  KnowledgeSourceReferenceValidationRepository,
  KnowledgeSourceReferenceWriter,
} from '../../domain/knowledge/knowledgeSourceReferenceWrite';
import { SOURCE_REFERENCE_COLUMNS } from './knowledgeSourceReferenceAdapters';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

type SingleResult<TRow> = { data: TRow | null; error: SupabaseErrorLike | null };

interface SingleRowQuery<TRow> {
  /** `number` admits page_number; every other filter here is a uuid string. */
  eq(column: string, value: string | number): SingleRowQuery<TRow>;
  maybeSingle(): Promise<SingleResult<TRow>>;
}

interface ReadTable<TRow> {
  select(columns: string): SingleRowQuery<TRow>;
}

interface BoardOwnerRow { readonly id: string }
interface CollaboratorRow { readonly board_id: string }
interface SourceDocumentRow {
  readonly board_id: string;
  readonly page_count: number | null;
  readonly processing_status: string;
}
interface TargetPadletRow { readonly board_id: string }
interface PageTextRow { readonly text: string }

interface SourceReferenceRow {
  readonly id: string;
  readonly target_padlet_id: string;
  readonly source_document_id: string;
  readonly page_start: number;
  readonly page_end: number;
  readonly quote_text: string | null;
  readonly quote_hash: string | null;
  readonly char_start: number | null;
  readonly char_end: number | null;
  readonly locator: unknown;
  readonly created_at: string;
}

/**
 * `id` and `created_at` are omitted so the database defaults own them. The char
 * offsets carry B4-B2A's server-validated span; `locator` stays pinned to null
 * because highlight geometry is still not writable.
 */
interface SourceReferenceInsertRow {
  readonly target_padlet_id: string;
  readonly source_document_id: string;
  readonly page_start: number;
  readonly page_end: number;
  readonly quote_text: string | null;
  readonly quote_hash: string | null;
  readonly char_start: number | null;
  readonly char_end: number | null;
  readonly locator: null;
}

interface InsertedRowQuery {
  select(columns: string): { single(): Promise<SingleResult<SourceReferenceRow>> };
}

interface SourceReferenceWriteTable {
  insert(row: SourceReferenceInsertRow): InsertedRowQuery;
}

/**
 * Structural and minimal: the only mutation this client can express is an
 * insert into source_references. There is no update, delete, upsert, rpc,
 * storage or auth surface to reach for, and no client is constructed here, so
 * the caller decides the authority the query runs under.
 */
export interface KnowledgeSourceReferenceWriteSupabaseClient {
  from(table: 'boards'): ReadTable<BoardOwnerRow>;
  from(table: 'board_collaborators'): ReadTable<CollaboratorRow>;
  from(table: 'knowledge_documents'): ReadTable<SourceDocumentRow>;
  from(table: 'padlets'): ReadTable<TargetPadletRow>;
  from(table: 'knowledge_pages'): ReadTable<PageTextRow>;
  from(table: 'source_references'): SourceReferenceWriteTable;
}

const UNAVAILABLE = 'Could not write the source reference';

function unavailable(cause: unknown): DomainError {
  return domainError('unavailable', UNAVAILABLE, { cause });
}

export const nodeKnowledgeQuoteHasher: KnowledgeQuoteHasher = {
  hashQuoteText(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  },
};

/**
 * Mirrors the board write policy rather than `is_board_member`, which also
 * admits viewers and would silently promote them to authors of citations.
 */
export class SupabaseKnowledgeSourceReferenceWriteAuthorizer
implements KnowledgeSourceReferenceBoardWriteAuthorizer {
  constructor(private readonly client: KnowledgeSourceReferenceWriteSupabaseClient) {}

  async canWriteBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>> {
    try {
      const owner = await this.client
        .from('boards')
        .select('id')
        .eq('id', boardId)
        .eq('user_id', userId)
        .maybeSingle();
      if (owner.error) return err(unavailable(owner.error));
      if (owner.data !== null) return ok(true);

      const editor = await this.client
        .from('board_collaborators')
        .select('board_id')
        .eq('board_id', boardId)
        .eq('user_id', userId)
        .eq('role', 'editor')
        .maybeSingle();
      if (editor.error) return err(unavailable(editor.error));
      return ok(editor.data !== null);
    } catch (cause) {
      return err(unavailable(cause));
    }
  }
}

export class SupabaseKnowledgeSourceReferenceValidationRepository
implements KnowledgeSourceReferenceValidationRepository {
  constructor(private readonly client: KnowledgeSourceReferenceWriteSupabaseClient) {}

  async findSourceDocument(
    id: KnowledgeDocumentId,
    boardId: BoardId,
  ): Promise<Result<KnowledgeSourceReferenceSourceDocument | null, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_documents')
        .select('board_id, page_count, processing_status')
        .eq('id', id)
        .eq('board_id', boardId)
        .maybeSingle();
      if (error) return err(unavailable(error));
      if (data === null) return ok(null);
      return ok({
        boardId: asBoardId(data.board_id),
        pageCount: data.page_count,
        processingStatus: data.processing_status,
      });
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async findTargetPadlet(
    id: PostId,
    boardId: BoardId,
  ): Promise<Result<KnowledgeSourceReferenceTargetPadlet | null, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('padlets')
        .select('board_id')
        .eq('id', id)
        .eq('board_id', boardId)
        .maybeSingle();
      if (error) return err(unavailable(error));
      if (data === null) return ok(null);
      return ok({ boardId: asBoardId(data.board_id) });
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  /**
   * The canonical text of one page, returned verbatim -- no trimming and no
   * normalisation, because char offsets index exactly these code units.
   *
   * Board authority is not re-checked here: the caller has already proven the
   * document belongs to the authorized board, and this runs under the same
   * authenticated client, so RLS still applies.
   */
  async findPageText(
    documentId: KnowledgeDocumentId,
    pageNumber: number,
  ): Promise<Result<string | null, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_pages')
        .select('text')
        .eq('document_id', documentId)
        .eq('page_number', pageNumber)
        .maybeSingle();
      if (error) return err(unavailable(error));
      if (data === null) return ok(null);
      return ok(data.text);
    } catch (cause) {
      return err(unavailable(cause));
    }
  }
}

function toSourceReference(row: SourceReferenceRow): SourceReference {
  return {
    id: asSourceReferenceId(row.id),
    targetPadletId: asPostId(row.target_padlet_id),
    sourceDocumentId: asKnowledgeDocumentId(row.source_document_id),
    pageStart: row.page_start,
    pageEnd: row.page_end,
    quoteText: row.quote_text,
    quoteHash: row.quote_hash,
    charStart: row.char_start,
    charEnd: row.char_end,
    locator: row.locator === null || row.locator === undefined ? null : (row.locator as KnowledgeSourceLocator),
    createdAt: row.created_at,
  };
}

export class SupabaseKnowledgeSourceReferenceWriter implements KnowledgeSourceReferenceWriter {
  constructor(private readonly client: KnowledgeSourceReferenceWriteSupabaseClient) {}

  async insertSourceReference(
    row: KnowledgeSourceReferenceInsert,
  ): Promise<Result<SourceReference, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('source_references')
        .insert({
          target_padlet_id: row.targetPadletId,
          source_document_id: row.sourceDocumentId,
          page_start: row.pageStart,
          page_end: row.pageEnd,
          quote_text: row.quoteText,
          quote_hash: row.quoteHash,
          char_start: row.charStart,
          char_end: row.charEnd,
          locator: null,
        })
        .select(SOURCE_REFERENCE_COLUMNS)
        .single();
      if (error) return err(unavailable(error));
      if (data === null) return err(unavailable(null));
      return ok(toSourceReference(data));
    } catch (cause) {
      return err(unavailable(cause));
    }
  }
}
