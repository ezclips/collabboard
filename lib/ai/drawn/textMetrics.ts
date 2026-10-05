/**
 * PATCH-283 B. Pure text measuring and wrapping, usable on the server and the
 * client. Widths come from the embedded Helvetica AFM table (chars 32..126,
 * /1000 em); every other character counts 0.6 em. No canvas, no DOM.
 *
 * The design rule this enforces: the MODEL never decides what it is bad at --
 * fitting text is computed here, deterministically.
 */

export const LINE_HEIGHT_FACTOR = 1.25;
/** Units-per-em fallback for characters outside the embedded table. */
const FALLBACK_ADVANCE = 600;

const FIRST_CODE = 32;
const LAST_CODE = 126;

// Helvetica.afm widths for chars 32..126, in 1/1000 em.
// prettier-ignore
const REGULAR_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Helvetica-Bold.afm widths for chars 32..126, in 1/1000 em.
// prettier-ignore
const BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** The width of `text` in px, at `size` px, optionally bold. */
export function measureText(text: string, size: number, bold: boolean): number {
  const table = bold ? BOLD_WIDTHS : REGULAR_WIDTHS;
  let total = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    total += code >= FIRST_CODE && code <= LAST_CODE ? table[code - FIRST_CODE] : FALLBACK_ADVANCE;
  }
  return (total / 1000) * size;
}

/** The rendered line height for a font size. */
export function lineHeight(size: number): number {
  return size * LINE_HEIGHT_FACTOR;
}

/**
 * Word-wraps `text` to `maxWidth`. A word wider than a line is broken at the
 * character that overflows, so a returned line is never wider than `maxWidth`
 * unless it holds one unbreakable character. Explicit newlines are kept.
 * Empty text returns `['']`.
 */
export function wrapText(text: string, size: number, maxWidth: number, bold: boolean): string[] {
  if (text === '') return [''];
  const limit = Math.max(1, maxWidth);
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, size, bold) <= limit) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = '';
      }
      if (measureText(word, size, bold) <= limit) {
        current = word;
        continue;
      }
      // A word wider than the line: break it into the longest fitting chunks.
      let chunk = '';
      for (const char of word) {
        const next = chunk + char;
        if (chunk && measureText(next, size, bold) > limit) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}
