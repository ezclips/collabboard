/**
 * PATCH-285. Pure, immutable edit operations for a DrawnPicture: one element at a
 * time, no DOM. Every op returns a NEW picture and never mutates its input; an
 * unknown id or an invalid colour returns the SAME picture (no throw). The AI's
 * data proportions are never editable here -- `applyEdit` only lets the shared
 * repair pass re-fit text and layout after a change.
 */

import type { VisualOutline } from '@/lib/ai/outline';

import type { DrawnElement, DrawnPicture, DrawnTextElement } from './format';
import { DRAWN_FONT_MAX, DRAWN_FONT_MIN, DRAWN_TEXT_MAX, normalizeDrawnColor } from './parseHelpers';
import type { DrawnKind } from './prompt';
import { repairPicture } from './repair';

export interface PaintPatch {
  fill?: string;
  stroke?: string;
}

export interface TextStylePatch {
  color?: string;
  size?: number;
  bold?: boolean;
}

const FILLABLE = new Set(['rect', 'ellipse', 'polygon', 'wedge', 'bar']);
const STROKEABLE = new Set(['rect', 'ellipse', 'polygon', 'line', 'wedge']);

function replace(picture: DrawnPicture, id: string, changes: Partial<DrawnElement>): DrawnPicture {
  return {
    ...picture,
    elements: picture.elements.map((element) =>
      element.id === id ? ({ ...element, ...changes } as DrawnElement) : element,
    ),
  };
}

/**
 * Rect/ellipse/polygon/wedge/bar fill and line/shape stroke. `'none'` is allowed
 * for a fill and a stroke, except a wedge/bar fill (it is a data mark).
 */
export function setPaint(picture: DrawnPicture, id: string, patch: PaintPatch): DrawnPicture {
  const target = picture.elements.find((element) => element.id === id);
  if (!target) return picture;

  const changes: Record<string, string> = {};
  if (patch.fill !== undefined && FILLABLE.has(target.type)) {
    const fill = normalizeDrawnColor(patch.fill);
    if (fill === null) return picture;
    if (fill === 'none' && (target.type === 'wedge' || target.type === 'bar')) return picture;
    changes.fill = fill;
  }
  if (patch.stroke !== undefined && STROKEABLE.has(target.type)) {
    const stroke = normalizeDrawnColor(patch.stroke);
    if (stroke === null) return picture;
    changes.stroke = stroke;
  }
  if (Object.keys(changes).length === 0) return picture;
  return replace(picture, id, changes);
}

/** The label of a text element, trimmed and capped at `DRAWN_TEXT_MAX`; empty refused. */
export function setText(picture: DrawnPicture, id: string, text: string): DrawnPicture {
  const target = picture.elements.find((element) => element.id === id);
  if (!target || target.type !== 'text') return picture;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > DRAWN_TEXT_MAX) return picture;
  return replace(picture, id, { text: trimmed } as Partial<DrawnTextElement>);
}

/** A text element's colour, size (clamped 9..72) and boldness. */
export function setTextStyle(picture: DrawnPicture, id: string, patch: TextStylePatch): DrawnPicture {
  const target = picture.elements.find((element) => element.id === id);
  if (!target || target.type !== 'text') return picture;

  const changes: Partial<DrawnTextElement> = {};
  if (patch.color !== undefined) {
    const color = normalizeDrawnColor(patch.color);
    if (color === null || color === 'none') return picture;
    changes.color = color;
  }
  if (patch.size !== undefined) {
    if (!Number.isFinite(patch.size)) return picture;
    changes.size = Math.min(DRAWN_FONT_MAX, Math.max(DRAWN_FONT_MIN, Math.round(patch.size)));
  }
  if (patch.bold !== undefined) changes.bold = patch.bold;
  if (Object.keys(changes).length === 0) return picture;
  return replace(picture, id, changes);
}

/** An icon's stroke colour. */
export function setIconColour(picture: DrawnPicture, id: string, hex: string): DrawnPicture {
  const target = picture.elements.find((element) => element.id === id);
  if (!target || target.type !== 'icon') return picture;
  const color = normalizeDrawnColor(hex);
  if (color === null || color === 'none') return picture;
  return replace(picture, id, { color } as Partial<DrawnElement>);
}

/** The picture's own background colour (never `'none'`). */
export function setBackground(picture: DrawnPicture, hex: string): DrawnPicture {
  const background = normalizeDrawnColor(hex);
  if (background === null || background === 'none') return picture;
  if (background === picture.background) return picture;
  return { ...picture, background };
}

/** Removes an element and the texts anchored to it; wedge/bar data marks are kept. */
export function removeElement(picture: DrawnPicture, id: string): DrawnPicture {
  const target = picture.elements.find((element) => element.id === id);
  if (!target) return picture;
  if (target.type === 'wedge' || target.type === 'bar') return picture;

  const removed = new Set<string>([id]);
  for (const element of picture.elements) {
    if (element.type === 'text' && element.in === id) removed.add(element.id);
  }
  return { ...picture, elements: picture.elements.filter((element) => !removed.has(element.id)) };
}

/** Applies an op then repairs (text fit, de-overlap, canvas) so the edit still fits. */
export function applyEdit(
  picture: DrawnPicture,
  outline: VisualOutline,
  kind: DrawnKind | undefined,
  op: (current: DrawnPicture) => DrawnPicture,
): DrawnPicture {
  const next = op(picture);
  if (next === picture) return picture;
  return repairPicture(next, outline, kind).picture;
}
