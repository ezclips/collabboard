import { boardAiCitationIdentityKey, type BoardAiCitationItem } from '../../domain/ai/boardAiChatCitation';
import type {
  BoardWikiCurrentVersions,
  BoardWikiSourceVersion,
} from '../../domain/wiki/boardWikiPageSources';

/**
 * What each cited source looks like RIGHT NOW.
 *
 * ONE IMPLEMENTATION, TWO CALLERS, AND THAT IS THE POINT. Reading a page uses
 * this to derive stale/gone by comparison; compiling uses it to record what a
 * passage was AT COMPILE TIME -- because at the moment of compilation, the
 * current version IS the compile-time version. If the two sides ever read
 * versions differently, every page compiled by one and checked by the other
 * would read as permanently stale, with nothing to point at.
 *
 * Two queries, not one per source. Both are board-scoped on top of RLS: a
 * document that exists on ANOTHER board must come back absent, or a page could
 * be used to probe for ids elsewhere.
 *
 * AN ABSENT SOURCE IS SIMPLY MISSING FROM THE MAP. For a read that means gone
 * -- deliberately conflating "deleted" with "no longer readable by this user",
 * because the page can offer neither and telling them apart would leak the
 * existence of a document to someone who lost access to it.
 */

export interface BoardWikiVersionClient {
  from(table: 'knowledge_documents' | 'padlets'): {
    select(columns: string): {
      eq(column: string, value: string): {
        in(column: string, values: readonly string[]): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

export async function readCurrentSourceVersions(
  client: BoardWikiVersionClient,
  boardId: string,
  items: readonly BoardAiCitationItem[],
): Promise<BoardWikiCurrentVersions> {
  const documentIds = [...new Set(
    items
      .map((item) => (item as { knowledgeDocumentId?: unknown }).knowledgeDocumentId)
      .filter((value): value is string => typeof value === 'string'),
  )];
  const padletIds = [...new Set(
    items
      .map((item) => (item as { padletId?: unknown }).padletId)
      .filter((value): value is string => typeof value === 'string'),
  )];

  const byRowIdentity = new Map<string, BoardWikiSourceVersion>();

  if (documentIds.length > 0) {
    // `transcript_mutation_revision::text` is REQUIRED, not cosmetic. PostgREST
    // serializes int8 as a JSON number, and JSON.parse rounds it before this
    // code runs -- stringifying afterwards would preserve a value that is
    // already wrong for a revision past Number.MAX_SAFE_INTEGER. The cast is
    // the only place the exact value survives the wire; the returned key is
    // still `transcript_mutation_revision`.
    // The transcript discriminator is a SCALAR pulled out of the jsonb, never
    // the column itself: `transcript_representation` holds every cue and can
    // reach 8 MiB, and this runs for every source of every page render. The
    // column's CHECK constraint guarantees `representationVersion` is present
    // whenever the column is non-null, so the scalar is a faithful proxy for
    // "is this row a transcript" at a few bytes.
    const { data, error } = await client
      .from('knowledge_documents')
      .select('id, content_sha256, transcript_mutation_revision::text, is_transcript:transcript_representation->>representationVersion, updated_at')
      .eq('board_id', boardId)
      .in('id', documentIds);
    // A failed read must fail loudly. Swallowing the error would leave `data`
    // null, the map empty, and EVERY source on the page rendering as gone --
    // telling a user their sources were deleted when the query merely failed.
    // FLAG, DO NOT BURY applies in both directions.
    if (error) throw error;
    for (const row of (data ?? []) as readonly Record<string, unknown>[]) {
      const revision = row.transcript_mutation_revision;
      byRowIdentity.set(`document:${String(row.id)}`, {
        kind: 'document',
        contentSha256: typeof row.content_sha256 === 'string' ? row.content_sha256 : null,
        updatedAt: String(row.updated_at ?? ''),
        // Same conditional-key rule as the parser: a string is the value; a
        // bare number is the fallback for an uncast response and is stringified,
        // though a rounded number cannot be un-rounded; anything else omits the
        // key rather than materializing a null.
        ...(typeof revision === 'string'
          ? { transcriptMutationRevision: revision }
          : typeof revision === 'number'
            ? { transcriptMutationRevision: String(revision) }
            : {}),
        ...(row.is_transcript !== null && row.is_transcript !== undefined
          ? { isTranscript: true as const }
          : {}),
      });
    }
  }

  if (padletIds.length > 0) {
    const { data, error } = await client
      .from('padlets')
      .select('id, updated_at')
      .eq('board_id', boardId)
      .in('id', padletIds);
    // Same rule as the document read above: a failed read is never an empty
    // board.
    if (error) throw error;
    for (const row of (data ?? []) as readonly Record<string, unknown>[]) {
      byRowIdentity.set(`padlet:${String(row.id)}`, {
        kind: 'post',
        updatedAt: String(row.updated_at ?? ''),
      });
    }
  }

  // Keyed the way the derivation reads it, and built from the ITEMS rather than
  // from the rows -- so an item whose row is missing simply never gets an entry.
  const current = new Map<string, BoardWikiSourceVersion>();
  for (const item of items) {
    const documentId = (item as { knowledgeDocumentId?: unknown }).knowledgeDocumentId;
    const padletId = (item as { padletId?: unknown }).padletId;
    const version = typeof documentId === 'string'
      ? byRowIdentity.get(`document:${documentId}`)
      : typeof padletId === 'string'
        ? byRowIdentity.get(`padlet:${padletId}`)
        : undefined;
    if (version) current.set(boardAiCitationIdentityKey(item), version);
  }
  return current;
}
