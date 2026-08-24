import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../../domain/core/ids';
import type { PostId } from '../../domain/core/ids';
import type {
  KnowledgeRepository,
  KnowledgeSourceLocator,
  SourceReference,
} from '../../domain/knowledge/knowledgePersistence';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
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
  readonly locator: unknown;
  readonly created_at: string;
}

type SourceReferenceQueryResult = {
  data: SourceReferenceRow[] | null;
  error: SupabaseErrorLike | null;
};

interface SourceReferenceListQuery {
  eq(column: string, value: string): SourceReferenceListQuery;
  in(column: string, values: readonly string[]): SourceReferenceListQuery;
  order(column: string, options: { ascending: boolean }): SourceReferenceListQuery;
  then<TResult1 = SourceReferenceQueryResult>(
    onfulfilled?: ((value: SourceReferenceQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1>;
}

interface SourceReferencesTable {
  select(columns: string): SourceReferenceListQuery;
}

/**
 * Deliberately structural and read-only: the adapter never constructs a client,
 * so it cannot decide whether it runs with browser, route-handler or
 * service-role authority. Composition layers own that choice, which is what
 * keeps row visibility a question for RLS rather than for this file.
 */
export interface KnowledgeSourceReferenceSupabaseClient {
  from(table: 'source_references'): SourceReferencesTable;
}

export const SOURCE_REFERENCE_COLUMNS =
  'id, target_padlet_id, source_document_id, page_start, page_end, quote_text, quote_hash, char_start, char_end, locator, created_at';

/**
 * Parser-neutral passthrough. The stored payload is already the domain locator
 * shape, so re-deriving coordinates here would invent provenance the extractor
 * never claimed; only absence is normalised.
 */
function toLocator(value: unknown): KnowledgeSourceLocator | null {
  return value === null || value === undefined ? null : (value as KnowledgeSourceLocator);
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
    locator: toLocator(row.locator),
    createdAt: row.created_at,
  };
}

/** One shape for both reads: neither may leak provider text to the caller. */
const UNAVAILABLE_MESSAGE = 'Could not read the source references';

export class SupabaseKnowledgeSourceReferenceReader
implements Pick<KnowledgeRepository, 'listReferencesByTargetPadletId' | 'listReferencesByTargetPadletIds'> {
  constructor(private readonly client: KnowledgeSourceReferenceSupabaseClient) {}

  async listReferencesByTargetPadletId(
    id: PostId,
  ): Promise<Result<readonly SourceReference[], DomainError>> {
    try {
      const { data, error } = await this.client
        .from('source_references')
        .select(SOURCE_REFERENCE_COLUMNS)
        .eq('target_padlet_id', id)
        // created_at alone is not a total order for citations saved together.
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        return err(domainError('unavailable', UNAVAILABLE_MESSAGE, { cause: error }));
      }

      return ok((data ?? []).map(toSourceReference));
    } catch (cause) {
      return err(domainError('unavailable', UNAVAILABLE_MESSAGE, { cause }));
    }
  }

  /**
   * Exactly one query for the whole target set, which is the entire reason this
   * method exists: the single-target read called in a loop would put one request
   * on the wire per Note on the board.
   */
  async listReferencesByTargetPadletIds(
    targetPadletIds: readonly PostId[],
  ): Promise<Result<readonly SourceReference[], DomainError>> {
    // No targets means nothing to ask about. Returning early keeps an empty
    // board off the network entirely rather than sending `in ()`.
    const uniqueIds = Array.from(new Set<string>(targetPadletIds));
    if (uniqueIds.length === 0) return ok([]);

    try {
      const { data, error } = await this.client
        .from('source_references')
        .select(SOURCE_REFERENCE_COLUMNS)
        .in('target_padlet_id', uniqueIds)
        // Same total order as the single-target read, so a Note's citations
        // read identically whichever of the two loaded them.
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        return err(domainError('unavailable', UNAVAILABLE_MESSAGE, { cause: error }));
      }

      return ok((data ?? []).map(toSourceReference));
    } catch (cause) {
      return err(domainError('unavailable', UNAVAILABLE_MESSAGE, { cause }));
    }
  }
}
