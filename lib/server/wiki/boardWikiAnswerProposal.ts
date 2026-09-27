// PATCH-197. "Save to wiki": turning a verified Board AI answer into a wiki
// PROPOSAL. SERVER ONLY.
//
// THE PATTERN IS THE NOTE-PROVENANCE ROUTE, and it is copied for the same
// reason: the browser chooses WHICH answer, never WHAT it cited. The server
// reads the stored, signed assistant row itself, verifies its provenance, and
// derives the sources from the verified citations alone. A forged or unsigned
// row is refused; nothing the caller sends contributes a source.
//
// D6 (`.agent/wiki-query-plan.md`): a saved answer's sources are ONLY the raw
// passages it cited, and a wiki page is NEVER a source of a wiki page. That is
// the error-compounding guard -- one wrong answer must not become several wrong
// pages -- applied at write time, on top of the read-time guard PATCH-196
// already put on the compiler.

import {
  boardAiCitationIdentityKey,
  boardAiCitationsFromStored,
  parseBoardAiCitationFooter,
  type BoardAiCitationItem,
} from '../../domain/ai/boardAiChatCitation';
import { verifyBoardAiProvenanceProof } from '../ai/boardAiProvenanceProof';
import { readCurrentSourceVersions } from './boardWikiSourceVersions';
import type { BoardWikiPageSource, BoardWikiCurrentVersions } from '../../domain/wiki/boardWikiPageSources';
import type { BoardWikiProposal } from '../../domain/wiki/boardWikiEditing';

/**
 * The client this module reads and writes through, declared narrowly.
 *
 * It is the CALLER'S OWN client (for the message) plus the admin client's
 * version reader (injected). The shape is kept structural so a test can stub it
 * without a Supabase instance, exactly as the compile session does.
 */
export interface BoardWikiAnswerProposalClient {
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

/** The stored assistant row, as the caller's own client reads it back. */
export interface StoredAnswerRow {
  readonly id: string;
  readonly threadId: string;
  readonly boardId: string;
  readonly role: string;
  readonly content: string;
  readonly citations: unknown;
}

export interface BoardWikiAnswerProposalInput {
  readonly boardId: string;
  readonly pageId: string;
  readonly userId: string;
  /** The assistant message the answer came from. */
  readonly messageId: string;
  /** The page's current content, read by the caller for the baseline. */
  readonly pageContent: string;
  /** The stored assistant row, already scoped to this board and caller. */
  readonly message: StoredAnswerRow | null;
  /** The preceding user message's text, or null when there is none. */
  readonly question: string | null;
  /**
   * Writes the proposal row. Injected so the production path uses the SAME
   * writer the compile path does, and a test can stub it.
   */
  readonly writeProposal: (
    input: {
      readonly content: string;
      readonly sources: readonly BoardWikiPageSource[];
      readonly basedOnContent: string;
    },
  ) => Promise<BoardWikiProposal>;
  /**
   * The sources' versions RIGHT NOW, keyed by `boardAiCitationIdentityKey`.
   * Injected so the production path uses `readCurrentSourceVersions` and a test
   * can supply one directly.
   */
  readonly readVersions: (
    items: readonly BoardAiCitationItem[],
  ) => Promise<BoardWikiCurrentVersions>;
}

export type BoardWikiAnswerProposalFailure =
  | { readonly ok: false; readonly status: 404; readonly reason: 'message_not_found' }
  | { readonly ok: false; readonly status: 403; readonly reason: 'unsigned_or_forged' };

export type BoardWikiAnswerProposalResult =
  | { readonly ok: true; readonly proposal: BoardWikiProposal; readonly sourceCount: number }
  | BoardWikiAnswerProposalFailure;

/** At most this many characters of the question reach the heading. */
export const BOARD_WIKI_ANSWER_QUESTION_MAX = 120;

/**
 * The first line of a question, trimmed and bounded -- the section heading.
 *
 * A heading is one line: a multi-line question would put the rest of itself in
 * the page body, which is what the answer was for. A missing or empty question
 * (an answer with no preceding user turn) reads as "From Board AI".
 */
export function boardWikiAnswerHeading(question: string | null): string {
  const firstLine = (question ?? '').split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) return 'From Board AI';
  return firstLine.length > BOARD_WIKI_ANSWER_QUESTION_MAX
    ? `${firstLine.slice(0, BOARD_WIKI_ANSWER_QUESTION_MAX - 1)}…`
    : firstLine;
}

/**
 * The proposal's content: the page's CURRENT content, a blank line, then the
 * saved answer under a `## {question}` heading.
 *
 * The answer's visible text is recovered from the chat's OWN footer parser --
 * never a second implementation -- so the machine footer and citation line the
 * model wrote are removed exactly as they are for every other surface.
 */
export function boardWikiAnswerContent(pageContent: string, question: string | null, answer: string): string {
  const visible = parseBoardAiCitationFooter(answer).content;
  const heading = `## ${boardWikiAnswerHeading(question)}`;
  const base = pageContent.trimEnd();
  return base.length === 0 ? `${heading}\n\n${visible}` : `${base}\n\n${heading}\n\n${visible}`;
}

/**
 * The verified sources of an answer: its citations, MINUS every wiki page (D6),
 * de-duplicated by identity. Exported so the rule is testable on its own.
 */
export function boardWikiAnswerSources(citations: readonly BoardAiCitationItem[]): readonly BoardAiCitationItem[] {
  const seen = new Set<string>();
  const kept: BoardAiCitationItem[] = [];
  for (const item of citations) {
    // D6: A WIKI PAGE IS NEVER A SOURCE OF A WIKI PAGE. The error-compounding
    // step the plan forbids: an answer that cited a wiki page must not record
    // that page as provenance for the page it is filed into.
    if (item.type === 'wiki-page') continue;
    const key = boardAiCitationIdentityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

/**
 * Build the proposal for a saved answer, or refuse it.
 *
 * THE ORDER IS THE SECURITY ARGUMENT, the same one the note route makes:
 *   1. the row must be an assistant row (a user turn cites nothing);
 *   2. its citations must carry a proof this server generated for THIS message,
 *      thread, board, content and citation list -- a hand-written envelope has
 *      none, and one lifted from another message does not bind here;
 *   3. only then are the citations parsed, filtered (D6) and versioned.
 *
 * An answer that cited nothing is a SUCCESS with no sources, exactly as the
 * note route treats it -- the saved page is simply unsourced, and refusing it
 * would tell the user their answer was untrustworthy for citing nothing.
 */
export async function buildBoardWikiAnswerProposal(
  input: BoardWikiAnswerProposalInput,
): Promise<BoardWikiAnswerProposalResult> {
  const message = input.message;
  if (!message || message.role !== 'assistant') {
    return { ok: false, status: 404, reason: 'message_not_found' };
  }

  // No citations at all is not a failure: the answer cited nothing.
  const sanitized = boardAiCitationsFromStored(message.citations);
  const items = sanitized?.items ?? [];

  if (items.length > 0) {
    const proof = (message.citations as { proof?: unknown } | null)?.proof ?? null;
    const verified = verifyBoardAiProvenanceProof(
      {
        messageId: message.id,
        threadId: message.threadId,
        boardId: message.boardId,
        content: message.content,
        citationItems: items as unknown as readonly Record<string, unknown>[],
      },
      proof,
    );
    // A forged or unsigned envelope is the flat refusal, exactly as the note
    // route treats it. There is deliberately no fallback to unverified items.
    if (!verified) return { ok: false, status: 403, reason: 'unsigned_or_forged' };
  }

  const sources = boardWikiAnswerSources(items);
  const versions = sources.length > 0 ? await input.readVersions(sources) : new Map();
  const chain: BoardWikiPageSource[] = sources.map((item) => ({
    item,
    // Every source must have a version at this moment; one that does not is a
    // source that vanished between verification and here, and recording it with
    // no version would make the page read stale forever with nothing to point
    // at. It is dropped, exactly as the compile path refuses to guess.
    version: versions.get(boardAiCitationIdentityKey(item)),
  })).filter((source): source is BoardWikiPageSource => source.version !== undefined);

  const content = boardWikiAnswerContent(input.pageContent, input.question, message.content);
  const proposal = await input.writeProposal({
    content,
    sources: chain,
    // Exactly as compile records it: the page's current content at the moment
    // the proposal is made.
    basedOnContent: input.pageContent,
  });

  return { ok: true, proposal, sourceCount: chain.length };
}
