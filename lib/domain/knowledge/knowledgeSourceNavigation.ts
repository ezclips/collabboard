import type { SourceReference } from './knowledgePersistence';

/**
 * One request to open a Knowledge source at a page.
 *
 * `requestId` exists because the same source may be opened repeatedly: the
 * reader consumes a request at most once, so re-opening the same document needs
 * a genuinely new request rather than a re-delivered old one.
 *
 * Identity is `sourceDocumentId` and nothing else. Filenames are display text --
 * two sources can share one -- so they never decide which document opens.
 *
 * P6J-F6-B4-B4 adds `sourceReferenceId` as a NAVIGATION HINT, not a coordinate.
 * The reader already holds the same persisted rows in memory and already
 * resolves them through the B4-B1 resolver, so naming the row lets it scroll to
 * the span that resolver decided on. Copying the stored offsets here instead
 * would create a second, unresolved authority: a drifted row would then be
 * trusted at its stale numbers rather than recovered, and a row the resolver
 * refuses would still be navigated to.
 */
export interface KnowledgeSourceOpenRequest {
  readonly requestId: number;
  readonly sourceDocumentId: string;
  readonly sourceReferenceId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
}

/** `p. 3` for a single page, `pp. 3-5` for a span. */
export function knowledgeSourcePageLabel(pageStart: number, pageEnd: number): string {
  return pageEnd > pageStart ? `pp. ${pageStart}–${pageEnd}` : `p. ${pageStart}`;
}

/**
 * The card marker's text, or null when the Note has no provenance.
 *
 * A single reference names its page, because that is the useful part at a
 * glance. Several references only claim their count: pages would not fit a
 * narrow card and picking one to show would misrepresent the rest.
 */
export function knowledgeSourceCardLabel(
  references: readonly SourceReference[],
): string | null {
  if (references.length === 0) return null;
  if (references.length === 1) {
    const [only] = references;
    return `Source · ${knowledgeSourcePageLabel(only.pageStart, only.pageEnd)}`;
  }
  return `${references.length} sources`;
}

/**
 * The label for one clickable source control in the editor.
 *
 * Numbered only when there is more than one, so the common single-source Note
 * does not read as "Source 1" with no "Source 2" anywhere.
 */
export function knowledgeSourceEditorLabel(
  reference: SourceReference,
  index: number,
  total: number,
): string {
  const name = total > 1 ? `Source ${index + 1}` : 'Source';
  return `${name} · ${knowledgeSourcePageLabel(reference.pageStart, reference.pageEnd)}`;
}

/** Builds the open request for one reference. Pure: the caller owns the id. */
export function buildKnowledgeSourceOpenRequest(
  requestId: number,
  reference: SourceReference,
): KnowledgeSourceOpenRequest {
  return {
    requestId,
    sourceDocumentId: String(reference.sourceDocumentId),
    sourceReferenceId: String(reference.id),
    pageStart: reference.pageStart,
    pageEnd: reference.pageEnd,
  };
}
