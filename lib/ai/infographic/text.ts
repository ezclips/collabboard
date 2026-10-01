/**
 * PATCH-236. One character-width estimate per font size, and a wrapper that can
 * keep a word whole. Words are wrapped at an estimated character width so we can
 * size boxes without a live text measure -- pure, no DOM.
 */

/**
 * The estimated on-screen width of one character, for a font size and weight.
 * Roughly 0.56 x fontSize for normal/medium text, 0.6 x for semibold and above.
 * NEVER pass the font size itself as the character width (the PATCH-236 defect:
 * it wrapped every label at about half the room it had).
 */
export function charWidthFor(fontSize: number, fontWeight: number): number {
  return fontSize * (fontWeight >= 600 ? 0.6 : 0.56);
}

export interface WrapLabelOptions {
  /** When false (infographics), a single word wider than maxWidth stays whole. */
  breakWords?: boolean;
}

export function wrapLabel(
  label: string,
  maxWidth: number,
  charWidth: number,
  options: WrapLabelOptions = {},
): string[] {
  const breakWords = options.breakWords ?? true;
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const lines: string[] = [];
  let current = '';

  const flush = () => {
    if (current) lines.push(current);
    current = '';
  };

  for (const word of words) {
    let remaining = word;
    if (breakWords) {
      while (remaining.length > maxChars) {
        flush();
        lines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
      }
    }
    // A whole word that does not fit on the current line goes on its own line
    // (and may still be wider than maxWidth when breakWords is false).
    const candidate = current ? `${current} ${remaining}` : remaining;
    if (candidate.length * charWidth <= maxWidth) {
      current = candidate;
    } else {
      flush();
      current = remaining;
    }
  }
  flush();

  return lines.length > 0 ? lines : [''];
}
