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
import { compareKnowledgeSourceReferences } from '../../domain/knowledge/knowledgeSourceReferenceIndex';
import { normalizeStorableRegion } from '../../domain/knowledge/knowledgePageRegionGeometry';
import type { NormalizedPageRegion } from '../../domain/knowledge/knowledgePageRegionGeometry';

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
  readonly region_x: number | null;
  readonly region_y: number | null;
  readonly region_width: number | null;
  readonly region_height: number | null;
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
  'id, target_padlet_id, source_document_id, page_start, page_end, quote_text, quote_hash, char_start, char_end, '
  + 'region_x, region_y, region_width, region_height, locator, created_at';

/**
 * P6J-F9-B1. Validated, never cast: the four columns become a region only when
 * all four are finite numbers describing an in-bounds normalised rectangle.
 *
 * A row that fails those checks yields null rather than an error. The database
 * CHECK makes a partial row unreachable in practice, and a region is optional
 * enhancement data over the reference's page identity -- degrading one corrupt
 * rectangle is right, while failing a whole board's citation read is not.
 */
export function toSourceReferenceRegion(row: {
  readonly region_x: number | null;
  readonly region_y: number | null;
  readonly region_width: number | null;
  readonly region_height: number | null;
}): NormalizedPageRegion | null {
  return normalizeStorableRegion({
    x: row.region_x,
    y: row.region_y,
    width: row.region_width,
    height: row.region_height,
  });
}

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
    region: toSourceReferenceRegion(row),
    locator: toLocator(row.locator),
    createdAt: row.created_at,
  };
}

/** One shape for both reads: neither may leak provider text to the caller. */
const UNAVAILABLE_MESSAGE = 'Could not read the source references';

/**
 * Target ids per batched request. Chosen so the encoded filter stays well
 * inside common proxy URL limits: 100 UUIDs is roughly 3.7KB of query string.
 * Internal to this adapter -- callers still hand over the whole board.
 */
const MAX_TARGET_IDS_PER_REFERENCE_QUERY = 100;

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
   * Bounded batched read for a whole board: a fixed number of targets per
   * request, never one request per Note.
   *
   * The bound exists because PostgREST encodes `.in(...)` into the GET query
   * string, so an unbounded id list becomes an unbounded URL -- a 200-post
   * board would push roughly 7.5KB of filter past common 8KB proxy limits. Two
   * bounded requests are cheap; one rejected oversized request is not.
   */
  async listReferencesByTargetPadletIds(
    targetPadletIds: readonly PostId[],
  ): Promise<Result<readonly SourceReference[], DomainError>> {
    // No targets means nothing to ask about. Returning early keeps an empty
    // board off the network entirely rather than sending `in ()`.
    const uniqueIds = Array.from(new Set<string>(targetPadletIds));
    if (uniqueIds.length === 0) return ok([]);

    const references: SourceReference[] = [];
    try {
      for (let offset = 0; offset < uniqueIds.length; offset += MAX_TARGET_IDS_PER_REFERENCE_QUERY) {
        const chunk = uniqueIds.slice(offset, offset + MAX_TARGET_IDS_PER_REFERENCE_QUERY);
        const { data, error } = await this.client
          .from('source_references')
          .select(SOURCE_REFERENCE_COLUMNS)
          .in('target_padlet_id', chunk)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true });

        // Sequential, and a failed chunk stops here: the remaining chunks are
        // never requested and the caller gets an error rather than a partial
        // board that would read as "these Notes have no sources".
        if (error) {
          return err(domainError('unavailable', UNAVAILABLE_MESSAGE, { cause: error }));
        }

        for (const row of data ?? []) references.push(toSourceReference(row));
      }
    } catch (cause) {
      return err(domainError('unavailable', UNAVAILABLE_MESSAGE, { cause }));
    }

    // Each chunk is ordered, which is not the same as the whole set being
    // ordered: a later chunk can hold a row older than anything in the first.
    // One global sort restores the single-target read's total order.
    return ok(references.sort(compareKnowledgeSourceReferences));
  }
}
