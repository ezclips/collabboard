import { asUserId } from '../../domain/core/ids';
import { AI_ROLE_CHAT } from '../../ai/aiRoles';
import { AI_CREDIT_COSTS } from '../../domain/billing/plans';
import {
  boardAiCitationIdentityKey,
  boardAiCitationItemFromPassage,
} from '../../domain/ai/boardAiChatCitation';
import type { BoardAiCitationItem } from '../../domain/ai/boardAiChatCitation';
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
import type { BoardWikiCompilationResult } from '../ai/boardWikiCompilation';
import {
  checkBoardAiCredits,
  recordBoardAiCreditUsage,
  type ManagedAiCreditDecision,
} from '../billing/aiCredits';
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
  /**
   * PATCH-187. The AI credit ledger, injected so a test can observe the decision
   * and the charge. Production defaults to the real ledger.
   *
   * THE CHECK LIVES HERE, next to the only place the model source is resolved,
   * rather than in the route: the route cannot know whether the call that will
   * run is managed, and a byok caller must never read the ledger.
   */
  readonly credits?: BoardWikiCompileCreditDeps;
}

/** The two ledger operations the compile needs. */
export interface BoardWikiCompileCreditDeps {
  readonly checkBoardAiCredits: typeof checkBoardAiCredits;
  readonly recordBoardAiCreditUsage: typeof recordBoardAiCreditUsage;
}

const DEFAULT_CREDIT_DEPS: BoardWikiCompileCreditDeps = {
  checkBoardAiCredits,
  recordBoardAiCreditUsage,
};

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
    delete(): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          neq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }>;
        };
      };
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

  // THE SAME RULE THE CHAT CITES BY, not a second copy of it.
  //
  // This used to build its own item, and the copy had fallen behind: a
  // PAGELESS passage became a knowledge-page with no page number, so every
  // passage of one text source shared a single citation identity and pointed
  // at a page that does not exist. Two spellings of one rule meant one of them
  // was always going to be the old one.
  //
  // A passage that cannot form a truthful citation yields null and ABORTS the
  // compile below, for the same reason an unversionable one does: a wiki page
  // whose references are partly guesses is worse than no page.
  const tokenedItems: { token: string; item: BoardAiCitationItem }[] = [];
  for (const { token, passage } of boardWikiPassageTokens(0, passages)) {
    const item = boardAiCitationItemFromPassage(passage);
    if (item === null) {
      return err(domainError(
        'conflict',
        'One of the passages for this topic cannot be cited, so this page was not compiled',
      ));
    }
    tokenedItems.push({ token, item });
  }

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

  // PATCH-187. AI CREDITS. After authorization and before the model call: the
  // board owner's plan pays for a wiki compile (10 credits). A byok caller never
  // reads the ledger. A check that throws fails closed.
  const credits = deps.credits ?? DEFAULT_CREDIT_DEPS;
  let creditDecision: ManagedAiCreditDecision;
  try {
    creditDecision = await credits.checkBoardAiCredits({
      boardId: input.boardId,
      userId: input.userId,
      role: AI_ROLE_CHAT,
      cost: AI_CREDIT_COSTS.wiki_compile,
      now: new Date(),
      preferences: deps.resolverDeps.preferences,
    });
  } catch {
    return err(domainError('unavailable', 'The compilation could not be completed'));
  }
  if (creditDecision.kind === 'refused') {
    // The route maps `quota_exceeded` to 402 with the plan-limit code it carries.
    return err(domainError('quota_exceeded', creditDecision.body.error, {
      details: { planLimitCode: creditDecision.body.code },
    }));
  }

  let generated: BoardWikiCompilationResult;
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

  // SUPERSEDED PROPOSALS ARE DELETED, which is the lifecycle Unit 1's migration
  // already declared -- "a superseded proposal is deleted and a new one
  // inserted" -- and which nothing implemented, so rows accumulated silently
  // (the first live page had two within minutes).
  //
  // AFTER the insert, never before: a failed compile must leave the proposal
  // the user already has. Scoped to this page, and excluding the row just
  // written.
  //
  // A save naming a now-deleted proposal falls back to the stored page's
  // versions rather than failing -- see `savePage`. That is the narrow cost of
  // clearing them, and it is conservative in the right direction: the page
  // reads stale and can be refreshed, rather than losing text.
  const insertedId = String((inserted as { id?: unknown }).id ?? '');
  await client
    .from('board_wiki_page_proposals')
    .delete()
    .eq('board_id', input.boardId)
    .eq('page_id', input.pageId)
    .neq('id', insertedId);

  // PATCH-187. Charged only after the proposal is accepted and stored, only for
  // a managed run, and only when the check said to charge. A recording failure
  // must not lose the proposal the user is about to see.
  if (
    creditDecision.kind === 'allowed'
    && creditDecision.charge
    && generated.source === 'collabboard-default'
  ) {
    try {
      await credits.recordBoardAiCreditUsage({
        plan: creditDecision.plan,
        balance: creditDecision.balance,
        boardId: input.boardId,
        userId: input.userId,
        feature: 'wiki_compile',
        credits: AI_CREDIT_COSTS.wiki_compile,
      });
    } catch {
      console.error('AI credit usage was not recorded', {
        boardId: input.boardId,
        feature: 'wiki_compile',
        credits: AI_CREDIT_COSTS.wiki_compile,
      });
    }
  }

  return ok({
    id: String((inserted as { id?: unknown }).id ?? ''),
    content: reading.value.content,
    sources: reading.value.sources,
    basedOnContent,
    createdAt: String((inserted as { created_at?: unknown }).created_at ?? ''),
  });
}
