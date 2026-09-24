import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';

/**
 * PATCH-177. Finding the words a user selected on the PDF's pdf.js text layer
 * inside the STORED page text.
 *
 * WHY MATCH RATHER THAN MAP. The layer's text comes from pdf.js; `page.text`
 * comes from OpenDataLoader. They agree on the words but not on spacing, line
 * breaks, or order across columns, so a character offset in one is meaningless
 * in the other. Matching the words -- and refusing when they cannot be found
 * exactly -- keeps the reader's existing rule: a selection is exact or it is
 * nothing.
 *
 * PURE, no DOM and no React. The one browser-side detail, where the selection
 * started, arrives as a NUMBER (`positionHint`), so this can be tested without
 * a document.
 */

/**
 * The characters removed before comparison, and nowhere else.
 *
 * NFKC folds compatibility forms (the `ﬁ` ligature becomes `fi`, full-width
 * digits become ASCII), soft hyphens are invisible line-break hints that some
 * extractors keep and others drop, and removing whitespace is what makes the
 * two extractors' differing spacing and line breaks irrelevant.
 */
function normalizeForCompare(text: string): { normalized: string; toOriginal: number[] } {
  const normalized: string[] = [];
  const toOriginal: number[] = [];
  // NFKC can turn one source character into several; iterate over the original
  // code points so an index map can still name the source offset.
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    // A surrogate pair: keep it whole, so the two units keep their own offsets.
    if (char >= '\uD800' && char <= '\uDBFF' && index + 1 < text.length) {
      const pair = text.slice(index, index + 2);
      const folded = pair.normalize('NFKC');
      for (const foldedChar of folded) {
        normalized.push(foldedChar);
        toOriginal.push(index);
      }
      index += 1;
      continue;
    }
    if (char === '\u00AD') continue;
    if (/\s/.test(char)) continue;
    const folded = char.normalize('NFKC');
    for (const foldedChar of folded) {
      if (/\s/.test(foldedChar)) continue;
      normalized.push(foldedChar);
      toOriginal.push(index);
    }
  }
  return { normalized: normalized.join(''), toOriginal };
}

/** The same normalization, without the map (the needle needs no offsets). */
function normalizeNeedle(text: string): string {
  return text.normalize('NFKC').replace(/\u00AD/g, '').replace(/\s+/g, '');
}

/**
 * Find `selectedText` in `pageText`, ignoring whitespace and compatibility
 * forms, and return its offsets in `pageText` -- or null when it cannot be
 * found EXACTLY.
 *
 * `positionHint` (0..1) is where, as a fraction of the layer's text, the
 * selection began. It is used only to choose between REPEATED phrases: on an
 * exact tie the earliest is chosen, so a hint of 0 (or no hint) is the stable
 * default.
 *
 * The returned span starts and ends on non-whitespace, because it is bounded by
 * the first and last MATCHED character; any whitespace between them is whatever
 * `pageText` actually holds.
 */
export function matchLayerSelectionToPageText(
  pageText: string,
  selectedText: string,
  positionHint: number,
): { charStart: number; charEnd: number } | null {
  const needle = normalizeNeedle(selectedText);
  // Refused here, before any search: a one-character selection is more likely
  // to be a stray click than an intent, and short needles match everywhere.
  if (needle.length < 2) return null;

  const { normalized, toOriginal } = normalizeForCompare(pageText);
  if (normalized.length === 0) return null;

  const occurrences: number[] = [];
  let from = 0;
  for (;;) {
    const at = normalized.indexOf(needle, from);
    if (at < 0) break;
    occurrences.push(at);
    from = at + 1;
  }
  if (occurrences.length === 0) return null;

  let chosen = occurrences[0];
  if (occurrences.length > 1) {
    // Nearest to the hint, as a fraction of the normalized page text. On an
    // exact tie the earliest occurrence (already `chosen`) wins.
    const hint = Number.isFinite(positionHint) ? Math.min(1, Math.max(0, positionHint)) : 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const at of occurrences) {
      const distance = Math.abs(at / normalized.length - hint);
      if (distance < bestDistance) {
        bestDistance = distance;
        chosen = at;
      }
    }
  }

  // Map the matched run back to ORIGINAL offsets. The last matched character is
  // `chosen + needle.length - 1` in normalized space; its original offset is
  // the end (exclusive) once one is added.
  const originalStart = toOriginal[chosen];
  const originalEnd = toOriginal[chosen + needle.length - 1] + 1;
  if (originalStart === undefined || originalEnd === undefined) return null;

  // Mirrors `captureExactSelection`: the server caps the quote too, and a
  // refusal here is honest rather than a shortened selection sent anyway.
  if (originalEnd - originalStart > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;

  return { charStart: originalStart, charEnd: originalEnd };
}
