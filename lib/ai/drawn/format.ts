/**
 * PATCH-283 A. DrawnPicture v1: the compact authoring format the AI writes for an
 * AI-drawn picture. All coordinates are px with the origin at the top-left;
 * colours are `'#rrggbb'` or `'none'`. `parseDrawnPicture` is tolerant: one bad
 * element is dropped with a reason instead of failing the whole picture, and it
 * throws only when the root is unusable or nothing valid remains.
 */

import { clampSize, isObject, normalizeDrawnColor, uniqueId } from './parseHelpers';
import { parseElement, type RawElement } from './parseElements';

export {
  DRAWN_FONT_MAX,
  DRAWN_FONT_MIN,
  DRAWN_SIZE_MAX,
  DRAWN_SIZE_MIN,
  DRAWN_TEXT_MAX,
  normalizeDrawnColor,
} from './parseHelpers';

export const DRAWN_PICTURE_VERSION = 1 as const;
export const DRAWN_MAX_ELEMENTS = 150;

export type DrawnTextAlign = 'left' | 'center' | 'right';
export type DrawnArrow = 'none' | 'end' | 'start' | 'both';

/**
 * `startAngle` / `endAngle` and text `lines` / `boxHeight` are computed by
 * `repairPicture`, never by the model. They are optional so a freshly parsed
 * picture is valid before repair runs.
 */
export interface DrawnRectElement {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  radius?: number;
  dash?: boolean;
  item?: number;
}

export interface DrawnEllipseElement {
  id: string;
  type: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  item?: number;
}

export interface DrawnPolygonElement {
  id: string;
  type: 'polygon';
  points: [number, number][];
  fill: string;
  stroke: string;
  item?: number;
}

export interface DrawnLineElement {
  id: string;
  type: 'line';
  points: [number, number][];
  stroke: string;
  strokeWidth?: number;
  dash?: boolean;
  arrow?: DrawnArrow;
}

export interface DrawnWedgeElement {
  id: string;
  type: 'wedge';
  item: number;
  cx: number;
  cy: number;
  r: number;
  inner?: number;
  fill: string;
  stroke?: string;
  startAngle?: number;
  endAngle?: number;
}

export interface DrawnBarElement {
  id: string;
  type: 'bar';
  item: number;
  x: number;
  y: number;
  w: number;
  h: number;
  orient: 'v' | 'h';
  fill: string;
  radius?: number;
}

export interface DrawnTextElement {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  w: number;
  size: number;
  color: string;
  align?: DrawnTextAlign;
  bold?: boolean;
  in?: string;
  item?: number;
  lines?: string[];
  boxHeight?: number;
}

export interface DrawnIconElement {
  id: string;
  type: 'icon';
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  item?: number;
}

export type DrawnElement =
  | DrawnRectElement
  | DrawnEllipseElement
  | DrawnPolygonElement
  | DrawnLineElement
  | DrawnWedgeElement
  | DrawnBarElement
  | DrawnTextElement
  | DrawnIconElement;

export interface DrawnPicture {
  version: typeof DRAWN_PICTURE_VERSION;
  width: number;
  height: number;
  background: string;
  elements: DrawnElement[];
}

export interface DrawnParseResult {
  picture: DrawnPicture;
  dropped: string[];
}

/** Thrown only when the root is not an object or no valid element remains. */
export class DrawnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawnParseError';
  }
}

/**
 * Validates an unknown value into a DrawnPicture. Every invalid element is
 * dropped with a reason; the parser throws only when the root is not an object
 * or no valid element remains.
 */
export function parseDrawnPicture(raw: unknown): DrawnParseResult {
  if (!isObject(raw)) throw new DrawnParseError('DrawnPicture must be an object.');

  const dropped: string[] = [];
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  if (rawElements.length > DRAWN_MAX_ELEMENTS) {
    dropped.push(`more than ${DRAWN_MAX_ELEMENTS} elements; extras dropped`);
  }

  const accepted: RawElement['element'][] = [];
  for (let index = 0; index < Math.min(rawElements.length, DRAWN_MAX_ELEMENTS); index += 1) {
    const result = parseElement(rawElements[index], index);
    if (result.ok) accepted.push(result.value.element);
    else dropped.push(result.reason);
  }

  const used = new Set<string>();
  const ids = accepted.map((element, index) => uniqueId((element.id as string | undefined) || `el-${index}`, used));
  const elements = accepted.map((element, index) => ({ ...element, id: ids[index] })) as DrawnElement[];

  const containerIds = new Set(
    elements.filter((element) => element.type === 'rect' || element.type === 'ellipse').map((element) => element.id),
  );
  const kept = elements.filter((element, index) => {
    if (element.type !== 'text' || !element.in) return true;
    if (containerIds.has(element.in)) return true;
    dropped.push(`element ${index} (text): unknown container "${element.in}"`);
    return false;
  });

  if (kept.length === 0) throw new DrawnParseError('DrawnPicture has no usable elements.');

  const background = normalizeDrawnColor(raw.background) ?? '#ffffff';
  return {
    picture: {
      version: DRAWN_PICTURE_VERSION,
      width: clampSize(raw.width, 800),
      height: clampSize(raw.height, 600),
      background: background === 'none' ? '#ffffff' : background,
      elements: kept,
    },
    dropped,
  };
}
