import type { SourceReference } from './knowledgePersistence';

/**
 * P6J-F6-B4-B1 -- what an exact source-text span means, resolved against the
 * page text the reader is about to show.
 *
 * COORDINATE CONTRACT, frozen here before any capture code exists:
 *
 *   - PAGE-RELATIVE: offsets index the text of ONE page, never the whole
 *     source and never a chunk.
 *   - UTF-16 CODE UNITS: exactly what `String.prototype.length` and
 *     `String.prototype.slice` count. Not code points, not bytes.
 *   - HALF-OPEN [start, end): the span is `pageText.slice(start, end)`.
 *
 * Pure derivation. It reads two strings and some numbers, returns a verdict,
 * and recovers nothing back into storage: a fallback match is display-time
 * repair only, never a correction anybody persists.
 */

/**
 * The parts of a citation that decide a span. Structural rather than the whole
 * persistence record, so a full `SourceReference` satisfies it while tests can
 * state a case in five fields.
 */
export type KnowledgeSourceSpanReference = Pick<
  SourceReference,
  'pageStart' | 'pageEnd' | 'quoteText' | 'charStart' | 'charEnd'
>;

/** How a resolved span was located. */
export type KnowledgeSourceSpanResolution = 'offset' | 'quote_fallback';

export type KnowledgeSourceSpanDriftReason =
  | 'unsupported_cross_page'
  | 'invalid_offsets'
  | 'missing_quote'
  | 'quote_not_found'
  | 'quote_ambiguous';

export type KnowledgeSourceSpanResult =
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'page_only' }
  | {
    readonly kind: 'exact_span';
    readonly start: number;
    readonly end: number;
    readonly text: string;
    readonly resolution: KnowledgeSourceSpanResolution;
  }
  | { readonly kind: 'drifted'; readonly reason: KnowledgeSourceSpanDriftReason };

const NOT_APPLICABLE: KnowledgeSourceSpanResult = { kind: 'not_applicable' };
const PAGE_ONLY: KnowledgeSourceSpanResult = { kind: 'page_only' };

function drifted(reason: KnowledgeSourceSpanDriftReason): KnowledgeSourceSpanResult {
  return { kind: 'drifted', reason };
}

/** Inclusive page range, matching the citation's own page semantics. */
function coversPage(reference: KnowledgeSourceSpanReference, pageNumber: number): boolean {
  return reference.pageStart <= pageNumber && pageNumber <= reference.pageEnd;
}

/**
 * Offsets usable as a direct span. Empty ranges are rejected even though the
 * column constraint tolerates `end === start`: a span nobody can see is not
 * evidence of anything.
 */
function usableOffsets(
  reference: KnowledgeSourceSpanReference,
  pageText: string,
): { readonly start: number; readonly end: number } | null {
  const { charStart, charEnd } = reference;
  if (typeof charStart !== 'number' || typeof charEnd !== 'number') return null;
  // Rejects NaN and fractions; `typeof NaN` is 'number', so this check earns its keep.
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  if (charStart < 0 || charStart >= charEnd || charEnd > pageText.length) return null;
  return { start: charStart, end: charEnd };
}

interface QuoteSearch {
  /** Saturates at 2 -- callers only distinguish none, one, and many. */
  readonly count: 0 | 1 | 2;
  readonly start: number;
}

/**
 * Exact substring search. No trimming, no whitespace collapse, no case folding,
 * no Unicode normalisation, no fuzzy scoring: the quote either is in the page
 * or it is not.
 */
function findQuote(pageText: string, quote: string): QuoteSearch {
  const first = pageText.indexOf(quote);
  if (first < 0) return { count: 0, start: -1 };
  // `first + 1`, NOT `first + quote.length`: overlapping occurrences are still
  // occurrences, so "aa" appears three times in "aaaa" and is ambiguous.
  const second = pageText.indexOf(quote, first + 1);
  return { count: second < 0 ? 1 : 2, start: first };
}

/**
 * Classifies one citation against one rendered page.
 *
 * Precedence is fixed and total: page applicability, then the legacy
 * discriminator, then unsupported shapes, then evidence, then offsets, then
 * fallback. Ordinary drift is a return value -- nothing here throws.
 */
export function resolveKnowledgeSourceSpan(
  reference: KnowledgeSourceSpanReference,
  pageNumber: number,
  pageText: string,
): KnowledgeSourceSpanResult {
  if (!coversPage(reference, pageNumber)) return NOT_APPLICABLE;

  const { charStart, charEnd } = reference;

  // THE ONLY exactness discriminator. `quoteText` cannot serve: every citation
  // written before spans existed stores the entire page in it, so treating a
  // present quote as a span would highlight whole pages retroactively.
  if (charStart === null && charEnd === null) return PAGE_ONLY;

  // A span that starts on one page and ends on another cannot be addressed by
  // one page-relative range. B4-B2 rejects such selections at capture time.
  if (reference.pageStart !== reference.pageEnd) return drifted('unsupported_cross_page');

  // Exactly one offset set: neither a page-only row nor a usable candidate, and
  // deliberately NOT recovered by quote fallback. A half-written legacy-shaped
  // row still carries a whole-page quote, which would resolve to a whole-page
  // highlight -- the one outcome this taxonomy exists to prevent.
  if (charStart === null || charEnd === null) return drifted('invalid_offsets');

  const quote = reference.quoteText;
  // The quote is the evidence a span is checked against; `quoteHash` is
  // server-side integrity metadata and is never a substitute for it here.
  if (typeof quote !== 'string' || quote.length === 0) return drifted('missing_quote');

  const offsets = usableOffsets(reference, pageText);
  if (offsets !== null && pageText.slice(offsets.start, offsets.end) === quote) {
    return {
      kind: 'exact_span',
      start: offsets.start,
      end: offsets.end,
      text: quote,
      resolution: 'offset',
    };
  }

  // The page moved under the offsets, or they were never usable. The quote can
  // still identify the passage -- but only if it says exactly one thing.
  const found = findQuote(pageText, quote);
  if (found.count === 1) {
    return {
      kind: 'exact_span',
      start: found.start,
      end: found.start + quote.length,
      text: quote,
      resolution: 'quote_fallback',
    };
  }
  return drifted(found.count === 0 ? 'quote_not_found' : 'quote_ambiguous');
}
