/**
 * PATCH-283 Addendum 2, fixes 5 and 6. Deterministic layout repair run after text
 * fitting and before the canvas pass:
 *
 *  - de-overlap: overlapping filled rect/ellipse cards are separated by moving
 *    the later one (down, or right when that is the smaller move), carrying its
 *    `in` texts, same-item texts inside it and connector endpoints. At most four
 *    passes; the canvas pass that follows grows the ground.
 *  - swatch: a free, left-aligned text that starts inside a small filled shape
 *    is moved to the shape's right edge + 8 px (the pie legend case).
 *
 * Pure and deterministic: no clocks, no randomness.
 */

import type { DrawnElement } from './format';
import {
  containsBox,
  containsPoint,
  elementBox,
  intersectionArea,
  isFilledShape,
  translateElement,
} from './geometry';

const OVERLAP_GAP = 16;
const MAX_PASSES = 4;
const SWATCH_MARGIN = 8;

function carriedBy(
  element: DrawnElement,
  target: DrawnElement,
  targetOriginal: { x: number; y: number; w: number; h: number },
): boolean {
  if (element === target) return false;
  if (element.type === 'text') {
    if (element.in === target.id) return true;
    const centerX = element.x + element.w / 2;
    const centerY = element.y + (element.boxHeight ?? 0) / 2;
    const targetItem = 'item' in target ? target.item : undefined;
    return (
      targetItem !== undefined &&
      element.item === targetItem &&
      containsPoint(targetOriginal, centerX, centerY)
    );
  }
  return false;
}

function carry(elements: DrawnElement[], target: DrawnElement, targetOriginal: { x: number; y: number; w: number; h: number }, dx: number, dy: number): void {
  for (const element of elements) {
    if (carriedBy(element, target, targetOriginal)) {
      translateElement(element, dx, dy);
      continue;
    }
    if (element.type !== 'line' || element.points.length === 0) continue;
    const last = element.points.length - 1;
    const first = element.points[0];
    const end = element.points[last];
    const moveFirst = containsPoint(targetOriginal, first[0], first[1]);
    const moveLast = containsPoint(targetOriginal, end[0], end[1]);
    if (!moveFirst && !moveLast) continue;
    const points = element.points.map(([x, y]) => [x, y] as [number, number]);
    if (moveFirst) points[0] = [first[0] + dx, first[1] + dy];
    if (moveLast) points[last] = [end[0] + dx, end[1] + dy];
    element.points = points;
  }
}

/** Separates overlapping filled rect/ellipse cards, four passes at most. */
export function deoverlap(elements: DrawnElement[], fixes: string[]): void {
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let moved = false;
    const cards = elements.filter(
      (element) => isFilledShape(element) && (element.type === 'rect' || element.type === 'ellipse'),
    );
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const shape = cards[i];
        const other = cards[j];
        const shapeBox = elementBox(shape);
        const otherBox = elementBox(other);
        if (intersectionArea(shapeBox, otherBox) <= 0) continue;
        if (containsBox(shapeBox, otherBox) || containsBox(otherBox, shapeBox)) continue;

        const overlapX = Math.min(shapeBox.x + shapeBox.w, otherBox.x + otherBox.w) - Math.max(shapeBox.x, otherBox.x);
        const overlapY = Math.min(shapeBox.y + shapeBox.h, otherBox.y + otherBox.h) - Math.max(shapeBox.y, otherBox.y);
        const right = overlapX + OVERLAP_GAP;
        const down = overlapY + OVERLAP_GAP;
        const dx = right < down ? right : 0;
        const dy = right < down ? 0 : down;

        const original = { ...otherBox };
        translateElement(other, dx, dy);
        carry(elements, other, original, dx, dy);
        fixes.push(`moved ${other.id} to remove overlap with ${shape.id}`);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Moves a free left-aligned legend text off a small swatch it starts inside. */
export function fixSwatches(elements: DrawnElement[], fixes: string[]): void {
  const shapes = elements.filter(isFilledShape);
  for (const element of elements) {
    if (element.type !== 'text' || element.in) continue;
    if (element.align && element.align !== 'left') continue;
    for (const shape of shapes) {
      const box = elementBox(shape);
      if (box.w > 2 * element.size || box.h > 2 * element.size) continue;
      if (!containsPoint(box, element.x, element.y)) continue;
      element.x = box.x + box.w + SWATCH_MARGIN;
      fixes.push(`moved text ${element.id} beside swatch ${shape.id}`);
      break;
    }
  }
}
