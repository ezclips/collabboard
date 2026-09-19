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
import { readCurrentSourceVersions } from './boardWikiSourceVersions';
import { compileBoardWikiProposal } from './boardWikiCompileSession';
import { createBoardAiSearchReader } from '../../infra/ai/boardAiSearchReader';
import { createAIRolePreferenceRepository } from '../../infra/settings/aiRolePreferenceRepository';
import { createAIProviderCredentialRepository } from '../../infra/settings/aiProviderCredentialRepository';
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

    /**
     * Every page of one board, for an OKF export.
     *
     * A READ, through the caller's own client like everything else here, with
     * the same `requireRead` gate a single page uses -- so a viewer can export
     * exactly what a viewer can already read, and a non-member learns nothing.
     *
     * It reads `updated_by` and `created_at`, which the page reader does not,
     * because OKF's `verified` block names WHO accepted the page. That is the
     * only field a human save has left behind, and it is the only honest
     * source for a trust tier.
     */
    async exportPages({ boardId, userId }) {
      if (!await requireRead(boardId, userId)) {
        return err(domainError('not_found', 'Wiki page was not found'));
      }
      const { data, error: exportError } = await client
        .from('board_wiki_pages')
        .select('slug, title, content, sources, compiled_at, updated_at, updated_by')
        .eq('board_id', boardId)
        .order('slug', { ascending: true });
      if (exportError) return err(domainError('unavailable', 'Could not load the board wiki'));
      return ok((data ?? []).map((row: Record<string, unknown>) => ({
        slug: String(row.slug ?? ''),
        title: String(row.title ?? ''),
        content: typeof row.content === 'string' ? row.content : '',
        sources: boardWikiPageSourcesFromStored(row.sources),
        compiledAt: typeof row.compiled_at === 'string' ? row.compiled_at : null,
        updatedAt: String(row.updated_at ?? ''),
        updatedBy: typeof row.updated_by === 'string' ? row.updated_by : null,
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
      return ok({
        page,
        currentVersions: await readCurrentSourceVersions(
          client as never,
          boardId,
          page.sources.map((source) => source.item),
        ),
      });
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

      // ===================================================================
      // AN APPLIED PROPOSAL DECIDES EVERY VERSION IT CARRIES
      // ===================================================================
      //
      // The first version of this let proposal rows fill only identities the
      // page had NEVER held, so the page's own version always won. That made a
      // stale page impossible to refresh: source moves A -> B, the recompile
      // records B correctly, the save keeps A because the identity is already
      // there, and the reader says stale again -- permanently, because this is
      // the only writer of a page's sources. The refresh loop could not close.
      //
      // So when the request names the proposal it was applied from, THAT row is
      // the authority for every identity it carries, and the stored page fills
      // only what it does not. The row was written by this server at compile
      // time; the browser supplies a reference to it and never a version.
      //
      // WHY NOT "THE NEWEST PROPOSAL WINS": a pending proposal nobody applied
      // would freshen a page still derived from the older source -- laundering
      // a stale page clean through an ordinary text edit. Only an apply sets
      // the reference, so only an apply can move a version.
      if (request.appliedProposalId) {
        const { data: applied } = await client
          .from('board_wiki_page_proposals')
          .select('sources')
          // Scoped to this page and board: a proposal id from somewhere else
          // resolves to nothing rather than to another page's versions.
          .eq('board_id', boardId)
          .eq('page_id', pageId)
          .eq('id', request.appliedProposalId)
          .maybeSingle();
        // A reference that resolves to nothing falls back to the stored page
        // rather than failing the save. The row can legitimately be gone -- a
        // later compile clears superseded proposals -- and losing someone's
        // text over a missing version is far worse than saving it with the
        // conservative versions, which reads as stale and can be refreshed.
        for (const source of boardWikiPageSourcesFromStored((applied as { sources?: unknown } | null)?.sources)) {
          storedByIdentity.set(boardAiCitationIdentityKey(source.item), source);
        }
      }

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
          // STAMPED WHEN THE SAVE CARRIES AN APPLIED-PROPOSAL REFERENCE -- on
          // the REFERENCE, deliberately, not on the row resolving.
          //
          // The two differ in exactly one case and it is a legitimate one:
          // apply P1, recompile (which deletes P1), then save. No row is left
          // to resolve, but a compilation really did reach this page, and
          // stamping only on resolution would silently under-report that. The
          // cost is that a forged id can stamp a metadata column on a page the
          // caller can already edit -- it moves no version, since those still
          // come off a row that must exist -- which is the acceptable side of
          // the trade.
          //
          // The value is the server's clock and is never sent. The
          // column had no writer at all until now, so a compiled page reported
          // "compiled: false", which is a lie the moment anything renders "last
          // compiled". A plain text edit leaves it untouched: the page's
          // content is then no longer what the compilation produced, and the
          // stamp answers "when did a compilation last reach this page", not
          // "when was this page last saved" -- `updated_at` already answers
          // that one.
          ...(request.appliedProposalId ? { compiled_at: new Date().toISOString() } : {}),
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

    async compilePage({ boardId, pageId, userId, topic }) {
      // WRITE PERMISSION, not read. A compilation writes a proposal row and
      // spends provider tokens, so a viewer -- who may read every page and its
      // chain -- may not start one.
      if (!await requireWrite(boardId, userId)) {
        return err(domainError('not_found', 'Wiki page was not found'));
      }
      return compileBoardWikiProposal(
        client as never,
        {
          searchReader: createBoardAiSearchReader(),
          // The SAME repositories the chat route builds. A compilation resolves
          // the user's own Board Chat choice, so it must read the preference
          // and the credential through the one path that already knows how.
          resolverDeps: {
            preferences: createAIRolePreferenceRepository(),
            credentials: createAIProviderCredentialRepository(),
          },
        },
        { boardId, pageId, userId, topic },
      );
    },
  };
}
