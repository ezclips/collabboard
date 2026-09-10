/**
 * Extraction quality, measured -- never repaired.
 *
 * Some PDFs carry glyphs whose own ToUnicode mapping resolves to U+0000: the
 * character the page displays is simply not in the file, and the investigation
 * that produced this module proved it is not recoverable from the source
 * either (Type 3 fonts with no font program, opaque producer glyph ids, and no
 * in-document occurrence of those ids with a valid mapping). The normalizer
 * then converts each NUL to U+FFFD because PostgreSQL cannot store NUL in
 * `text`, which is correct and stays exactly as it is.
 *
 * What was missing is that this happened silently. These functions COUNT the
 * unusable characters so a page that lost text is visible in worker
 * diagnostics instead of quietly becoming slightly wrong. They read text and
 * return numbers: no substitution, no guessing, no spelling or language
 * heuristics, and no effect whatsoever on stored text, chunks, offsets or
 * hashes.
 */

/** The one NUL PostgreSQL refuses, before the normalizer replaces it. */
const NUL_CODE_POINT = 0x0000;
/** What the normalizer puts in its place, and what storage therefore holds. */
const REPLACEMENT_CODE_POINT = 0xfffd;

export interface KnowledgeTextQuality {
  /** True when the text carries at least one unusable character. */
  readonly malformed: boolean;
  /** NUL plus replacement characters, so raw and normalized text agree. */
  readonly invalidCharacterCount: number;
  readonly nonWhitespaceLength: number;
}

/**
 * Both code points are counted by the same pass on purpose.
 *
 * The normalizer's substitution is one UTF-16 code unit for one UTF-16 code
 * unit, so a page measured BEFORE normalization and the same page measured
 * AFTER it report the identical count -- which is what lets one detector serve
 * raw parser output and stored text without either caller having to know which
 * side of the substitution it is on.
 */
export function knowledgeTextQuality(text: string): KnowledgeTextQuality {
  let invalidCharacterCount = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === NUL_CODE_POINT || code === REPLACEMENT_CODE_POINT) invalidCharacterCount += 1;
  }
  return {
    malformed: invalidCharacterCount > 0,
    invalidCharacterCount,
    nonWhitespaceLength: text.replace(/\s/gu, '').length,
  };
}

/** The page identity a warning names. Metadata only -- never page text. */
export interface KnowledgeMalformedPageWarning {
  readonly pageNumber: number;
  readonly invalidCharacterCount: number;
  readonly nonWhitespaceLength: number;
}

/**
 * One warning per malformed page, at most one per page number.
 *
 * The de-duplication is the point: a page reached twice in one extraction run
 * -- a parser that emits a page in two fragments, a retry inside the same run
 * -- must not turn one defect into two log lines. Clean pages yield nothing at
 * all, so a healthy document stays silent.
 */
export function knowledgeMalformedPageWarnings(
  pages: readonly { readonly pageNumber: number; readonly text: string }[],
): readonly KnowledgeMalformedPageWarning[] {
  const warnings: KnowledgeMalformedPageWarning[] = [];
  const seen = new Set<number>();
  for (const page of pages) {
    if (seen.has(page.pageNumber)) continue;
    const quality = knowledgeTextQuality(page.text);
    if (!quality.malformed) continue;
    seen.add(page.pageNumber);
    warnings.push({
      pageNumber: page.pageNumber,
      invalidCharacterCount: quality.invalidCharacterCount,
      nonWhitespaceLength: quality.nonWhitespaceLength,
    });
  }
  return warnings;
}
