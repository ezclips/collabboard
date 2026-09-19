import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { asBoardId, asUserId } from '../../domain/core/ids';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import {
  boardWikiSlugFromTitle,
  type BoardWikiPage,
} from '../../domain/wiki/boardWikiEditing';
import {
  boardWikiPageSourcesFromStored,
  type BoardWikiCurrentVersions,
  type BoardWikiPageSource,
  type BoardWikiSourceVersion,
} from '../../domain/wiki/boardWikiPageSources';
import { boardAiCitationIdentityKey } from '../../domain/ai/boardAiChatCitation';
import { SupabaseKnowledgeBoardAuthorizer } from '../../infra/knowledge/knowledgeIngestionAdapters';
import { canReadBoardKnowledge } from '../knowledge/knowledgeBoardReadAuthorization';
import type { BoardWikiSession } from './boardWikiPageRoute';

/**
 * The authenticated session the wiki handlers are given.
 *
 * ===========================================================================
 * EVERYTHING HERE RUNS ON THE CALLER'S OWN CLIENT. THERE IS NO ADMIN CLIENT.
 * ===========================================================================
 *
 * The document-delete session reaches for the admin client because Storage
 * objects are not something a user's client can remove and a cascade must not
 * be half-applied. Nothing here has that problem: a wiki page is one row in one
 * table with no blobs and no children the caller cannot see. So the caller's
 * own client does every read and every write, RLS applies to all of them, and
 * the explicit permission checks below are the primary gate with the policies
 * behind them -- rather than a service role that bypasses the policies and
 * leaves the explicit check as the only thing standing.
 *
 * THE SOURCE VERSIONS ARE READ THE SAME WAY, which is what makes the gone state
 * honest. A document this user may no longer read returns no row and is
 * rendered gone -- deliberately indistinguishable from deleted, because the
 * page cannot offer either one and telling them apart would leak the existence
 * of a document to someone who lost access to it.
 */

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createWikiRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

const PAGE_COLUMNS = 'id, slug, title, content, sources, compiled_at, updated_at';

interface StoredPageRow {
  readonly id?: unknown;
  readonly slug?: unknown;
  readonly title?: unknown;
  readonly content?: unknown;
  readonly sources?: unknown;
  readonly compiled_at?: unknown;
  readonly updated_at?: unknown;
}

function pageFromRow(row: StoredPageRow): BoardWikiPage {
  return {
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    content: typeof row.content === 'string' ? row.content : '',
    sources: boardWikiPageSourcesFromStored(row.sources),
    compiledAt: typeof row.compiled_at === 'string' ? row.compiled_at : null,
    updatedAt: String(row.updated_at ?? ''),
  };
}

/**
 * Reads every cited source's CURRENT version, in two queries rather than one
 * per source.
 *
 * A source absent from the returned map is gone. Both lookups are board-scoped
 * on top of RLS: a document that exists on another board must read as gone
 * here, or a page could be used to probe for ids elsewhere.
 */
async function currentVersionsFor(
  client: ReturnType<typeof createWikiRouteClient>,
  boardId: string,
  sources: readonly BoardWikiPageSource[],
): Promise<BoardWikiCurrentVersions> {
  const documentIds = [...new Set(
    sources
      .map((source) => (source.item as { knowledgeDocumentId?: string }).knowledgeDocumentId)
      .filter((value): value is string => typeof value === 'string'),
  )];
  const padletIds = [...new Set(
    sources
      .map((source) => (source.item as { padletId?: string }).padletId)
      .filter((value): value is string => typeof value === 'string'),
  )];

  const versionByIdentity = new Map<string, BoardWikiSourceVersion>();

  if (documentIds.length > 0) {
    const { data } = await client
      .from('knowledge_documents')
      .select('id, content_sha256, updated_at')
      .eq('board_id', boardId)
      .in('id', documentIds);
    for (const row of (data ?? []) as readonly Record<string, unknown>[]) {
      versionByIdentity.set(`document:${String(row.id)}`, {
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
      versionByIdentity.set(`padlet:${String(row.id)}`, {
        kind: 'post',
        updatedAt: String(row.updated_at ?? ''),
      });
    }
  }

  // Keyed by `boardAiCitationIdentityKey`, which the derivation uses -- so the
  // map is built from the RECORDED items rather than from the rows, and a
  // source whose row is missing simply never gets an entry.
  const current = new Map<string, BoardWikiSourceVersion>();
  for (const source of sources) {
    const item = source.item as { knowledgeDocumentId?: string; padletId?: string };
    const version = typeof item.knowledgeDocumentId === 'string'
      ? versionByIdentity.get(`document:${item.knowledgeDocumentId}`)
      : typeof item.padletId === 'string'
        ? versionByIdentity.get(`padlet:${item.padletId}`)
        : undefined;
    if (version) current.set(boardAiCitationIdentityKey(source.item), version);
  }
  return current;
}

export async function getBoardWikiSession(): Promise<BoardWikiSession | null> {
  const cookieStore = await cookies();
  const client = createWikiRouteClient(cookieStore);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) return null;

  async function requireRead(boardId: string, userId: string) {
    try {
      return await canReadBoardKnowledge(client as never, boardId, userId);
    } catch {
      // Authorization fails CLOSED. An outage must not read as permission.
      return false;
    }
  }

  async function requireWrite(boardId: string, userId: string) {
    const authorizer = new SupabaseKnowledgeBoardAuthorizer(client as never);
    const allowed = await authorizer.canMutateBoard(asBoardId(boardId), asUserId(userId));
    return allowed.ok && allowed.value;
  }

  return {
    userId: user.id,

    async listPages({ boardId, userId }) {
      if (!await requireRead(boardId, userId)) {
        return err(domainError('not_found', 'Wiki page was not found'));
      }
      const { data, error: listError } = await client
        .from('board_wiki_pages')
        .select('id, slug, title, sources, updated_at')
        .eq('board_id', boardId)
        .order('updated_at', { ascending: false });
      if (listError) return err(domainError('unavailable', 'Could not load the board wiki'));
      return ok((data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        slug: String(row.slug),
        title: String(row.title),
        updatedAt: String(row.updated_at),
        sourceCount: boardWikiPageSourcesFromStored(row.sources).length,
      })));
    },

    async readPage({ boardId, pageId, userId }) {
      if (!await requireRead(boardId, userId)) {
        return err(domainError('not_found', 'Wiki page was not found'));
      }
      const { data, error: readError } = await client
        .from('board_wiki_pages')
        .select(PAGE_COLUMNS)
        // THE PAGE MUST BELONG TO THE BOARD IN THE PATH, or the URL's board is
        // decoration and a reader of board A could address a page of board B.
        .eq('board_id', boardId)
        .eq('id', pageId)
        .maybeSingle();
      if (readError) return err(domainError('unavailable', 'Could not load the wiki page'));
      if (!data) return err(domainError('not_found', 'Wiki page was not found'));

      const page = pageFromRow(data as StoredPageRow);
      return ok({ page, currentVersions: await currentVersionsFor(client, boardId, page.sources) });
    },

    async createPage({ boardId, userId, title }) {
      if (!await requireWrite(boardId, userId)) {
        // Not "forbidden": a user who cannot write this board may not learn
        // whether it exists, and a viewer asking is already answered by the UI
        // not offering the control.
        return err(domainError('not_found', 'Wiki page was not found'));
      }
      const slug = boardWikiSlugFromTitle(title);
      if (slug === null) {
        return err(domainError('validation', 'That title cannot be used as a page address'));
      }
      const { data, error: insertError } = await client
        .from('board_wiki_pages')
        .insert({ board_id: boardId, slug, title, created_by: userId, updated_by: userId })
        .select(PAGE_COLUMNS)
        .maybeSingle();
      if (insertError) {
        // 23505 is the (board_id, slug) unique constraint: a page with this
        // name already exists. Reported as a conflict the user can act on by
        // renaming, never resolved by silently suffixing the address.
        const code = (insertError as { code?: unknown }).code;
        if (code === '23505') {
          return err(domainError('conflict', 'A page with this name already exists'));
        }
        return err(domainError('unavailable', 'Could not create the wiki page'));
      }
      if (!data) return err(domainError('unavailable', 'Could not create the wiki page'));
      return ok(pageFromRow(data as StoredPageRow));
    },

    async savePage({ boardId, pageId, userId, request }) {
      if (!await requireWrite(boardId, userId)) {
        return err(domainError('not_found', 'Wiki page was not found'));
      }

      // ===================================================================
      // THE SERVER OWNS EVERY SOURCE VERSION. THE BROWSER OWNS NONE.
      // ===================================================================
      //
      // The request carries identities. For each one, the version comes from
      // the STORED chain -- so an ordinary text edit cannot move a version, and
      // a page cannot declare itself fresh by saving. The chain is P1's
      // mitigation for compiling on lexical retrieval; a chain a page can
      // assert about itself would not be one.
      //
      // An identity that is NOT in the stored chain is dropped in this unit.
      // Nothing can legitimately produce one yet: proposals do not exist
      // server-side until Unit 3, which is also where the exact version of a
      // newly compiled source has to come from -- the stored proposal row,
      // never the request.
      const { data: existing, error: existingError } = await client
        .from('board_wiki_pages')
        .select('sources')
        .eq('board_id', boardId)
        .eq('id', pageId)
        .maybeSingle();
      if (existingError) return err(domainError('unavailable', 'Could not save the wiki page'));
      if (!existing) return err(domainError('not_found', 'Wiki page was not found'));

      const storedByIdentity = new Map(
        boardWikiPageSourcesFromStored((existing as { sources?: unknown }).sources)
          .map((source) => [boardAiCitationIdentityKey(source.item), source] as const),
      );
      const sources = request.sources
        .map((item) => storedByIdentity.get(boardAiCitationIdentityKey(item)))
        .filter((source): source is BoardWikiPageSource => source !== undefined);

      // OPTIMISTIC CONCURRENCY IN THE WHERE CLAUSE, not in a read-then-write.
      // A check followed by an update has a window between them; this has none
      // -- the row is updated only if it is still the row the draft started
      // from, and zero rows back means somebody else saved first.
      const { data, error: saveError } = await client
        .from('board_wiki_pages')
        .update({
          title: request.title,
          content: request.content,
          sources,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('board_id', boardId)
        .eq('id', pageId)
        .eq('updated_at', request.baseUpdatedAt)
        .select(PAGE_COLUMNS)
        .maybeSingle();

      if (saveError) return err(domainError('unavailable', 'Could not save the wiki page'));
      if (!data) {
        // Either the page moved or it is not visible. Both are told as a
        // conflict rather than a success, because the one thing that must never
        // happen is a save that reports OK while storing nothing.
        return err(domainError('conflict', 'This page changed while you were editing it'));
      }
      return ok(pageFromRow(data as StoredPageRow));
    },

    async deletePage({ boardId, pageId, userId }) {
      if (!await requireWrite(boardId, userId)) {
        return err(domainError('not_found', 'Wiki page was not found'));
      }

      // Board-scoped, like every other operation here: without the board
      // predicate the URL's board would be decoration and an editor of one
      // board could delete a page of another by addressing it through theirs.
      //
      // `select('id')` after the delete is what distinguishes "deleted" from
      // "there was nothing there". A delete that matched no row must not
      // report success -- the caller would believe a page they can still see
      // elsewhere is gone.
      const { data, error: deleteError } = await client
        .from('board_wiki_pages')
        .delete()
        .eq('board_id', boardId)
        .eq('id', pageId)
        .select('id')
        .maybeSingle();

      if (deleteError) return err(domainError('unavailable', 'Could not delete the wiki page'));
      if (!data) return err(domainError('not_found', 'Wiki page was not found'));
      return ok({ deleted: true as const });
    },
  };
}
