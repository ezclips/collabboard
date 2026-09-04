import type { KnowledgeSourceHighlight } from './knowledgeSourceHighlight';
import { knowledgeSourceHighlightSpanReference } from './knowledgeSourceHighlight';
import { knowledgeTextSpanSegments } from './knowledgeSourceHighlights';
import type { KnowledgeTextSpanSegment } from './knowledgeSourceHighlights';
import { resolveKnowledgeSourceSpan } from './knowledgeSourceSpanResolver';
import type { KnowledgeSourceSpanResolution } from './knowledgeSourceSpanResolver';

/**
 * PDF-R6K-H2B -- turning STANDALONE highlight rows into paintable runs.
 *
 * This replaces citations as the visual authority. The shape of the work is
 * deliberately identical to what citations used to do -- resolve each row's
 * span against the rendered page, then partition the page at every boundary --
 * because the reader's overlap behaviour must not change just because the rows
 * come from a different table. The resolver and the segmenter are the same ones
 * as before, imported rather than reimplemented.
 *
 * What DOES change: every painted run now carries the durable ids of the
 * highlights covering it, which is what makes a precise delete possible at all,
 * and the colour comes from the highlight rather than from a Note.
 */

export interface KnowledgeStandaloneHighlightSpan {
  /** The real `knowledge_source_highlights` row id -- the delete target. */
  readonly highlightId: string;
  readonly color: string;
  readonly start: number;
  readonly end: number;
  readonly resolution: KnowledgeSourceSpanResolution;
}

export type KnowledgeStandaloneHighlightSegment =
  KnowledgeTextSpanSegment<KnowledgeStandaloneHighlightSpan>;

/**
 * Rendering order, chosen rather than inherited: a caller's array order comes
 * from a fetch and must never decide what the reader paints or which id a
 * disambiguation popover lists first.
 */
function compareSpans(
  a: KnowledgeStandaloneHighlightSpan,
  b: KnowledgeStandaloneHighlightSpan,
): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  if (a.highlightId !== b.highlightId) return a.highlightId < b.highlightId ? -1 : 1;
  return 0;
}

/**
 * Every standalone highlight that resolves to a paintable span on this page.
 *
 * The span resolver is the sole authority on what "exact" means, exactly as it
 * is for citations: a row whose offsets have drifted is recovered by its quote,
 * and a row that cannot be resolved at all paints nothing rather than painting
 * the wrong passage.
 */
export function knowledgeStandaloneHighlightSpans(
  highlights: readonly KnowledgeSourceHighlight[],
  pageNumber: number,
  pageText: string,
): readonly KnowledgeStandaloneHighlightSpan[] {
  const spans: KnowledgeStandaloneHighlightSpan[] = [];
  for (const highlight of highlights) {
    if (highlight.pageNumber !== pageNumber) continue;
    const resolved = resolveKnowledgeSourceSpan(
      knowledgeSourceHighlightSpanReference(highlight), pageNumber, pageText,
    );
    // `quote_fallback` paints too: it is display-time recovery of a passage
    // whose offsets moved, and it is never written back.
    if (resolved.kind !== 'exact_span') continue;
    spans.push({
      highlightId: String(highlight.id),
      color: highlight.color,
      start: resolved.start,
      end: resolved.end,
      resolution: resolved.resolution,
    });
  }
  spans.sort(compareSpans);
  return spans;
}

/** The page partitioned at every highlight boundary. */
export function knowledgeStandaloneHighlightSegments(
  highlights: readonly KnowledgeSourceHighlight[],
  pageNumber: number,
  pageText: string,
): readonly KnowledgeStandaloneHighlightSegment[] {
  return knowledgeTextSpanSegments(
    pageText, knowledgeStandaloneHighlightSpans(highlights, pageNumber, pageText),
  );
}

/**
 * The one colour a run may show, or null.
 *
 * Same fail-closed rule the Note-derived authority applied, for the same
 * reason: one background cannot honestly represent two different annotations.
 * Highlights that agree paint their shared colour; highlights that disagree
 * paint none, rather than picking a winner or inventing a blend.
 */
export function knowledgeStandaloneHighlightColor(
  spans: readonly KnowledgeStandaloneHighlightSpan[],
): string | null {
  if (spans.length === 0) return null;
  const [first, ...rest] = spans;
  // Compared case-insensitively so `#FDE68A` and `#fde68a` are one opinion,
  // but the STORED spelling is what gets rendered.
  const canonical = first.color.toLowerCase();
  for (const span of rest) {
    if (span.color.toLowerCase() !== canonical) return null;
  }
  return first.color;
}

/** The delete targets under a painted run, in stable order. */
export function knowledgeStandaloneHighlightIds(
  spans: readonly KnowledgeStandaloneHighlightSpan[],
): readonly string[] {
  return spans.map((span) => span.highlightId);
}

/**
 * The DOM attribute carrying those ids, so a click resolves to real rows.
 *
 * A single attribute with a comma-separated list rather than one attribute per
 * id: a run covered by two highlights must expose BOTH, and the delete UI has
 * to disambiguate rather than silently pick the first. Ids are uuids, so the
 * separator can never occur inside one.
 */
export const KNOWLEDGE_HIGHLIGHT_IDS_ATTRIBUTE = 'data-knowledge-highlight-ids';

export function knowledgeHighlightIdsAttribute(
  spans: readonly KnowledgeStandaloneHighlightSpan[],
): string | undefined {
  return spans.length > 0 ? knowledgeStandaloneHighlightIds(spans).join(',') : undefined;
}

/** Reads that attribute back. Empty input yields no targets, never a guess. */
export function parseKnowledgeHighlightIds(value: string | null | undefined): readonly string[] {
  if (!value) return [];
  return value.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}
