/**
 * PATCH-283 Addendum 2. Shared geometry for the repair passes: bounding boxes,
 * overlap/containment tests and translation of a whole element. Pure and
 * dependency-free apart from the text line height.
 */

import type { DrawnElement } from './format';
import { lineHeight } from './textMetrics';

export interface DrawnBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The axis-aligned bounding box of an element, in drawn picture coordinates. */
export function elementBox(element: DrawnElement): DrawnBox {
  if (element.type === 'polygon' || element.type === 'line') {
    const xs = element.points.map((point) => point[0]);
    const ys = element.points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  if (element.type === 'icon') return { x: element.x, y: element.y, w: element.size, h: element.size };
  if (element.type === 'wedge') {
    return { x: element.cx - element.r, y: element.cy - element.r, w: 2 * element.r, h: 2 * element.r };
  }
  if (element.type === 'text') {
    return { x: element.x, y: element.y, w: element.w, h: element.boxHeight ?? lineHeight(element.size) };
  }
  return { x: element.x, y: element.y, w: element.w, h: element.h };
}

/** True for a shape that paints a filled area the over-lap test cares about. */
export function isFilledShape(element: DrawnElement): boolean {
  return (
    (element.type === 'rect' || element.type === 'ellipse' || element.type === 'polygon' || element.type === 'bar') &&
    element.fill !== 'none'
  );
}

export function intersectionArea(a: DrawnBox, b: DrawnBox): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

export function containsBox(outer: DrawnBox, inner: DrawnBox): boolean {
  return (
    outer.x <= inner.x + 0.001 &&
    outer.y <= inner.y + 0.001 &&
    outer.x + outer.w >= inner.x + inner.w - 0.001 &&
    outer.y + outer.h >= inner.y + inner.h - 0.001
  );
}

export function containsPoint(box: DrawnBox, x: number, y: number): boolean {
  return x >= box.x - 0.001 && x <= box.x + box.w + 0.001 && y >= box.y - 0.001 && y <= box.y + box.h + 0.001;
}

/** Translates an element in place. Point-based elements get a fresh point array. */
export function translateElement(element: DrawnElement, dx: number, dy: number): void {
  if (element.type === 'polygon' || element.type === 'line') {
    element.points = element.points.map(([x, y]) => [x + dx, y + dy] as [number, number]);
  } else if (element.type === 'wedge') {
    element.cx += dx;
    element.cy += dy;
  } else {
    element.x += dx;
    element.y += dy;
  }
}
