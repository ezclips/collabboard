import type { KnowledgeSourceHighlight } from './knowledgeSourceHighlight';
import type { SourceReference } from './knowledgePersistence';

/**
 * PDF-R6K-H2B-C1 -- the board's standalone highlights, keyed by document.
 *
 * Shaped like the source-reference index for the same reason that one exists:
 * the board's owner loads once and the reader reads a projection, so there is
 * no second fetch, no module cache and no per-highlight request. A surface
 * outside the provider reads as "no highlights", which is exactly what a board
 * with none looks like.
 */
export type KnowledgeStandaloneHighlightIndex =
  ReadonlyMap<string, readonly KnowledgeSourceHighlight[]>;

export const EMPTY_KNOWLEDGE_STANDALONE_HIGHLIGHT_INDEX: KnowledgeStandaloneHighlightIndex =
  new Map();

const NO_HIGHLIGHTS: readonly KnowledgeSourceHighlight[] = [];

/** Stable ordering, so the reader never depends on fetch order. */
export function compareKnowledgeStandaloneHighlights(
  a: KnowledgeSourceHighlight,
  b: KnowledgeSourceHighlight,
): number {
  if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
  if (a.charStart !== b.charStart) return a.charStart - b.charStart;
  if (a.charEnd !== b.charEnd) return a.charEnd - b.charEnd;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

/** Groups rows by document, ordered. The input array is never mutated. */
export function knowledgeStandaloneHighlightIndexOf(
  highlights: readonly KnowledgeSourceHighlight[],
): KnowledgeStandaloneHighlightIndex {
  const index = new Map<string, KnowledgeSourceHighlight[]>();
  for (const highlight of highlights) {
    const key = String(highlight.sourceDocumentId);
    const bucket = index.get(key);
    if (bucket) bucket.push(highlight);
    else index.set(key, [highlight]);
  }
  for (const bucket of index.values()) bucket.sort(compareKnowledgeStandaloneHighlights);
  return index;
}

export function knowledgeStandaloneHighlightsFor(
  index: KnowledgeStandaloneHighlightIndex,
  documentId: string | null | undefined,
): readonly KnowledgeSourceHighlight[] {
  if (!documentId) return NO_HIGHLIGHTS;
  return index.get(documentId) ?? NO_HIGHLIGHTS;
}

/**
 * The Note each highlight can offer to open, derived rather than stored.
 *
 * `target_padlet_id` is deliberately NOT denormalised onto the highlight row:
 * that would be a second copy of a relation the citation already owns, and it
 * would go stale the moment a Note is deleted. The map is built from the
 * citations the board has ALREADY loaded, so a highlight whose origin citation
 * is gone -- or which never had one -- simply has no entry, and the contextual
 * control offers no Open Note for it.
 */
export function knowledgeHighlightNoteTargets(
  references: readonly SourceReference[],
): ReadonlyMap<string, string> {
  const byReference = new Map<string, string>();
  for (const reference of references) {
    byReference.set(String(reference.id), String(reference.targetPadletId));
  }
  return byReference;
}

/**
 * The Note this highlight may open, or null.
 *
 * Null covers all three cases that must NOT offer an Open Note: a plain
 * highlight created without a citation, an orphan whose citation was deleted
 * (source_reference_id set to NULL), and a citation the board can no longer
 * see. They are indistinguishable here on purpose -- each means "there is no
 * live Note behind this mark".
 */
export function knowledgeHighlightNoteTarget(
  highlight: Pick<KnowledgeSourceHighlight, 'sourceReferenceId'>,
  targets: ReadonlyMap<string, string>,
): string | null {
  if (highlight.sourceReferenceId === null) return null;
  return targets.get(String(highlight.sourceReferenceId)) ?? null;
}
