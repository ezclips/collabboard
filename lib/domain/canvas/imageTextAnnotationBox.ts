/**
 * R6D -- how big a Draw-on-top text annotation's box is.
 *
 * Extracted from ImageDrawingLayer so the sizing POLICY can be tested without a
 * real 2D canvas: the caller supplies the measurement, this decides the box.
 * The editor's textarea and the flattened canvas render both read it, so a
 * change here can never make the two disagree.
 */

/** What an empty annotation displays, and the string its width is sized to. */
export const EMPTY_TEXT_ANNOTATION_PLACEHOLDER = 'Type here...';

/** Inner padding, in CSS px at display scale. */
export const TEXT_ANNOTATION_PADDING = 12;

/**
 * The historical floor. It is NOT the reason a new box is now usable -- an
 * empty box is sized to the placeholder instead -- but it still guards against
 * a zero measurement from a font that has not loaded yet.
 */
export const MIN_TEXT_ANNOTATION_BOX_WIDTH = 50;

export interface TextAnnotationBox {
  /** The REAL content lines. Never the placeholder: these get painted. */
  readonly lines: readonly string[];
  readonly padding: number;
  readonly lineHeight: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
}

/** Measures one line at the annotation's font. */
export type TextWidthMeasurer = (line: string) => number;

/**
 * Sizes the box for `content`.
 *
 * An EMPTY annotation is measured against the placeholder it shows. Before
 * R6D it was measured as a single space, so it collapsed to the 50px floor --
 * roughly 22px of content box once padding and border come off -- and the
 * placeholder wrapped one character per line, stacking "Type here..."
 * vertically. Measuring the visible placeholder gives a new annotation a
 * sensible horizontal width.
 *
 * An annotation WITH content is measured exactly as before, which is what
 * keeps every already-saved text box at the geometry it was saved with.
 */
export function measureTextAnnotationBox(
  content: string,
  fontSize: number,
  measure: TextWidthMeasurer,
): TextAnnotationBox {
  const isEmpty = !content || content.length === 0;
  const lines = (isEmpty ? '' : content).split('\n');
  const measuredAgainst = isEmpty ? [EMPTY_TEXT_ANNOTATION_PLACEHOLDER] : lines;

  const padding = TEXT_ANNOTATION_PADDING;
  const lineHeight = fontSize * 1.2;

  let maxWidth = 0;
  for (const line of measuredAgainst) {
    // A blank line still occupies a line box; measuring '' would collapse it.
    const width = measure(line.length > 0 ? line : ' ');
    if (Number.isFinite(width) && width > maxWidth) maxWidth = width;
  }

  return {
    lines,
    padding,
    lineHeight,
    boxWidth: Math.max(MIN_TEXT_ANNOTATION_BOX_WIDTH, maxWidth + padding * 2),
    // Height counts REAL lines, so an empty box is one line tall even though
    // its width came from the placeholder.
    boxHeight: Math.max(lineHeight + padding * 2, lines.length * lineHeight + padding * 2),
  };
}
