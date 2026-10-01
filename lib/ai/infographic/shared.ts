/**
 * PATCH-236. Pure SVG geometry shared by the six infographic designs. Each
 * `layoutX(outline)` returns { width, height, shapes, texts }; the renderer
 * draws them. No DOM, no React.
 */

import type { VisualOutline } from '@/lib/ai/outline';
import { charWidthFor, wrapLabel } from './text';

export interface InfographicShape {
  id: string;
  kind: 'rect' | 'polygon' | 'circle' | 'path';
  points?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  d?: string;
  rx?: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  colorIndex: number;
}

export interface InfographicText {
  id: string;
  x: number;
  y: number;
  lines: string[];
  color: string;
  fontSize: number;
  fontWeight: number;
  anchor: 'start' | 'middle' | 'end';
  /** When set, the text is meant to sit inside this shape (the inside-shape rule). */
  insideShapeId?: string;
}

export interface InfographicLayout {
  width: number;
  height: number;
  shapes: InfographicShape[];
  texts: InfographicText[];
  /** PATCH-237. A Lucide icon per item, when the outline carried one. */
  icons?: InfographicIcon[];
}

export interface InfographicIcon {
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  insideShapeId?: string;
}

export const INFO_LINE_HEIGHT = 18;
export const ROOT_TEXT = '#1F2937';

export const TITLE_FONT = 15;
export const LABEL_FONT = 13;
export const DETAIL_FONT = 12;

/**
 * PATCH-236. The estimate the OLD code got wrong: it passed the font SIZE as
 * the character width. Always size text (and wrap it) through here.
 */
export function sizeText(lines: string[], fontSize: number, fontWeight: number) {
  const charWidth = charWidthFor(fontSize, fontWeight);
  const width = Math.max(0, ...lines.map((line) => line.length * charWidth));
  return { charWidth, width, height: lines.length * INFO_LINE_HEIGHT };
}

export interface TextBlock {
  labelLines: string[];
  detailLines: string[];
  /** Widest line in the block, on-screen px (correct estimate). */
  width: number;
  height: number;
}

/** A wrapped heading + optional wrapped detail, with whole words kept whole. */
export function textBlock(heading: string, detail: string | undefined, maxWidth: number): TextBlock {
  const labelLines = wrapLabel(heading, maxWidth, charWidthFor(LABEL_FONT, 600), { breakWords: false });
  const detailLines = detail
    ? wrapLabel(detail, maxWidth, charWidthFor(DETAIL_FONT, 400), { breakWords: false })
    : [];
  const labelW = sizeText(labelLines, LABEL_FONT, 600).width;
  const detailW = detailLines.length ? sizeText(detailLines, DETAIL_FONT, 400).width : 0;
  return {
    labelLines,
    detailLines,
    width: Math.ceil(Math.max(labelW, detailW, heading ? labelW : 0)),
    height: (labelLines.length + detailLines.length) * INFO_LINE_HEIGHT,
  };
}

export function labelBlock(heading: string, maxWidth: number): TextBlock {
  return textBlock(heading, undefined, maxWidth);
}

/** The box a text occupies, from the correct estimate (used by the tests too). */
export function textBox(text: InfographicText) {
  const { width, height } = sizeText(text.lines, text.fontSize, text.fontWeight);
  const left = text.anchor === 'start' ? text.x : text.anchor === 'end' ? text.x - width : text.x - width / 2;
  return { left, right: left + width, top: text.y - height / 2, bottom: text.y + height / 2, width, height };
}

/**
 * PATCH-236 Addendum 4. Shift a whole layout so every anchor-aware text box fits
 * inside the canvas with `pad` padding, growing the canvas when needed. Applied
 * to every infographic so a right/centre-anchored detail is never clipped.
 */
export function fitLayout(layout: InfographicLayout, pad = 16): InfographicLayout {
  if (layout.texts.length === 0) return layout;
  const boxes = layout.texts.map(textBox);
  const minLeft = Math.min(...boxes.map((b) => b.left));
  const minTop = Math.min(...boxes.map((b) => b.top));
  const maxRight = Math.max(...boxes.map((b) => b.right));
  const maxBottom = Math.max(...boxes.map((b) => b.bottom));

  const dx = minLeft < pad ? pad - minLeft : 0;
  const dy = minTop < pad ? pad - minTop : 0;
  const width = Math.max(layout.width, maxRight + dx + pad);
  const height = Math.max(layout.height, maxBottom + dy + pad);

  if (dx === 0 && dy === 0 && width === layout.width && height === layout.height) return layout;

  const shiftShape = (shape: InfographicShape): InfographicShape => {
    if (shape.kind === 'circle') {
      return { ...shape, cx: (shape.cx ?? 0) + dx, cy: (shape.cy ?? 0) + dy };
    }
    if (shape.kind === 'polygon' && shape.points) {
      const points = shape.points
        .split(' ')
        .map((p) => {
          const [x, y] = p.split(',').map(Number);
          return `${x + dx},${y + dy}`;
        })
        .join(' ');
      return { ...shape, points };
    }
    if (shape.kind === 'path') {
      // Shift absolute coordinate pairs: M/L endpoints (x,y) and the A command's
      // endpoint (ex,ey). The A radii (rx,ry) stay unshifted.
      let d = shape.d ?? '';
      d = d.replace(/M (-?[\d.]+),(-?[\d.]+)/, (_m, x, y) => `M ${Number(x) + dx},${Number(y) + dy}`);
      d = d.replace(/L (-?[\d.]+),(-?[\d.]+)/g, (_m, x, y) => `L ${Number(x) + dx},${Number(y) + dy}`);
      d = d.replace(
        /A (-?[\d.]+),(-?[\d.]+) 0 0 1 (-?[\d.]+),(-?[\d.]+)/g,
        (_m, rx, ry, x, y) => `A ${rx},${ry} 0 0 1 ${Number(x) + dx},${Number(y) + dy}`,
      );
      return { ...shape, d };
    }
    return { ...shape, x: (shape.x ?? 0) + dx, y: (shape.y ?? 0) + dy };
  };

  return {
    width,
    height,
    shapes: layout.shapes.map(shiftShape),
    texts: layout.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
    icons: layout.icons?.map((icon) => ({ ...icon, x: icon.x + dx, y: icon.y + dy })),
  };
}
