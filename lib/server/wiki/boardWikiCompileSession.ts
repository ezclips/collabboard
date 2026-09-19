import { asUserId } from '../../domain/core/ids';
import { boardAiCitationIdentityKey } from '../../domain/ai/boardAiChatCitation';
import { readCurrentSourceVersions } from './boardWikiSourceVersions';
import { domainError, type DomainError } from '../../domain/core/errors';
import { err, ok, type Result } from '../../domain/core/result';
import { BOARD_AI_CONTEXT_MAX_TOTAL_CHARS } from '../../domain/ai/boardAiChatContext';
import {
  readBoardWikiCompilation,
  type BoardWikiCompiledPassage,
} from '../../domain/wiki/boardWikiCompiledPage';
import type { BoardWikiProposal } from '../../domain/wiki/boardWikiEditing';
import { searchBoardAiContext } from '../ai/boardAiChatSearch';
import {
  boardWikiPassageTokens,
  executeBoardWikiCompilation,
} from '../ai/boardWikiCompilation';
import type { AIModelResolverDeps } from '../ai/resolveAIModelForRole';
import type { BoardAiSearchReader } from '../ai/boardAiChatSearch';

/**
 * Compiling a proposal for one wiki page.
 *
 * ===========================================================================
 * THIS FUNCTION CAN WRITE A PROPOSAL AND NOTHING ELSE
 * ===========================================================================
 *
 * It is handed no way to touch `board_wiki_pages`: the page is READ here, for
 * `based_on_content`, and the only insert below targets the proposals table.
 * P3's guarantee -- recompilation proposes and never overwrites -- is therefore
 * a property of what this function is able to do, not of how carefully it is
 * called.
 *
 * ===========================================================================
 * RETRIEVAL IS REUSED WHOLE, INCLUDING ITS ORDER OF OPERATIONS
 * ===========================================================================
 *
 * `searchBoardAiContext` authorizes through the CALLER'S OWN client before it
 * touches the privileged reader. Reimplementing retrieval here -- even
 * "simplified" -- would be a second path that has to get that order right, and
 * the whole point of the invariant is that there is one.
 *
 * The passages it returns carry the same `S{n}.{i}` sub-tokens the chat
 * citation layer resolves, so the compiler names sources in a grammar that
 * already exists and the server maps every token back to a passage it actually
 * handed over. A model still cannot write identity.
 */

export interface BoardWikiCompileDependencies {
  readonly searchReader: BoardAiSearchReader;
  readonly resolverDeps: AIModelResolverDeps;
}

/**
 * The Supabase client, as this module uses it.
 *
 * Declared rather than imported: intersecting the search helper's own narrow
 * client type (whose `from` accepts only `'boards'`) with the tables read here
 * produces an unsatisfiable overload set. The two casts below are the same
 * generic-instantiation workaround the knowledge adapters already use, and they
 * widen nothing at runtime -- it is one client object throughout.
 */
interface CompileClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
      };
    };
    insert(row: Record<string, unknown>): {
      select(columns: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
}

/**
 * Why a compile can fail in a way worth naming.
 *
 * `conflict` is the rejected-compilation case: the model produced something
 * that is not usable as a page -- truncated, unattributed, or citing a passage
 * it was never given. It is NOT an outage and NOT the user's fault, and it must
 * not be reported as either: the honest answer is "that did not produce a page
 * worth proposing, try again", and trying again is cheap.
 */
export async function compileBoardWikiProposal(
  client: CompileClient,
  deps: BoardWikiCompileDependencies,
  input: {
    readonly boardId: string;
    readonly pageId: string;
    readonly userId: string;
    readonly topic: string;
  },
): Promise<Result<BoardWikiProposal, DomainError>> {
  // The page, for the baseline a diff is shown against. Board-scoped like every
  // other read here; RLS applies on top.
  const { data: pageRow, error: pageError } = await client
    .from('board_wiki_pages')
    .select('id, content')
    .eq('board_id', input.boardId)
    .eq('id', input.pageId)
    .maybeSingle();
  if (pageError) return err(domainError('unavailable', 'Could not load the wiki page'));
  if (!pageRow) return err(domainError('not_found', 'Wiki page was not found'));
  const basedOnContent = typeof (pageRow as { content?: unknown }).content === 'string'
    ? (pageRow as { content: string }).content
    : '';

  // THE REAL RETRIEVAL, at block index 0 -- a compilation has no attachments in
  // front of it, so the search block is the first and its passages are S1.n.
  const searched = await searchBoardAiContext(
    client as never,
    deps.searchReader,
    input.boardId,
    input.userId,
    input.topic,
    BOARD_AI_CONTEXT_MAX_TOTAL_CHARS,
    { padletIds: new Set(), documentPages: new Set() },
    0,
  );
  if (!searched.ok) return err(searched.error);

  const { block } = searched.value;
  const passages = block.passages ?? [];
  if (passages.length === 0) {
    // Nothing to compile from is not an error condition to retry into; it is an
    // answer about the board.
    return err(domainError('not_found', 'Nothing on this board matches that topic'));
  }

  const tokenedItems = boardWikiPassageTokens(0, passages).map(({ token, passage }) => ({
    token,
    item: passage.padletId !== undefined
      ? { type: 'padlet' as const, padletId: passage.padletId, label: passage.label }
      : {
        type: 'knowledge-page' as const,
        knowledgeDocumentId: String(passage.knowledgeDocumentId),
        // The passage demonstrably BEGINS at pageStart; it is located, not
        // invented. Same decision the chat citation path records.
        ...(passage.pageStart === undefined ? {} : { pageNumber: passage.pageStart }),
        label: passage.label,
      },
  }));

  // THE COMPILE-TIME VERSION IS READ, NEVER INVENTED. At the moment of
  // compilation the source's CURRENT version is its compile-time version, and
  // this is the same function the read path compares against later -- so a page
  // compiled now reads as `current` until its source actually moves. A
  // placeholder here would make every compiled page permanently stale, and
  // nothing would point at why.
  const versions = await readCurrentSourceVersions(
    client as never,
    input.boardId,
    tokenedItems.map(({ item }) => item),
  );
  const tokened: BoardWikiCompiledPassage[] = [];
  for (const { token, item } of tokenedItems) {
    const version = versions.get(boardAiCitationIdentityKey(item));
    // AN UNVERSIONABLE PASSAGE ABORTS THE COMPILE RATHER THAN BEING DROPPED.
    // Dropping one would desync the token map from the text the model is
    // actually shown -- `block.text` still numbers every passage -- so a
    // legitimate citation to the dropped passage would read as INVENTED and
    // reject the whole page, with the log pointing at the model rather than at
    // us. It takes a source disappearing between retrieval and this line, which
    // is rare and is not a reason to guess.
    if (!version) return err(domainError('unavailable', 'A source changed while the page was compiling'));
    tokened.push({ token, item, version });
  }

  let generated: { text: string };
  try {
    generated = await executeBoardWikiCompilation(
      asUserId(input.userId),
      input.topic,
      block.text,
      deps.resolverDeps,
    );
  } catch {
    // Includes the timeout abort. No provider detail travels outward.
    return err(domainError('unavailable', 'The compilation could not be completed'));
  }

  const reading = readBoardWikiCompilation(generated.text, tokened);
  if (!reading.ok) {
    return err(domainError('conflict', `The compilation was rejected: ${reading.reason}`));
  }
  if (reading.value.declined) {
    // The licensed refusal. A correct outcome and not a page: proposing it
    // would offer to replace someone's work with a sentence saying there is
    // nothing to say.
    return err(domainError('not_found', 'The board does not cover that topic'));
  }

  // STORED BEFORE IT IS OFFERED, and this is the carry Unit 2 left open: when
  // the user applies this proposal and saves, the save carries source
  // IDENTITIES and no versions, and the server resolves each new source's
  // compile-time version from THIS ROW. Returning the proposal without storing
  // it would leave the browser holding the only copy of a version the server
  // would later have to take its word for.
  const { data: inserted, error: insertError } = await client
    .from('board_wiki_page_proposals')
    .insert({
      page_id: input.pageId,
      board_id: input.boardId,
      content: reading.value.content,
      sources: reading.value.sources,
      based_on_content: basedOnContent,
      created_by: input.userId,
    })
    .select('id, created_at')
    .maybeSingle();
  if (insertError || !inserted) {
    return err(domainError('unavailable', 'The compilation could not be saved'));
  }

  return ok({
    id: String((inserted as { id?: unknown }).id ?? ''),
    content: reading.value.content,
    sources: reading.value.sources,
    basedOnContent,
    createdAt: String((inserted as { created_at?: unknown }).created_at ?? ''),
  });
}
