import { resolveKnowledgeSourceSpan } from '../../domain/knowledge/knowledgeSourceSpanResolver';
import {
  KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR,
  knowledgeSourceNoteAccentColor,
} from '../../domain/knowledge/knowledgeSourceHighlightColor';
import type { KnowledgeSourceNoteColorFields } from '../../domain/knowledge/knowledgeSourceHighlightColor';
import type { SourceReference } from '../../domain/knowledge/knowledgePersistence';

/**
 * PDF-R6K-H2A -- planning the standalone highlights that already exist visually.
 *
 * Every visible citation highlight today is computed in TypeScript from three
 * inputs: the citation row, the page text it lands on, and the citing Note's
 * colour. SQL cannot reproduce that, so the plan is built HERE, by the same
 * authorities the renderer uses, and a caller merely carries the rows to the
 * database.
 *
 * Pure and total: no IO, no clock, no randomness. Given the same inputs it
 * produces the same plan, which is what lets the rerun test mean anything.
 *
 * The rule is "whatever the reader paints today, and nothing else". A citation
 * that resolves to no paintable span produces no highlight -- inventing one
 * would put a mark on a page where the user has never seen one.
 */

export interface KnowledgeSourceHighlightBackfillPage {
  readonly pageNumber: number;
  readonly text: string;
}

export interface KnowledgeSourceHighlightBackfillInput {
  /** Citations of ONE document, exactly as stored. Never mutated. */
  readonly references: readonly SourceReference[];
  /** That document's current page text, keyed by page number. */
  readonly pages: readonly KnowledgeSourceHighlightBackfillPage[];
  /** Citing Note metadata, keyed by padlet id -- the renderer's colour input. */
  readonly noteColors: ReadonlyMap<string, KnowledgeSourceNoteColorFields>;
}

export interface PlannedKnowledgeSourceHighlight {
  readonly sourceDocumentId: string;
  readonly sourceReferenceId: string;
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly quoteText: string;
  readonly color: string;
  /** How the span was found; `quote_fallback` means the offsets were corrected. */
  readonly resolution: 'offset' | 'quote_fallback';
}

export type KnowledgeSourceHighlightSkipReason =
  | 'page_only'
  | 'not_applicable'
  | 'cross_page'
  | 'drifted'
  | 'no_page_text';

export interface SkippedKnowledgeSourceHighlight {
  readonly sourceReferenceId: string;
  readonly reason: KnowledgeSourceHighlightSkipReason;
}

export interface KnowledgeSourceHighlightBackfillPlan {
  readonly create: readonly PlannedKnowledgeSourceHighlight[];
  readonly skipped: readonly SkippedKnowledgeSourceHighlight[];
}

export function planKnowledgeSourceHighlightBackfill(
  input: KnowledgeSourceHighlightBackfillInput,
): KnowledgeSourceHighlightBackfillPlan {
  const pageText = new Map(input.pages.map((page) => [page.pageNumber, page.text]));
  const create: PlannedKnowledgeSourceHighlight[] = [];
  const skipped: SkippedKnowledgeSourceHighlight[] = [];

  for (const reference of input.references) {
    const referenceId = String(reference.id);

    // A standalone highlight is single-page by definition, and the resolver
    // refuses cross-page spans anyway. Recorded distinctly so the operator can
    // see WHY a citation produced nothing.
    if (reference.pageStart !== reference.pageEnd) {
      skipped.push({ sourceReferenceId: referenceId, reason: 'cross_page' });
      continue;
    }

    const text = pageText.get(reference.pageStart);
    if (text === undefined) {
      // The page was never extracted, so the reader paints nothing here either.
      skipped.push({ sourceReferenceId: referenceId, reason: 'no_page_text' });
      continue;
    }

    const resolved = resolveKnowledgeSourceSpan(reference, reference.pageStart, text);
    if (resolved.kind !== 'exact_span') {
      skipped.push({
        sourceReferenceId: referenceId,
        reason: resolved.kind === 'drifted' ? 'drifted' : resolved.kind,
      });
      continue;
    }

    // The RESOLVED offsets, not the stored ones. When the resolver recovered a
    // drifted passage by its quote, the corrected location is the one the
    // reader is painting, and it is the one that must be frozen into the
    // standalone row -- copying stale char_start/char_end would move the
    // highlight the moment rendering switches authority.
    create.push({
      sourceDocumentId: String(reference.sourceDocumentId),
      sourceReferenceId: referenceId,
      pageNumber: reference.pageStart,
      charStart: resolved.start,
      charEnd: resolved.end,
      // The page's own text for that range, so the quote always agrees with
      // the offsets even after a fallback correction.
      quoteText: resolved.text,
      color: backfillColor(input.noteColors.get(String(reference.targetPadletId))),
      resolution: resolved.resolution,
    });
  }

  return { create, skipped };
}

/**
 * The colour this highlight is showing right now.
 *
 * Seeded from the SAME Note-accent authority the renderer consults, so a
 * coloured Note's highlight keeps its colour. Where that authority declines --
 * no Note metadata, an unusable value, or white, which would render the
 * highlight invisible -- the reader has been painting its neutral background,
 * and that exact neutral is what gets stored rather than a new colour.
 *
 * Note disagreement across an overlapping run is deliberately NOT modelled
 * here. That rule exists because one background cannot represent two Notes;
 * once each highlight owns its colour the situation no longer arises, and each
 * citation simply keeps its own Note's colour.
 */
function backfillColor(fields: KnowledgeSourceNoteColorFields | undefined): string {
  return knowledgeSourceNoteAccentColor(fields) ?? KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR;
}
