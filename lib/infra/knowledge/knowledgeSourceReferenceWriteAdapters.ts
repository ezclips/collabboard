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
  KnowledgeSourceReferencePageGeometry,
  KnowledgeSourceReferenceSourceDocument,
  KnowledgeSourceReferenceTargetPadlet,
  KnowledgeSourceReferenceValidationRepository,
  KnowledgeSourceReferenceWriter,
} from '../../domain/knowledge/knowledgeSourceReferenceWrite';
import { SOURCE_REFERENCE_COLUMNS, toSourceReferenceRegion } from './knowledgeSourceReferenceAdapters';

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
interface TargetPadletRow {
  readonly board_id: string;
  readonly metadata: Record<string, unknown> | null;
}
interface KnowledgePageRow {
  readonly text: string;
  readonly width_points: number | null;
  readonly height_points: number | null;
  readonly rotation: number | null;
}

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
  readonly region_x: number | null;
  readonly region_y: number | null;
  readonly region_width: number | null;
  readonly region_height: number | null;
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
  readonly region_x: number | null;
  readonly region_y: number | null;
  readonly region_width: number | null;
  readonly region_height: number | null;
  readonly locator: null;
}

interface InsertedRowQuery {
  select(columns: string): { single(): Promise<SingleResult<SourceReferenceRow>> };
}

/**
 * PDF-R6K-H2B. `insert` remains -- it is what the citation write used to be and
 * what the shape of the row still is -- and `select` is added so the writer can
 * read back the row the atomic function created. Still no update, delete or
 * upsert: the only mutation this client can express is the one INSERT.
 */
interface SourceReferenceWriteTable {
  insert(row: SourceReferenceInsertRow): InsertedRowQuery;
  select(columns: string): SingleRowQuery<SourceReferenceRow>;
}

/**
 * Structural and minimal: the only mutation this client can express is an
 * insert into source_references. There is no update, delete, upsert, rpc,
 * storage or auth surface to reach for, and no client is constructed here, so
 * the caller decides the authority the query runs under.
 */
/**
 * PDF-R6K-H2B. The ONE remote procedure this client may call, typed by name and
 * by argument shape. Naming it explicitly keeps the surface as narrow as the
 * table list below: there is no general `rpc(name, args)` here, so no other
 * function can be reached through this client.
 */
export interface KnowledgeSourceCitationRpcArgs {
  readonly p_target_padlet_id: string;
  readonly p_source_document_id: string;
  readonly p_page_start: number;
  readonly p_page_end: number;
  readonly p_quote_text: string | null;
  readonly p_quote_hash: string | null;
  readonly p_char_start: number | null;
  readonly p_char_end: number | null;
  readonly p_region_x: number | null;
  readonly p_region_y: number | null;
  readonly p_region_width: number | null;
  readonly p_region_height: number | null;
  readonly p_highlight_color: string | null;
}

interface CitationRpcRow {
  readonly reference_id: string;
  readonly highlight_id: string | null;
}

export interface KnowledgeSourceReferenceWriteSupabaseClient {
  rpc(
    fn: 'create_knowledge_source_citation',
    args: KnowledgeSourceCitationRpcArgs,
  ): PromiseLike<{ data: CitationRpcRow[] | null; error: { message: string } | null }>;
  from(table: 'boards'): ReadTable<BoardOwnerRow>;
  from(table: 'board_collaborators'): ReadTable<CollaboratorRow>;
  from(table: 'knowledge_documents'): ReadTable<SourceDocumentRow>;
  from(table: 'padlets'): ReadTable<TargetPadletRow>;
  from(table: 'knowledge_pages'): ReadTable<KnowledgePageRow>;
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
        // PDF-R6K-H2B also reads the Note's own colour fields, so a highlight
        // born with this citation can be seeded with the Note's accent once.
        .select('board_id, metadata')
        .eq('id', id)
        .eq('board_id', boardId)
        .maybeSingle();
      if (error) return err(unavailable(error));
      if (data === null) return ok(null);
      const metadata = (data.metadata ?? {}) as Record<string, unknown>;
      return ok({
        boardId: asBoardId(data.board_id),
        noteColors: {
          topStrip: typeof metadata.topStrip === 'string' ? metadata.topStrip : undefined,
          cardColor: typeof metadata.cardColor === 'string' ? metadata.cardColor : undefined,
        },
      });
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

  /**
   * The stored page shape, returned verbatim. Nothing is defaulted or repaired
   * here: the domain decides what an absent rotation or a missing dimension
   * means, so there is one place that judgement lives.
   */
  async findPageGeometry(
    documentId: KnowledgeDocumentId,
    pageNumber: number,
  ): Promise<Result<KnowledgeSourceReferencePageGeometry | null, DomainError>> {
    try {
      const { data, error } = await this.client
        .from('knowledge_pages')
        .select('width_points, height_points, rotation')
        .eq('document_id', documentId)
        .eq('page_number', pageNumber)
        .maybeSingle();
      if (error) return err(unavailable(error));
      if (data === null) return ok(null);
      return ok({
        widthPoints: data.width_points,
        heightPoints: data.height_points,
        rotation: data.rotation,
      });
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
    region: toSourceReferenceRegion(row),
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
      /*
        PDF-R6K-H2B. One transaction, not two writes.

        The citation and -- for a paintable text span -- its standalone
        highlight are created together inside a SECURITY INVOKER function, so a
        failure on either leaves neither. Two sequential PostgREST calls could
        not promise that, and a Note whose passage is cited but unmarked would
        be a state nothing later repairs.

        The function runs as the caller, so source_references RLS, the highlight
        RLS, the H2A-C1 column grants and the origin trigger all still apply.
        `created_by` is not passed: the column default writes authorship.
      */
      const { data, error } = await this.client.rpc('create_knowledge_source_citation', {
        p_target_padlet_id: row.targetPadletId,
        p_source_document_id: row.sourceDocumentId,
        p_page_start: row.pageStart,
        p_page_end: row.pageEnd,
        p_quote_text: row.quoteText,
        p_quote_hash: row.quoteHash,
        p_char_start: row.charStart,
        p_char_end: row.charEnd,
        p_region_x: row.regionX,
        p_region_y: row.regionY,
        p_region_width: row.regionWidth,
        p_region_height: row.regionHeight,
        p_highlight_color: row.highlightColor,
      });
      if (error) return err(unavailable(error));
      const created = data?.[0] ?? null;
      if (created === null) return err(unavailable(null));

      // Read the durable row back through the ordinary read path, so the
      // returned entity is the stored one rather than a payload echo.
      const { data: stored, error: readError } = await this.client
        .from('source_references')
        .select(SOURCE_REFERENCE_COLUMNS)
        .eq('id', created.reference_id)
        .maybeSingle();
      if (readError) return err(unavailable(readError));
      if (stored === null) return err(unavailable(null));
      return ok(toSourceReference(stored));
    } catch (cause) {
      return err(unavailable(cause));
    }
  }
}
