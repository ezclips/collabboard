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

/**
 * R6G. The width a text annotation keeps regardless of what is in it.
 *
 * THE defect this fixes: box width was a pure function of the current content,
 * floored only at MIN_TEXT_ANNOTATION_BOX_WIDTH. R6D made an EMPTY box measure
 * the placeholder, so a fresh annotation looked right at ~168px -- but the first
 * keystroke dropped the placeholder and the box collapsed to the 50px floor.
 * After the textarea's own padding and border that leaves ~22px of content box,
 * so its soft wrap broke "Hallo" into one or two characters per line. That is
 * the reported "h / a" and "ha / l".
 *
 * A width that shrinks as you type is the wrong model. The right one is a
 * stable width with an auto-growing height, so this is a FLOOR applied whether
 * or not there is content. Text longer than this still widens the box up to the
 * space available, and only then wraps.
 *
 * 180 sits in the editor's existing 160-220 range and just above the ~168px the
 * placeholder already produced, so a fresh box is not visibly re-sized by its
 * own first character.
 */
export const DEFAULT_TEXT_ANNOTATION_BOX_WIDTH = 180;

/**
 * R6F. The breathing room kept between a text box and the image's bottom edge.
 *
 * Deliberately smaller than the horizontal reserve (20px, applied at the call
 * site as `clientWidth - x - 20`): horizontally that gap also has to leave a
 * usable amount of text width, whereas vertically it only has to read as "not
 * touching the edge".
 */
export const TEXT_ANNOTATION_EDGE_MARGIN = 8;

/**
 * R6F. Keeps a text annotation's box inside the image VERTICALLY.
 *
 * The horizontal bound was always enforced (the box is measured against a max
 * width, so text wraps instead of running off the right edge). The vertical one
 * never was -- and wrapping is precisely what makes a box taller. So text near
 * the bottom edge would wrap to a second line, grow downwards, and the extra
 * lines fell off the bottom of the image, where the flatten step silently
 * cropped them.
 *
 * This is a pure position rule, applied wherever the box is placed: the live
 * editor, the flattened composite, and the geometry handed back on save. That
 * is what keeps those three agreeing.
 *
 * `imageHeight` of 0 means "not measured yet" (the container has no layout on
 * the first render pass), and clamping against it would slam every annotation
 * to the top -- so it is treated as "no bound known", not as a zero-height
 * image.
 */
export function clampTextAnnotationTop(
  top: number,
  boxHeight: number,
  imageHeight: number,
  margin: number = TEXT_ANNOTATION_EDGE_MARGIN,
): number {
  const safeTop = Number.isFinite(top) ? top : 0;
  // Unmeasured container: keep the caller's position, minus a negative y.
  if (!Number.isFinite(imageHeight) || imageHeight <= 0) return Math.max(0, safeTop);

  const safeHeight = Number.isFinite(boxHeight) && boxHeight > 0 ? boxHeight : 0;
  const lowestTop = imageHeight - margin - safeHeight;

  // The annotation is taller than the image itself. There is no position that
  // fits, so pin it to the top and show as much as there is room for, rather
  // than resolving to a negative y and hiding the FIRST line instead of the
  // last.
  if (lowestTop <= 0) return 0;

  return Math.min(Math.max(safeTop, 0), lowestTop);
}

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
 * keeps every already-saved text box at the geometry it was saved with -- with
 * one R6G addition: `minBoxWidth` floors the result, so content can widen the
 * box but can never shrink it below the width it is supposed to keep. Pass the
 * annotation's own width when the user has resized it, so their choice wins.
 */
export function measureTextAnnotationBox(
  content: string,
  fontSize: number,
  measure: TextWidthMeasurer,
  maxBoxWidth?: number,
  font = `600 ${fontSize}px "Inter", sans-serif`,
  // Defaults to "no floor", so measuring on its own is byte-for-byte what R6D
  // specified. WHAT width an annotation keeps is a property of the annotation,
  // not of the measurement, so the editor supplies it.
  minBoxWidth = 0,
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

  // R6G: the floor is what stops the box collapsing onto its own content.
  const widthFloor = Math.max(
    MIN_TEXT_ANNOTATION_BOX_WIDTH,
    Number.isFinite(minBoxWidth) && minBoxWidth > 0 ? minBoxWidth : 0,
  );
  const naturalBoxWidth = Math.max(widthFloor, measuredMaxWidth + padding * 2);
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
