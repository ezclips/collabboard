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
    const { data } = await client
      .from('knowledge_documents')
      .select('id, content_sha256, updated_at')
      .eq('board_id', boardId)
      .in('id', documentIds);
    for (const row of (data ?? []) as readonly Record<string, unknown>[]) {
      byRowIdentity.set(`document:${String(row.id)}`, {
        kind: 'document',
        contentSha256: typeof row.content_sha256 === 'string' ? row.content_sha256 : null,
        updatedAt: String(row.updated_at ?? ''),
      });
    }
  }

  if (padletIds.length > 0) {
    const { data } = await client
      .from('padlets')
      .select('id, updated_at')
      .eq('board_id', boardId)
      .in('id', padletIds);
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
