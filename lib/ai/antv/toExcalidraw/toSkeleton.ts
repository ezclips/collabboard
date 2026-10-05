/**
 * PATCH-277. Pure conversion: `PictureScene` -> `ExcalidrawElementSkeleton[]`
 * plus the files map. Everything Excalidraw-specific lives here and nowhere
 * else, so the scene stays portable.
 *
 * Wrapping note: the fork's main entry (`packages/excalidraw/index.tsx`) does
 * NOT export `wrapText`/`getFontString`, so this module measures with a canvas
 * `measureText` when a DOM is present and falls back to a per-character estimate
 * in node/jsdom (where there is no canvas). That fallback is what the unit tests
 * exercise; the code comment at `measureWidth` says which path is live.
 */

import type { ExcalidrawElementSkeleton } from '@excalidraw/element';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFileData } from '@excalidraw/excalidraw/types';

import { parseColor } from './paint';
import {
  FONT_FAMILY_CASCADIA,
  FONT_FAMILY_HELVETICA,
  PICTURE_GROUP_ID,
  ROUNDNESS_ADAPTIVE_RADIUS,
  type PictureScene,
  type SceneElement,
  type ScenePoint,
  type SceneRect,
  type SceneTextAlign,
} from './scene';
import { simplifyPolyline, stadiumPoints } from './simplify';
import { wrapToLineCount } from './textLayout';

export { rdp, stadiumPoints } from './simplify';
export { wrapToLineCount, wrapToWidth, measureWidth } from './textLayout';

/** Structural view of a converted element, for the text alignment pass. */
export interface AlignableElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  customData?: Record<string, unknown> | null;
}

export interface SkeletonOptions {
  /**
   * How to emit a pill/capsule. Addendum 4: the exact `polygon` outline is now
   * the DEFAULT (it matches AntV); `'rectangle'` restores the old
   * ADAPTIVE_RADIUS rounded box.
   */
  pill?: 'rectangle' | 'polygon';
}

export interface SkeletonResult {
  elements: ExcalidrawElementSkeleton[];
  files: Record<string, BinaryFileData>;
}

/** djb2, hex. Stable across runs, so identical icons dedupe to one file. */
export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}



interface Common {
  id: string;
  groupIds: string[];
  customData: { antvId: string; antvKind: SceneElement['kind'] };
}

function common(el: { id: string; groupIds: string[]; kind: SceneElement['kind'] }): Common {
  return {
    id: el.id,
    groupIds: el.groupIds,
    customData: { antvId: el.id, antvKind: el.kind },
  };
}

interface PaintLike {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: string;
}

function shapeStops(paint: PaintLike) {
  return {
    backgroundColor: paint.fill === 'none' ? 'transparent' : paint.fill,
    strokeColor: paint.stroke === 'none' ? 'transparent' : paint.stroke,
    strokeWidth: paint.strokeWidth,
    strokeStyle: paint.strokeStyle,
  };
}

function rectangleSkeleton(
  common: Common,
  box: SceneRect,
  roundness: null | { type: number },
  paint: PaintLike,
): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    ...common,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...shapeStops(paint),
    fillStyle: 'solid',
    roughness: 0,
    roundness,
    opacity: 100,
  } as unknown as ExcalidrawElementSkeleton;
}

/**
 * Addendum 2. Excalidraw's `restoreElements` re-validates polygons with
 * `isValidPolygon` (`points.length > 3 && points[0] === points[last]`), and
 * turns an open one into `polygon: false`, dropping its fill. AntV's sampled
 * wedge points do not repeat the first point, so close the ring ourselves.
 */
function closeRing(points: readonly ScenePoint[]): ScenePoint[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return [...points];
  return [...points, [first[0], first[1]]];
}

function polylineSkeleton(
  common: Common,
  el: Extract<SceneElement, { kind: 'polyline' }>,
): ExcalidrawElementSkeleton | null {
  const reduced = simplifyPolyline(el.points, el.closed);
  if (reduced.length < 2) return null;
  const isPolygon = el.closed && el.filled;
  const points = isPolygon ? closeRing(reduced) : reduced;
  const minX = Math.min(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  const local = points.map(([px, py]) => [px - minX, py - minY] as [number, number]);
  const width = Math.abs(Math.max(...points.map((p) => p[0])) - minX);
  const height = Math.abs(Math.max(...points.map((p) => p[1])) - minY);
  const stops = shapeStops(el.paint);
  const isArrow = el.arrowStart || el.arrowEnd;
  if (isArrow) {
    return {
      type: 'arrow',
      ...common,
      x: minX,
      y: minY,
      width,
      height,
      points: local,
      startArrowhead: el.arrowStart ? 'triangle' : null,
      endArrowhead: el.arrowEnd ? 'triangle' : null,
      ...stops,
      fillStyle: 'solid',
      roughness: 0,
      opacity: 100,
    } as unknown as ExcalidrawElementSkeleton;
  }
  return {
    type: 'line',
    ...common,
    x: minX,
    y: minY,
    width,
    height,
    points: local,
    polygon: isPolygon,
    ...stops,
    fillStyle: 'solid',
    roughness: 0,
    opacity: 100,
  } as unknown as ExcalidrawElementSkeleton;
}

function textSkeleton(
  el: Extract<SceneElement, { kind: 'text' }>,
): ExcalidrawElementSkeleton {
  const wrapped = wrapToLineCount(el.text, el.fontSize, el.box.width, el.monospace, el.lineCount);
  return {
    type: 'text',
    ...common(el),
    x: el.box.x,
    y: el.box.y,
    text: wrapped,
    fontSize: el.fontSize,
    fontFamily: el.monospace ? FONT_FAMILY_CASCADIA : FONT_FAMILY_HELVETICA,
    strokeColor: el.color,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    textAlign: el.align,
    verticalAlign: 'top',
    roughness: 0,
    opacity: 100,
  } as unknown as ExcalidrawElementSkeleton;
}

function imageSkeleton(
  el: Extract<SceneElement, { kind: 'image' }>,
  files: Record<string, BinaryFileData>,
): ExcalidrawElementSkeleton {
  const fileId = stableHash(el.dataURL);
  if (!files[fileId]) {
    files[fileId] = {
      id: fileId as unknown as BinaryFileData['id'],
      mimeType: el.mimeType as BinaryFileData['mimeType'],
      dataURL: el.dataURL as BinaryFileData['dataURL'],
      created: 0,
    };
  }
  return {
    type: 'image',
    ...common(el),
    x: el.box.x,
    y: el.box.y,
    width: el.box.width,
    height: el.box.height,
    fileId,
    status: 'saved',
    opacity: 100,
  } as unknown as ExcalidrawElementSkeleton;
}

/** Converts a scene into Excalidraw skeletons and the deduped files map. */
export function toSkeleton(scene: PictureScene, options: SkeletonOptions = {}): SkeletonResult {
  const files: Record<string, BinaryFileData> = {};
  const elements: ExcalidrawElementSkeleton[] = [
    {
      type: 'rectangle',
      id: 'background',
      x: 0,
      y: 0,
      width: scene.width,
      height: scene.height,
      backgroundColor: scene.background,
      strokeColor: 'transparent',
      strokeWidth: 0,
      fillStyle: 'solid',
      roughness: 0,
      roundness: null,
      opacity: 100,
      groupIds: [PICTURE_GROUP_ID],
      customData: { antvId: 'background', antvKind: 'background' },
    } as unknown as ExcalidrawElementSkeleton,
  ];

  for (const el of scene.elements) {
    const base = common(el);
    if (el.kind === 'rect') {
      if (el.pill && options.pill !== 'rectangle') {
        const points = stadiumPoints(el.box);
        const minX = Math.min(...points.map((p) => p[0]));
        const minY = Math.min(...points.map((p) => p[1]));
        const local = points.map(([px, py]) => [px - minX, py - minY] as [number, number]);
        elements.push({
          type: 'line',
          ...base,
          x: minX,
          y: minY,
          width: Math.max(...points.map((p) => p[0])) - minX,
          height: Math.max(...points.map((p) => p[1])) - minY,
          points: local,
          polygon: true,
          backgroundColor: el.paint.fill === 'none' ? 'transparent' : el.paint.fill,
          strokeColor: el.paint.stroke === 'none' ? 'transparent' : el.paint.stroke,
          strokeWidth: el.paint.strokeWidth,
          strokeStyle: el.paint.strokeStyle,
          fillStyle: 'solid',
          roughness: 0,
          opacity: 100,
        } as unknown as ExcalidrawElementSkeleton);
        continue;
      }
      const roundness = el.radius > 0 ? { type: ROUNDNESS_ADAPTIVE_RADIUS } : null;
      elements.push(rectangleSkeleton(base, el.box, roundness, el.paint));
      continue;
    }
    if (el.kind === 'ellipse') {
      elements.push({
        type: 'ellipse',
        ...base,
        x: el.box.x,
        y: el.box.y,
        width: el.box.width,
        height: el.box.height,
        ...shapeStops(el.paint),
        fillStyle: 'solid',
        roughness: 0,
        opacity: 100,
      } as unknown as ExcalidrawElementSkeleton);
      continue;
    }
    if (el.kind === 'polyline') {
      const skeleton = polylineSkeleton(base, el);
      if (skeleton) elements.push(skeleton);
      continue;
    }
    if (el.kind === 'text') {
      elements.push(textSkeleton(el));
      continue;
    }
    if (el.kind === 'image') {
      elements.push(imageSkeleton(el, files));
    }
  }

  return { elements, files };
}

/**
 * Post-pass after `convertToExcalidrawElements` computed each text's width and
 * height: moves `x` so a centered/right-aligned text block sits where AntV drew
 * it, and `y` so the element's vertical centre matches the source text box's
 * (Addendum 4: Excalidraw's line height differs from the browser's, which left
 * pill-badge labels at the top edge).
 */
export function alignTextElements(elements: AlignableElement[], scene: PictureScene): void {
  const byId = new Map<string, AlignableElement>();
  for (const element of elements) {
    if (element.type === 'text') byId.set(element.id, element);
  }
  for (const el of scene.elements) {
    if (el.kind !== 'text') continue;
    const target = byId.get(el.id);
    if (!target) continue;
    const align: SceneTextAlign = el.align;
    if (align === 'center') target.x = el.box.x + (el.box.width - target.width) / 2;
    else if (align === 'right') target.x = el.box.x + el.box.width - target.width;
    else target.x = el.box.x;
    target.y = el.box.y + (el.box.height - target.height) / 2;
  }
}

export type { ExcalidrawElement };
