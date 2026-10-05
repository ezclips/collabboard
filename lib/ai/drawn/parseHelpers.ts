/**
 * PATCH-283 A. Pure coercion helpers for the tolerant DrawnPicture parser, split
 * out of `format.ts` so each file stays under the 400-line ceiling. No types from
 * the format live here, so there is no import cycle.
 */

export const DRAWN_SIZE_MIN = 240;
export const DRAWN_SIZE_MAX = 2400;
export const DRAWN_TEXT_MAX = 300;
export const DRAWN_FONT_MIN = 9;
export const DRAWN_FONT_MAX = 72;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Lower-case `#rrggbb` (3-digit expanded) or `'none'`; anything else is null. */
export function normalizeDrawnColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const colour = value.trim().toLowerCase();
  if (colour === 'none') return 'none';
  if (/^#[0-9a-f]{3}$/.test(colour)) {
    return `#${colour.slice(1).split('').map((c) => c + c).join('')}`;
  }
  if (/^#[0-9a-f]{6}$/.test(colour)) return colour;
  return null;
}

export function clampSize(value: unknown, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(DRAWN_SIZE_MAX, Math.max(DRAWN_SIZE_MIN, Math.round(value)));
}

export function optionalNumber(value: unknown, min: number): number | undefined {
  if (!isFiniteNumber(value) || value < min) return undefined;
  return value;
}

export function parseItem(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function parsePoints(value: unknown, minimum: number): [number, number][] | null {
  if (!Array.isArray(value) || value.length < minimum) return null;
  const points: [number, number][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2 || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) {
      return null;
    }
    points.push([point[0], point[1]]);
  }
  return points;
}

export function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}
