/**
 * PATCH-283 C + Addendum 2. The deterministic repair pass. The AI never decides
 * what it is bad at: data proportions and text fitting are computed here, layout
 * overlaps are separated, and remaining problems are REPORTED rather than
 * silently guessed at. Pure and deterministic -- repairing twice equals once.
 *
 * Addendum 2 keeps this file thin: text stacking lives in `textFit.ts`, the
 * de-overlap and swatch moves in `layoutFix.ts`, and shared geometry in
 * `geometry.ts`.
 */

import type { VisualOutline } from '@/lib/ai/outline';

import type { DrawnBarElement, DrawnElement, DrawnPicture } from './format';
import { containsBox, elementBox, intersectionArea, isFilledShape, translateElement } from './geometry';
import { deoverlap, fixSwatches } from './layoutFix';
import type { DrawnKind } from './prompt';
import { fitTexts } from './textFit';
import { lineHeight } from './textMetrics';

export type DrawnIssueType =
  | 'no-data'
  | 'overlap'
  | 'text-overlap'
  | 'text-crosses-shape'
  | 'tiny-text'
  | 'missing-label';

export interface DrawnIssue {
  type: DrawnIssueType;
  message: string;
}

export interface RepairResult {
  picture: DrawnPicture;
  fixes: string[];
  issues: DrawnIssue[];
}

const CANVAS_MARGIN = 24;
const OVERLAP_FRACTION = 0.15;
const LABEL_FOLLOW_RADIUS = 48;

function positiveValue(outline: VisualOutline, item: number | undefined): number | undefined {
  if (item === undefined) return undefined;
  const value = outline.items[item]?.value;
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** Step 1. Wedges and bars: the data geometry is computed from the outline. */
function repairData(
  elements: DrawnElement[],
  outline: VisualOutline,
  kind: DrawnKind | undefined,
  fixes: string[],
  issues: DrawnIssue[],
): DrawnElement[] {
  const wedges = elements.filter((element) => element.type === 'wedge');
  const keptWedges = wedges.filter((wedge) => positiveValue(outline, wedge.item) !== undefined);
  if (wedges.length > keptWedges.length) {
    fixes.push(`dropped ${wedges.length - keptWedges.length} wedge(s) without a value`);
  }
  if (wedges.length > 0 && keptWedges.length === 0) {
    issues.push({ type: 'no-data', message: 'A pie picture has no item values.' });
  }
  if (keptWedges.length > 0) {
    const total = keptWedges.reduce((sum, wedge) => sum + (positiveValue(outline, wedge.item) ?? 0), 0);
    const itemOrder = [...new Set(keptWedges.map((wedge) => wedge.item))].sort((a, b) => a - b);
    let cursor = 0;
    for (const item of itemOrder) {
      const value = positiveValue(outline, item) ?? 0;
      const start = cursor;
      cursor += (value / total) * Math.PI * 2;
      for (const wedge of keptWedges) {
        if (wedge.item !== item) continue;
        wedge.startAngle = start;
        wedge.endAngle = cursor;
      }
    }
  }

  const bars = elements.filter((element): element is DrawnBarElement => element.type === 'bar');
  const valuedBars = bars.filter((bar) => positiveValue(outline, bar.item) !== undefined);
  if (valuedBars.length > 0) {
    const maxValue = Math.max(...valuedBars.map((bar) => positiveValue(outline, bar.item) ?? 0));
    const reference = Math.max(...valuedBars.map((bar) => (bar.orient === 'v' ? bar.h : bar.w)));
    const originals = valuedBars.map((bar) => ({ x: bar.x, y: bar.y, w: bar.w, h: bar.h }));

    valuedBars.forEach((bar, index) => {
      const length = ((positiveValue(outline, bar.item) ?? 0) / maxValue) * reference;
      if (bar.orient === 'v') {
        const bottom = originals[index].y + originals[index].h;
        bar.h = length;
        bar.y = bottom - length;
      } else {
        bar.w = length;
      }
    });

    // Fix 2b. Value labels that sat just beyond the bar's original free end move
    // with it, so they do not float where the model guessed its own height.
    valuedBars.forEach((bar, index) => {
      const original = originals[index];
      const vertical = bar.orient === 'v';
      const delta = vertical ? bar.y - original.y : bar.x - original.x;
      if (delta === 0) return;
      const freeEnd = vertical ? original.y : original.x + original.w;
      for (const element of elements) {
        if (element.type !== 'text' || element.item !== bar.item) continue;
        const edge = vertical ? element.y + (element.boxHeight ?? lineHeight(element.size)) : element.x;
        if (Math.abs(edge - freeEnd) > LABEL_FOLLOW_RADIUS) continue;
        if (vertical) element.y += delta;
        else element.x += delta;
      }
    });

    fixes.push('scaled bars to their values');
  } else if (kind === 'bar') {
    issues.push({ type: 'no-data', message: 'A bar picture has no item values.' });
  }

  return elements.filter((element) => element.type !== 'wedge' || positiveValue(outline, element.item) !== undefined);
}

/** Step 4. Keeps all content on the canvas with a 24px margin. */
function repairCanvas(elements: DrawnElement[], width: number, height: number, fixes: string[]): { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    const box = elementBox(element);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  if (!Number.isFinite(minX)) return { width, height };

  const dx = Math.max(0, CANVAS_MARGIN - minX);
  const dy = Math.max(0, CANVAS_MARGIN - minY);
  if (dx > 0 || dy > 0) {
    for (const element of elements) translateElement(element, dx, dy);
    fixes.push('translated content inside the canvas');
  }

  const nextWidth = Math.max(width, maxX + dx + CANVAS_MARGIN);
  const nextHeight = Math.max(height, maxY + dy + CANVAS_MARGIN);
  if (nextWidth > width || nextHeight > height) fixes.push('enlarged the canvas to fit its content');
  return { width: nextWidth, height: nextHeight };
}

/** Step 5. Reports layout problems; never mends them silently. */
function collectIssues(elements: DrawnElement[], outline: VisualOutline, issues: DrawnIssue[]): void {
  const shapes = elements.filter(isFilledShape);
  const texts = elements.filter((element) => element.type === 'text');

  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const a = elementBox(shapes[i]);
      const b = elementBox(shapes[j]);
      const area = intersectionArea(a, b);
      if (area <= 0) continue;
      if (containsBox(a, b) || containsBox(b, a)) continue;
      if (area > OVERLAP_FRACTION * Math.min(a.w * a.h, b.w * b.h)) {
        issues.push({ type: 'overlap', message: `Shapes ${shapes[i].id} and ${shapes[j].id} overlap.` });
      }
    }
  }

  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      if (intersectionArea(elementBox(texts[i]), elementBox(texts[j])) > 0) {
        issues.push({ type: 'text-overlap', message: `Text ${texts[i].id} and ${texts[j].id} overlap.` });
      }
    }
  }

  for (const text of texts) {
    if (text.type !== 'text') continue;
    if (text.size < 10) issues.push({ type: 'tiny-text', message: `Text ${text.id} is smaller than 10px.` });
    if (text.in) continue;
    const textBox = elementBox(text);
    for (const shape of shapes) {
      const shapeBox = elementBox(shape);
      if (intersectionArea(textBox, shapeBox) <= 0) continue;
      if (containsBox(shapeBox, textBox) || containsBox(textBox, shapeBox)) continue;
      issues.push({ type: 'text-crosses-shape', message: `Text ${text.id} crosses the border of ${shape.id}.` });
    }
  }

  for (const item of outline.items) {
    const label = item.label.toLowerCase();
    if (!label) continue;
    const found = texts.some((text) => text.text.toLowerCase().includes(label));
    if (!found) issues.push({ type: 'missing-label', message: `No text shows the label "${item.label}".` });
  }
}

/** Rewrites a picture in place of the model's guesses: data, text, layout, canvas. */
export function repairPicture(picture: DrawnPicture, outline: VisualOutline, kind?: DrawnKind): RepairResult {
  const fixes: string[] = [];
  const issues: DrawnIssue[] = [];
  const elements = picture.elements.map((element) => ({ ...element })) as DrawnElement[];

  fitTexts(elements, fixes);
  const laidOut = repairData(elements, outline, kind, fixes, issues);
  fixSwatches(laidOut, fixes);
  deoverlap(laidOut, fixes);
  const canvas = repairCanvas(laidOut, picture.width, picture.height, fixes);
  collectIssues(laidOut, outline, issues);

  return {
    picture: { ...picture, width: canvas.width, height: canvas.height, elements: laidOut },
    fixes,
    issues,
  };
}
