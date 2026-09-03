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

function wrapLine(line: string, maxTextWidth: number, measure: TextWidthMeasurer): string[] {
  if (line.length === 0) return [''];
  if (measure(line) <= maxTextWidth) return [line];

  const tokens = line.split(/(\s+)/u).filter((token) => token.length > 0);
  const wrapped: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.length > 0) {
      wrapped.push(current.trimEnd());
      current = '';
    }
  };

  for (const token of tokens) {
    const candidate = current + token;
    if (current.length === 0 && measure(token) > maxTextWidth && !/^\s+$/u.test(token)) {
      let chunk = '';
      for (const char of token) {
        const next = chunk + char;
        if (chunk.length === 0 || measure(next) <= maxTextWidth) {
          chunk = next;
        } else {
          wrapped.push(chunk);
          chunk = char;
        }
      }
      current = chunk;
      continue;
    }

    if (measure(candidate.trimEnd()) <= maxTextWidth) {
      current = candidate;
      continue;
    }

    pushCurrent();
    if (/^\s+$/u.test(token)) {
      continue;
    }

    if (measure(token) <= maxTextWidth) {
      current = token;
      continue;
    }

    let chunk = '';
    for (const char of token) {
      const next = chunk + char;
      if (chunk.length === 0 || measure(next) <= maxTextWidth) {
        chunk = next;
      } else {
        wrapped.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }

  pushCurrent();
  return wrapped.length > 0 ? wrapped : [''];
}

function wrapTextToWidth(text: string, maxTextWidth: number, measure: TextWidthMeasurer): string[] {
  const wrapped: string[] = [];
  for (const line of text.split('\n')) {
    wrapped.push(...wrapLine(line, maxTextWidth, measure));
  }
  return wrapped.length > 0 ? wrapped : [''];
}

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
  maxBoxWidth?: number,
  font = `600 ${fontSize}px "Inter", sans-serif`,
): TextAnnotationBox {
  const isEmpty = !content || content.length === 0;
  const hardLines = (isEmpty ? '' : content).split('\n');
  const measuredAgainst = isEmpty ? [EMPTY_TEXT_ANNOTATION_PLACEHOLDER] : hardLines;

  const padding = TEXT_ANNOTATION_PADDING;
  const lineHeight = fontSize * 1.2;
  const boxWidthLimit = Number.isFinite(maxBoxWidth as number) && (maxBoxWidth as number) > 0
    ? (maxBoxWidth as number)
    : null;

  let measuredMaxWidth = 0;
  for (const line of measuredAgainst) {
    // A blank line still occupies a line box; measuring '' would collapse it.
    const width = measure(line.length > 0 ? line : ' ');
    if (Number.isFinite(width) && width > measuredMaxWidth) measuredMaxWidth = width;
  }

  const naturalBoxWidth = Math.max(MIN_TEXT_ANNOTATION_BOX_WIDTH, measuredMaxWidth + padding * 2);
  const shouldWrap = !isEmpty && boxWidthLimit !== null && naturalBoxWidth > boxWidthLimit;
  const wrappedLines = shouldWrap
    ? wrapTextToWidth(content, Math.max(1, boxWidthLimit - padding * 2), measure)
    : hardLines;

  return {
    lines: wrappedLines,
    padding,
    lineHeight,
    boxWidth: boxWidthLimit !== null && naturalBoxWidth > boxWidthLimit
      ? boxWidthLimit
      : naturalBoxWidth,
    // Height counts rendered lines, so wrapped text grows vertically while the
    // textarea stays on the same persisted box width.
    boxHeight: Math.max(lineHeight + padding * 2, wrappedLines.length * lineHeight + padding * 2),
  };
}
