import { createHash } from 'node:crypto';
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import {
  asKnowledgeDocumentId,
  asKnowledgeSourceHighlightId,
  asSourceReferenceId,
  asUserId,
  asBoardId,
} from '../../domain/core/ids';
import type {
  BoardId,
  KnowledgeDocumentId,
  KnowledgeSourceHighlightId,
  SourceReferenceId,
  UserId,
} from '../../domain/core/ids';
import type { KnowledgeSourceHighlight } from '../../domain/knowledge/knowledgeSourceHighlight';
import type {
  KnowledgeQuoteHasher,
  KnowledgeSourceHighlightBoardAuthorizer,
  KnowledgeSourceHighlightDocument,
  KnowledgeSourceHighlightInsert,
  KnowledgeSourceHighlightOriginReference,
  KnowledgeSourceHighlightRepository,
} from '../../domain/knowledge/knowledgeSourceHighlightWrite';

/**
 * PDF-R6K-H2A -- Supabase adapters for standalone highlights.
 *
 * The client interface below is STRUCTURAL and deliberately minimal. It names
 * exactly four tables and, for three of them, only `select`. The one writable
 * table is `knowledge_source_highlights`. There is no `source_references`
 * write, no `padlets` surface, no rpc, no storage and no auth here, so a bug in
 * this file cannot delete a citation or mutate a Note -- it has no way to say
 * either of those things.
 *
 * No client is constructed here either: the caller supplies one, which is what
 * keeps "whose authority does this run under" a question for the route rather
 * than a decision buried in infrastructure. Every query therefore still passes
 * through RLS, behind the explicit owner/editor check in the domain command.
 */

const UNAVAILABLE = 'Highlights are temporarily unavailable';

function unavailable(cause: unknown): DomainError {
  return domainError('unavailable', UNAVAILABLE, { cause });
}

interface QueryError { readonly message: string }
interface MaybeSingleResult<T> { readonly data: T | null; readonly error: QueryError | null }
interface ListResult<T> { readonly data: T[] | null; readonly error: QueryError | null }

interface SelectQuery<T> {
  eq(column: string, value: string | number): FilteredQuery<T>;
}

interface FilteredQuery<T> extends PromiseLike<ListResult<T>> {
  eq(column: string, value: string | number): FilteredQuery<T>;
  order(column: string, options: { ascending: boolean }): FilteredQuery<T>;
  maybeSingle(): Promise<MaybeSingleResult<T>>;
}

interface InsertQuery<T> {
  select(columns: string): { single(): Promise<MaybeSingleResult<T>> };
}

interface UpdateQuery<T> {
  eq(column: string, value: string): {
    select(columns: string): { single(): Promise<MaybeSingleResult<T>> };
  };
}

interface DeleteQuery {
  eq(column: string, value: string): Promise<{ error: QueryError | null }>;
}

interface HighlightRow {
  readonly id: string;
  readonly source_document_id: string;
  readonly page_number: number;
  readonly char_start: number;
  readonly char_end: number;
  readonly quote_text: string;
  readonly quote_hash: string | null;
  readonly color: string;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly source_reference_id: string | null;
}

interface DocumentRow { readonly id: string; readonly board_id: string }
interface ReferenceRow { readonly id: string; readonly source_document_id: string }
interface BoardOwnerRow { readonly id: string }
interface CollaboratorRow { readonly board_id: string }

interface HighlightTable {
  select(columns: string): SelectQuery<HighlightRow>;
  insert(row: HighlightInsertRow): InsertQuery<HighlightRow>;
  update(patch: HighlightUpdateRow): UpdateQuery<HighlightRow>;
  delete(): DeleteQuery;
}

interface HighlightInsertRow {
  readonly source_document_id: string;
  readonly page_number: number;
  readonly char_start: number;
  readonly char_end: number;
  readonly quote_text: string;
  readonly quote_hash: string;
  readonly color: string;
  readonly created_by: string;
  readonly source_reference_id: string | null;
}

interface HighlightUpdateRow { readonly color: string }

interface ReadTable<T> { select(columns: string): SelectQuery<T> }

export interface KnowledgeSourceHighlightSupabaseClient {
  from(table: 'knowledge_source_highlights'): HighlightTable;
  from(table: 'knowledge_documents'): ReadTable<DocumentRow>;
  from(table: 'source_references'): ReadTable<ReferenceRow>;
  from(table: 'boards'): ReadTable<BoardOwnerRow>;
  from(table: 'board_collaborators'): ReadTable<CollaboratorRow>;
}

export const nodeKnowledgeHighlightQuoteHasher: KnowledgeQuoteHasher = {
  hashQuoteText(text: string): string {
    // Byte-for-byte the citation writer's hash, so a backfilled highlight and
    // its origin citation agree about the same passage.
    return createHash('sha256').update(text, 'utf8').digest('hex');
  },
};

const SELECT_COLUMNS =
  'id, source_document_id, page_number, char_start, char_end, quote_text, quote_hash, '
  + 'color, created_by, created_at, updated_at, source_reference_id';

function toHighlight(row: HighlightRow): KnowledgeSourceHighlight {
  return {
    id: asKnowledgeSourceHighlightId(row.id),
    sourceDocumentId: asKnowledgeDocumentId(row.source_document_id),
    pageNumber: row.page_number,
    charStart: row.char_start,
    charEnd: row.char_end,
    quoteText: row.quote_text,
    quoteHash: row.quote_hash,
    color: row.color,
    createdBy: row.created_by === null ? null : asUserId(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceReferenceId: row.source_reference_id === null
      ? null
      : asSourceReferenceId(row.source_reference_id),
  };
}

/**
 * Mirrors the citation writer's authorizer exactly rather than reusing
 * `is_board_member`, which is role-agnostic and would silently let a viewer or
 * a readonly collaborator annotate shared Knowledge. `manager` is not admitted
 * here either -- see MANAGER_KNOWLEDGE_WRITE_ROLE_DEBT; widening one surface
 * alone would put highlights and citations into disagreement.
 */
export class SupabaseKnowledgeSourceHighlightAuthorizer
implements KnowledgeSourceHighlightBoardAuthorizer {
  constructor(private readonly client: KnowledgeSourceHighlightSupabaseClient) {}

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

  /** Any member may read, which is the citation read policy's rule too. */
  async canReadBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>> {
    try {
      const owner = await this.client
        .from('boards')
        .select('id')
        .eq('id', boardId)
        .eq('user_id', userId)
        .maybeSingle();
      if (owner.error) return err(unavailable(owner.error));
      if (owner.data !== null) return ok(true);

      const member = await this.client
        .from('board_collaborators')
        .select('board_id')
        .eq('board_id', boardId)
        .eq('user_id', userId)
        .maybeSingle();
      if (member.error) return err(unavailable(member.error));
      return ok(member.data !== null);
    } catch (cause) {
      return err(unavailable(cause));
    }
  }
}

export class SupabaseKnowledgeSourceHighlightRepository
implements KnowledgeSourceHighlightRepository {
  constructor(private readonly client: KnowledgeSourceHighlightSupabaseClient) {}

  async findDocument(
    documentId: KnowledgeDocumentId,
  ): Promise<Result<KnowledgeSourceHighlightDocument | null, DomainError>> {
    try {
      const found = await this.client
        .from('knowledge_documents')
        .select('id, board_id')
        .eq('id', documentId)
        .maybeSingle();
      if (found.error) return err(unavailable(found.error));
      if (found.data === null) return ok(null);
      return ok({
        id: asKnowledgeDocumentId(found.data.id),
        boardId: asBoardId(found.data.board_id),
      });
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async findOriginReference(
    referenceId: SourceReferenceId,
  ): Promise<Result<KnowledgeSourceHighlightOriginReference | null, DomainError>> {
    try {
      const found = await this.client
        .from('source_references')
        .select('id, source_document_id')
        .eq('id', referenceId)
        .maybeSingle();
      if (found.error) return err(unavailable(found.error));
      if (found.data === null) return ok(null);
      return ok({
        id: asSourceReferenceId(found.data.id),
        sourceDocumentId: asKnowledgeDocumentId(found.data.source_document_id),
      });
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async findHighlight(
    highlightId: KnowledgeSourceHighlightId,
  ): Promise<Result<KnowledgeSourceHighlight | null, DomainError>> {
    try {
      const found = await this.client
        .from('knowledge_source_highlights')
        .select(SELECT_COLUMNS)
        .eq('id', highlightId)
        .maybeSingle();
      if (found.error) return err(unavailable(found.error));
      return ok(found.data === null ? null : toHighlight(found.data));
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async list(
    documentId: KnowledgeDocumentId,
    pageNumber: number | null,
  ): Promise<Result<readonly KnowledgeSourceHighlight[], DomainError>> {
    try {
      let query = this.client
        .from('knowledge_source_highlights')
        .select(SELECT_COLUMNS)
        .eq('source_document_id', documentId);
      if (pageNumber !== null) query = query.eq('page_number', pageNumber);
      // Stable order so a caller painting several highlights over one run of
      // text sees the same sequence on every read.
      const listed = await query.order('char_start', { ascending: true });
      if (listed.error) return err(unavailable(listed.error));
      return ok((listed.data ?? []).map(toHighlight));
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async insert(
    row: KnowledgeSourceHighlightInsert,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>> {
    try {
      const inserted = await this.client
        .from('knowledge_source_highlights')
        .insert({
          source_document_id: row.sourceDocumentId,
          page_number: row.pageNumber,
          char_start: row.charStart,
          char_end: row.charEnd,
          quote_text: row.quoteText,
          quote_hash: row.quoteHash,
          color: row.color,
          created_by: row.createdBy,
          source_reference_id: row.sourceReferenceId,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (inserted.error) {
        // The unique origin index is the backfill's convergence mechanism, so a
        // second highlight for the same citation is a conflict the caller can
        // act on rather than an opaque failure.
        if (/duplicate key|unique constraint/i.test(inserted.error.message)) {
          return err(domainError('conflict', 'Highlight already exists for this citation', {
            cause: inserted.error,
          }));
        }
        return err(unavailable(inserted.error));
      }
      if (inserted.data === null) return err(unavailable('insert returned no row'));
      return ok(toHighlight(inserted.data));
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async updateColor(
    highlightId: KnowledgeSourceHighlightId,
    color: string,
  ): Promise<Result<KnowledgeSourceHighlight, DomainError>> {
    try {
      // One column. `updated_at` is not set here -- the table's trigger owns it,
      // the same convention knowledge_documents follows.
      const updated = await this.client
        .from('knowledge_source_highlights')
        .update({ color })
        .eq('id', highlightId)
        .select(SELECT_COLUMNS)
        .single();
      if (updated.error) return err(unavailable(updated.error));
      if (updated.data === null) return err(domainError('not_found', 'Highlight not found'));
      return ok(toHighlight(updated.data));
    } catch (cause) {
      return err(unavailable(cause));
    }
  }

  async remove(highlightId: KnowledgeSourceHighlightId): Promise<Result<true, DomainError>> {
    try {
      const removed = await this.client
        .from('knowledge_source_highlights')
        .delete()
        .eq('id', highlightId);
      if (removed.error) return err(unavailable(removed.error));
      return ok(true);
    } catch (cause) {
      return err(unavailable(cause));
    }
  }
}
