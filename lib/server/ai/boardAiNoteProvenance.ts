// Attaches a saved AI Note's provenance, server-side.
//
// SERVER ONLY.
//
// The browser chooses WHICH assistant answer becomes a Note. It does not get to
// say what that answer cited. Everything here is recovered from the stored,
// signed assistant message and from authoritative source text -- nothing the
// caller sends contributes provenance, and there is deliberately no parameter
// through which it could.

import {
  boardAiCitationsFromStored,
  type BoardAiCitationEnvelope,
} from '@/lib/domain/ai/boardAiChatCitation';
import { boardAiNoteEvidenceFromCitations } from '@/lib/domain/ai/boardAiNoteProvenance';
import { verifyBoardAiProvenanceProof } from './boardAiProvenanceProof';

/** The stored row, as the server reads it back within the user's own scope. */
export interface StoredAssistantMessage {
  readonly id: string;
  readonly threadId: string;
  readonly boardId: string;
  readonly role: string;
  readonly content: string;
  /** Raw JSONB, proof included. Never handed to the browser. */
  readonly citations: unknown;
}

/** One reference, exactly as the canonical write command wants it. */
export interface ProvenReferenceInput {
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly selectedText: string | null;
}

export type BoardAiNoteProvenanceFailure =
  | 'message_not_found'
  | 'not_assistant'
  | 'unsigned_or_forged'
  | 'source_unavailable'
  | 'span_unresolvable';

export type BoardAiNoteProvenanceResult =
  | {
    readonly ok: true;
    readonly references: readonly ProvenReferenceInput[];
    /**
     * Cited documents that no longer exist. Distinct from `references` being
     * short for any other reason, so a caller can say "two of the sources this
     * answer used have since been deleted" rather than silently showing fewer.
     */
    readonly missingSourceDocumentIds: readonly string[];
  }
  | { readonly ok: false; readonly reason: BoardAiNoteProvenanceFailure };

/** Reads the authoritative page text, or null when it cannot be read. */
export type AuthoritativePageTextReader = (
  sourceDocumentId: string,
  pageNumber: number,
) => Promise<string | null>;

/**
 * Does the cited document still exist for this reader?
 *
 * SEPARATE FROM `readPageText` ON PURPOSE. A null page text is ambiguous -- a
 * deleted document, a page that was never extracted and a page the reader may
 * not see all produce it -- and the three deserve different answers. This asks
 * the one question whose answer is unambiguous, so that "the source is gone"
 * can stop being reported as "this message could not be verified".
 */
export type CitedSourceExistenceReader = (
  sourceDocumentId: string,
) => Promise<boolean>;

/**
 * The proof-carrying half of a stored envelope.
 *
 * `boardAiCitationsFromStored` deliberately drops `proof` -- it is the BROWSER
 * projection, and the proof must never reach a browser. So the raw value is
 * read once here, server-side, purely to recover the signature.
 */
function storedProof(citations: unknown): unknown {
  if (!citations || typeof citations !== 'object' || Array.isArray(citations)) return null;
  return (citations as { proof?: unknown }).proof ?? null;
}

/**
 * The references a saved AI Note may truthfully carry.
 *
 * The order of checks is the security argument:
 *
 *   1. the row must be an assistant row in this user's own scope;
 *   2. its citations must carry a proof this server generated for THIS
 *      message, thread, board, content and citation list -- an envelope a user
 *      hand-wrote into their own thread has none, and one lifted from another
 *      message does not bind here;
 *   3. only then are the citations parsed, and only through the canonical
 *      sanitizing parser and the canonical reducer.
 *
 * For an exact span the quote is re-derived from the stored page rather than
 * trusted: the offsets are re-validated against the real text length and the
 * slice is taken server-side, which is also exactly what the write command
 * then re-checks. A span that cannot be re-materialized fails closed rather
 * than quietly becoming a page-only citation -- silently widening a citation
 * is a lie about what the answer used.
 *
 * An answer with no proven citations returns an empty list. That is a success:
 * the Note saves unsourced.
 *
 * A CITED SOURCE THAT NO LONGER EXISTS IS SKIPPED, NOT FATAL -- and that is a
 * different rule from the one above it, not a weakening of it. A reference the
 * write command REJECTS is still an integrity failure and still refuses the
 * whole Note; a forged or unsigned envelope is still a flat refusal. What
 * changed is that a document someone deleted afterwards is neither of those.
 * The answer citing it was true when it was written, and the only thing that
 * cannot be produced now is a link to a row that is gone. Failing the save
 * would tell the user their answer was untrustworthy because someone tidied up
 * a PDF -- which is both false and unactionable.
 *
 * `sourceExists` is OPTIONAL, and its absence means "nothing is known to be
 * gone": every citation is treated as live and the pre-existing failures stand.
 * A caller that cannot check must not get a silently more permissive result.
 */
export async function resolveProvenNoteReferences(
  message: StoredAssistantMessage | null,
  readPageText: AuthoritativePageTextReader,
  sourceExists?: CitedSourceExistenceReader,
): Promise<BoardAiNoteProvenanceResult> {
  if (!message) return { ok: false, reason: 'message_not_found' };
  if (message.role !== 'assistant') return { ok: false, reason: 'not_assistant' };

  // No citations at all is not a failure: the answer cited nothing.
  const sanitized: BoardAiCitationEnvelope | null = boardAiCitationsFromStored(message.citations);
  if (!sanitized || sanitized.items.length === 0) {
    return { ok: true, references: [], missingSourceDocumentIds: [] };
  }

  const verified = verifyBoardAiProvenanceProof(
    {
      messageId: message.id,
      threadId: message.threadId,
      boardId: message.boardId,
      content: message.content,
      citationItems: sanitized.items as unknown as readonly Record<string, unknown>[],
    },
    storedProof(message.citations),
  );
  // Unsigned (an older message, or one a user wrote themselves) and forged are
  // the same answer: no provenance. The Note may still be saved without any.
  if (!verified) return { ok: false, reason: 'unsigned_or_forged' };

  const evidence = boardAiNoteEvidenceFromCitations(sanitized);
  const references: ProvenReferenceInput[] = [];
  const missingSourceDocumentIds: string[] = [];
  // One answer commonly cites several pages of the SAME document, so the
  // existence question is asked once per document rather than once per page.
  const existenceByDocumentId = new Map<string, boolean>();

  async function documentStillExists(sourceDocumentId: string): Promise<boolean> {
    if (!sourceExists) return true;
    const cached = existenceByDocumentId.get(sourceDocumentId);
    if (cached !== undefined) return cached;
    let exists: boolean;
    try {
      exists = await sourceExists(sourceDocumentId);
    } catch {
      // A probe that could not answer must not be read as "gone". Treating an
      // outage as a deletion would quietly strip provenance from Notes for as
      // long as the outage lasted, and those Notes would look deliberately
      // unsourced afterwards.
      exists = true;
    }
    existenceByDocumentId.set(sourceDocumentId, exists);
    return exists;
  }

  for (const item of evidence) {
    if (!(await documentStillExists(item.sourceDocumentId))) {
      if (!missingSourceDocumentIds.includes(item.sourceDocumentId)) {
        missingSourceDocumentIds.push(item.sourceDocumentId);
      }
      continue;
    }

    if (item.charStart === null || item.charEnd === null) {
      // Page-level: the write command re-authorizes the page itself.
      references.push({
        sourceDocumentId: item.sourceDocumentId,
        pageStart: item.pageStart,
        pageEnd: item.pageEnd,
        quoteText: null,
        charStart: null,
        charEnd: null,
        selectedText: null,
      });
      continue;
    }

    const pageText = await readPageText(item.sourceDocumentId, item.pageStart);
    if (typeof pageText !== 'string') return { ok: false, reason: 'source_unavailable' };
    if (item.charStart < 0 || item.charEnd <= item.charStart) {
      return { ok: false, reason: 'span_unresolvable' };
    }
    if (item.charEnd > pageText.length) return { ok: false, reason: 'span_unresolvable' };

    // The server's own slice. The browser never supplied this string, and the
    // write command will slice the same page again and compare.
    const slice = pageText.slice(item.charStart, item.charEnd);
    if (slice.length === 0) return { ok: false, reason: 'span_unresolvable' };

    references.push({
      sourceDocumentId: item.sourceDocumentId,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      quoteText: null,
      charStart: item.charStart,
      charEnd: item.charEnd,
      selectedText: slice,
    });
  }

  return { ok: true, references, missingSourceDocumentIds };
}
