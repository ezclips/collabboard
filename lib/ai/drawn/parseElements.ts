/**
 * PATCH-283 A. The per-element validation of a DrawnPicture, split out of
 * `format.ts` so each file stays under the 400-line ceiling. Types are imported
 * type-only from the format, so there is no import cycle.
 */

import { isVisualIconName } from '@/lib/ai/visualIcons';

import type {
  DrawnBarElement,
  DrawnElement,
  DrawnEllipseElement,
  DrawnIconElement,
  DrawnLineElement,
  DrawnPolygonElement,
  DrawnRectElement,
  DrawnTextElement,
  DrawnWedgeElement,
} from './format';
import {
  DRAWN_FONT_MAX,
  DRAWN_FONT_MIN,
  DRAWN_TEXT_MAX,
  isFiniteNumber,
  isObject,
  normalizeDrawnColor,
  optionalNumber,
  parseItem,
  parsePoints,
} from './parseHelpers';

export interface RawElement {
  element: Omit<DrawnElement, 'id'> & { id?: string };
  rawId: string;
}

export type ParseElementResult = { ok: true; value: RawElement } | { ok: false; reason: string };

export function parseElement(raw: unknown, index: number): ParseElementResult {
  if (!isObject(raw)) return { ok: false, reason: `element ${index}: not an object` };
  const type = raw.type;
  const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
  const base = { id: rawId };

  if (type === 'rect' || type === 'ellipse') {
    const fill = normalizeDrawnColor(raw.fill);
    const stroke = normalizeDrawnColor(raw.stroke);
    if (!fill || !stroke) return { ok: false, reason: `element ${index} (${type}): bad colour` };
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.w) || !isFiniteNumber(raw.h) || raw.w <= 0 || raw.h <= 0) {
      return { ok: false, reason: `element ${index} (${type}): bad geometry` };
    }
    const strokeWidth = optionalNumber(raw.strokeWidth, 0);
    if (type === 'rect') {
      const element: DrawnRectElement = {
        ...base,
        type: 'rect',
        x: raw.x,
        y: raw.y,
        w: raw.w,
        h: raw.h,
        fill,
        stroke,
        ...(strokeWidth !== undefined ? { strokeWidth } : {}),
        ...(optionalNumber(raw.radius, 0) !== undefined ? { radius: raw.radius as number } : {}),
        ...(typeof raw.dash === 'boolean' ? { dash: raw.dash } : {}),
        ...(parseItem(raw.item) !== undefined ? { item: raw.item as number } : {}),
      };
      return { ok: true, value: { element, rawId } };
    }
    const element: DrawnEllipseElement = {
      ...base,
      type: 'ellipse',
      x: raw.x,
      y: raw.y,
      w: raw.w,
      h: raw.h,
      fill,
      stroke,
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
      ...(parseItem(raw.item) !== undefined ? { item: raw.item as number } : {}),
    };
    return { ok: true, value: { element, rawId } };
  }

  if (type === 'polygon' || type === 'line') {
    const points = parsePoints(raw.points, type === 'polygon' ? 3 : 2);
    if (!points) return { ok: false, reason: `element ${index} (${type}): bad points` };
    if (type === 'polygon') {
      const fill = normalizeDrawnColor(raw.fill);
      const stroke = normalizeDrawnColor(raw.stroke);
      if (!fill || !stroke) return { ok: false, reason: `element ${index} (polygon): bad colour` };
      const element: DrawnPolygonElement = {
        ...base,
        type: 'polygon',
        points,
        fill,
        stroke,
        ...(parseItem(raw.item) !== undefined ? { item: raw.item as number } : {}),
      };
      return { ok: true, value: { element, rawId } };
    }
    const stroke = normalizeDrawnColor(raw.stroke);
    if (!stroke) return { ok: false, reason: `element ${index} (line): bad colour` };
    const strokeWidth = optionalNumber(raw.strokeWidth, 0);
    const arrow =
      raw.arrow === 'none' || raw.arrow === 'end' || raw.arrow === 'start' || raw.arrow === 'both'
        ? raw.arrow
        : undefined;
    const element: DrawnLineElement = {
      ...base,
      type: 'line',
      points,
      stroke,
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
      ...(typeof raw.dash === 'boolean' ? { dash: raw.dash } : {}),
      ...(arrow ? { arrow } : {}),
    };
    return { ok: true, value: { element, rawId } };
  }

  if (type === 'wedge') {
    const item = parseItem(raw.item);
    const fill = normalizeDrawnColor(raw.fill);
    if (item === undefined) return { ok: false, reason: `element ${index} (wedge): bad item` };
    if (!fill) return { ok: false, reason: `element ${index} (wedge): bad colour` };
    if (!isFiniteNumber(raw.cx) || !isFiniteNumber(raw.cy) || !isFiniteNumber(raw.r) || raw.r <= 0) {
      return { ok: false, reason: `element ${index} (wedge): bad geometry` };
    }
    const stroke = normalizeDrawnColor(raw.stroke);
    if (raw.stroke !== undefined && stroke === null) return { ok: false, reason: `element ${index} (wedge): bad stroke` };
    const inner = optionalNumber(raw.inner, 0);
    if (raw.inner !== undefined && (inner === undefined || inner >= raw.r)) {
      return { ok: false, reason: `element ${index} (wedge): bad inner` };
    }
    const element: DrawnWedgeElement = {
      ...base,
      type: 'wedge',
      item,
      cx: raw.cx,
      cy: raw.cy,
      r: raw.r,
      fill,
      ...(inner !== undefined ? { inner } : {}),
      ...(stroke ? { stroke } : {}),
    };
    return { ok: true, value: { element, rawId } };
  }

  if (type === 'bar') {
    const item = parseItem(raw.item);
    const fill = normalizeDrawnColor(raw.fill);
    if (item === undefined) return { ok: false, reason: `element ${index} (bar): bad item` };
    if (!fill) return { ok: false, reason: `element ${index} (bar): bad colour` };
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.w) || !isFiniteNumber(raw.h) || raw.w <= 0 || raw.h <= 0) {
      return { ok: false, reason: `element ${index} (bar): bad geometry` };
    }
    if (raw.orient !== 'v' && raw.orient !== 'h') return { ok: false, reason: `element ${index} (bar): bad orient` };
    const radius = optionalNumber(raw.radius, 0);
    const element: DrawnBarElement = {
      ...base,
      type: 'bar',
      item,
      x: raw.x,
      y: raw.y,
      w: raw.w,
      h: raw.h,
      orient: raw.orient,
      fill,
      ...(radius !== undefined ? { radius } : {}),
    };
    return { ok: true, value: { element, rawId } };
  }

  if (type === 'text') {
    if (typeof raw.text !== 'string' || raw.text.length === 0 || raw.text.length > DRAWN_TEXT_MAX) {
      return { ok: false, reason: `element ${index} (text): bad text` };
    }
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.w) || raw.w <= 0) {
      return { ok: false, reason: `element ${index} (text): bad geometry` };
    }
    if (!isFiniteNumber(raw.size) || raw.size < DRAWN_FONT_MIN || raw.size > DRAWN_FONT_MAX) {
      return { ok: false, reason: `element ${index} (text): bad size` };
    }
    const color = normalizeDrawnColor(raw.color);
    if (!color || color === 'none') return { ok: false, reason: `element ${index} (text): bad colour` };
    const align =
      raw.align === 'left' || raw.align === 'center' || raw.align === 'right' ? raw.align : undefined;
    const element: DrawnTextElement = {
      ...base,
      type: 'text',
      text: raw.text,
      x: raw.x,
      y: raw.y,
      w: raw.w,
      size: raw.size,
      color,
      ...(align ? { align } : {}),
      ...(typeof raw.bold === 'boolean' ? { bold: raw.bold } : {}),
      ...(typeof raw.in === 'string' && raw.in ? { in: raw.in } : {}),
      ...(parseItem(raw.item) !== undefined ? { item: raw.item as number } : {}),
    };
    return { ok: true, value: { element, rawId } };
  }

  if (type === 'icon') {
    if (!isVisualIconName(raw.name)) return { ok: false, reason: `element ${index} (icon): unknown icon name` };
    const color = normalizeDrawnColor(raw.color);
    if (!color || color === 'none') return { ok: false, reason: `element ${index} (icon): bad colour` };
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.size) || raw.size <= 0) {
      return { ok: false, reason: `element ${index} (icon): bad geometry` };
    }
    const element: DrawnIconElement = {
      ...base,
      type: 'icon',
      name: raw.name,
      x: raw.x,
      y: raw.y,
      size: raw.size,
      color,
      ...(parseItem(raw.item) !== undefined ? { item: raw.item as number } : {}),
    };
    return { ok: true, value: { element, rawId } };
  }

  return { ok: false, reason: `element ${index}: unknown type` };
}
