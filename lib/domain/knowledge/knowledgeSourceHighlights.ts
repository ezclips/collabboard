import { resolveKnowledgeSourceSpan } from './knowledgeSourceSpanResolver';
import type { KnowledgeSourceSpanResolution } from './knowledgeSourceSpanResolver';
import type { SourceReference } from './knowledgePersistence';

/**
 * P6J-F6-B4-B3 -- turning stored citations into paintable ranges over ONE
 * rendered page.
 *
 * Pure derivation, read-time only. Nothing here loads, stores, corrects a
 * drifted offset, or reports an error: a citation either resolves to a span the
 * reader can paint, or it contributes no highlight at all and the page-level
 * "Used in Notes" rows remain its provenance.
 *
 * Coordinates stay exactly what B4-B1 froze: page-relative, UTF-16 code units,
 * half-open [start, end), addressable with `String.prototype.slice`.
 */

export interface KnowledgeSourceHighlightSpan {
  /** The real `source_references` row id -- stable rendering identity. */
  readonly referenceId: string;
  readonly targetPadletId: string;
  readonly start: number;
  readonly end: number;
  readonly resolution: KnowledgeSourceSpanResolution;
}

/**
 * One contiguous run of page text with the set of citations covering it. An
 * unhighlighted run carries no spans; an overlap carries every span that
 * covers it, so no citation is dropped in favour of another.
 */
export interface KnowledgeSourceHighlightSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly spans: readonly KnowledgeSourceHighlightSpan[];
}

const NO_SPANS: readonly KnowledgeSourceHighlightSpan[] = [];

/**
 * Rendering order, chosen rather than inherited: the caller's array order comes
 * from Map iteration over padlet buckets, which is insertion-dependent and must
 * never decide what the reader paints.
 */
function compareSpans(a: KnowledgeSourceHighlightSpan, b: KnowledgeSourceHighlightSpan): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  if (a.referenceId !== b.referenceId) return a.referenceId < b.referenceId ? -1 : 1;
  return 0;
}

/**
 * Every citation that resolves to a paintable span on this page.
 *
 * The B4-B1 resolver is the sole authority on what "exact" means. Nothing here
 * inspects charStart/charEnd, searches quoteText, or second-guesses a verdict:
 * `page_only`, `not_applicable` and every `drifted` reason simply produce no
 * span. That is what keeps a legacy row -- whose quoteText is the ENTIRE page --
 * from painting the whole page as a highlight.
 */
export function knowledgeSourceHighlightSpans(
  references: readonly SourceReference[],
  pageNumber: number,
  pageText: string,
): readonly KnowledgeSourceHighlightSpan[] {
  const spans: KnowledgeSourceHighlightSpan[] = [];
  for (const reference of references) {
    const resolved = resolveKnowledgeSourceSpan(reference, pageNumber, pageText);
    // Both resolutions paint: `quote_fallback` is display-time recovery of a
    // passage whose offsets moved, and it is never written back.
    if (resolved.kind !== 'exact_span') continue;
    spans.push({
      referenceId: String(reference.id),
      targetPadletId: String(reference.targetPadletId),
      start: resolved.start,
      end: resolved.end,
      resolution: resolved.resolution,
    });
  }
  // Sorts a locally built array; the caller's list is never touched.
  spans.sort(compareSpans);
  return spans.length > 0 ? spans : NO_SPANS;
}

/**
 * Partitions the page at every span boundary.
 *
 * Overlaps are the reason this exists. Painting each citation independently
 * would render the overlapping text once per citation -- duplicating it on
 * screen and, worse, moving every offset after it out from under B4-B2B's
 * capture. Splitting at the union of boundaries instead emits every character
 * exactly once, in order, with the full set of citations covering it:
 *
 *   A=[2,8) B=[5,11)  ->  [0,2) none | [2,5) A | [5,8) A+B | [8,11) B | [11,n) none
 *
 * Guaranteed for every input: `segments.map(s => s.text).join('') === pageText`.
 */
export function knowledgeSourceHighlightSegments(
  references: readonly SourceReference[],
  pageNumber: number,
  pageText: string,
): readonly KnowledgeSourceHighlightSegment[] {
  const spans = knowledgeSourceHighlightSpans(references, pageNumber, pageText);
  return knowledgeSourceHighlightSegmentsFromSpans(pageText, spans);
}

/** The segmentation alone, for a caller that already resolved its spans. */
export function knowledgeSourceHighlightSegmentsFromSpans(
  pageText: string,
  spans: readonly KnowledgeSourceHighlightSpan[],
): readonly KnowledgeSourceHighlightSegment[] {
  const cuts = knowledgeSourceHighlightBoundaries(pageText, spans);
  const segments: KnowledgeSourceHighlightSegment[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const start = cuts[index];
    const end = cuts[index + 1];
    // Every citation containing this whole run, in the sorted order above.
    const covering = spans.filter((span) => span.start <= start && end <= span.end);
    segments.push({
      start,
      end,
      text: pageText.slice(start, end),
      spans: covering.length > 0 ? covering : NO_SPANS,
    });
  }
  return segments;
}

/**
 * Ascending, deduplicated cut points: the page ends plus every span edge. An
 * empty page yields `[0]`, which produces no segments and still reconstructs to
 * the empty string.
 */
export function knowledgeSourceHighlightBoundaries(
  pageText: string,
  spans: readonly KnowledgeSourceHighlightSpan[],
): readonly number[] {
  const cuts = new Set<number>([0, pageText.length]);
  for (const span of spans) {
    // The resolver already bounds these; clamping would hide a contract break.
    if (span.start > 0 && span.start < pageText.length) cuts.add(span.start);
    if (span.end > 0 && span.end < pageText.length) cuts.add(span.end);
  }
  return [...cuts].sort((a, b) => a - b);
}
