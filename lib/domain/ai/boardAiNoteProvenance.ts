import {
  boardAiCitationIdentityKey,
  type BoardAiCitationEnvelope,
  type BoardAiCitationItem,
} from './boardAiChatCitation';

/**
 * What an AI answer may claim as its sources when it becomes a Note.
 *
 * CONTEXT IS NOT PROVENANCE.
 *
 * The old rule walked back from the assistant message to the preceding user
 * message and used whatever PDF context it found there. That answered a
 * different question -- "what was the model shown?" -- and so it attributed a
 * Note to a source the answer may never have used, attached exactly one source
 * however many were used, and flattened an exact selection to its page number
 * on the way.
 *
 * The authority is the server's own validated citation envelope: the set the
 * citation pipeline already mapped from model-returned opaque tokens back to
 * authorized context blocks, dropping anything it could not vouch for. A
 * source that is merely in context and never cited is not evidence. An answer
 * that cited nothing has no evidence, and saves unsourced -- it does not fall
 * back to the reader's current document, page or selection.
 *
 * Nothing here reconstructs provenance. Every field is copied from what the
 * server already validated, or omitted.
 */

/**
 * One citation, in the shape `source_references` can actually store.
 *
 * `pageStart`/`pageEnd` are required by the write authority (integers >= 1),
 * which is why a document-level citation cannot become one of these at all --
 * see `boardAiNoteEvidenceFromCitations`.
 */
export interface BoardAiNoteEvidence {
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly charStart: number | null;
  readonly charEnd: number | null;
}

function isPage(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/** An exact span, only when BOTH offsets are present and ordered. */
function spanOf(item: BoardAiCitationItem): { charStart: number; charEnd: number } | null {
  const { charStart, charEnd } = item;
  if (typeof charStart !== 'number' || typeof charEnd !== 'number') return null;
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  if (charStart < 0 || charEnd <= charStart) return null;
  return { charStart, charEnd };
}

/** `doc:page`, the identity a page-only citation and a span on it share. */
function pageKey(evidence: BoardAiNoteEvidence): string {
  return `${evidence.sourceDocumentId}:${evidence.pageStart}:${evidence.pageEnd}`;
}

/**
 * The canonical supporting evidence for one saved assistant answer.
 *
 * Takes the stored, already-sanitized citation envelope and keeps only what a
 * `source_reference` can truthfully hold:
 *
 *   knowledge-selection -> document + page + the exact span, when the envelope
 *                          carries one. The span is the highest provenance we
 *                          have and is never dropped to make the row simpler.
 *   knowledge-page      -> document + page.
 *   knowledge-document  -> NOTHING. The write authority requires a page, and
 *                          this citation has none; inventing page 1 would be a
 *                          fabricated location. It is excluded rather than
 *                          degraded, so the Note is honest about what it can
 *                          point at.
 *   padlet              -> NOTHING. A board post is not a document source.
 *
 * De-duplication keeps precision. Two pages of one document are two pieces of
 * evidence; two distinct spans on one page are also two. What collapses is
 * only genuinely the same location: the same citation twice, and a page-only
 * citation of a page that a span already covers more precisely.
 */
export function boardAiNoteEvidenceFromCitations(
  envelope: BoardAiCitationEnvelope | null | undefined,
): readonly BoardAiNoteEvidence[] {
  const items = envelope?.items ?? [];
  const evidence: BoardAiNoteEvidence[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (item.type !== 'knowledge-page' && item.type !== 'knowledge-selection') continue;
    if (typeof item.knowledgeDocumentId !== 'string' || item.knowledgeDocumentId.length === 0) continue;
    if (!isPage(item.pageNumber)) continue;

    // The server's own identity for this citation: the same key it de-duplicates
    // by, so "cited twice" cannot become two references.
    const key = boardAiCitationIdentityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);

    const span = item.type === 'knowledge-selection' ? spanOf(item) : null;
    evidence.push({
      sourceDocumentId: item.knowledgeDocumentId,
      pageStart: item.pageNumber,
      pageEnd: item.pageNumber,
      charStart: span ? span.charStart : null,
      charEnd: span ? span.charEnd : null,
    });
  }

  // A page-only citation of a page some span already pins is the same evidence
  // said less precisely. Keep the span.
  const pagesWithSpan = new Set(
    evidence.filter((entry) => entry.charStart !== null).map(pageKey),
  );
  return evidence.filter((entry) => entry.charStart !== null || !pagesWithSpan.has(pageKey(entry)));
}
