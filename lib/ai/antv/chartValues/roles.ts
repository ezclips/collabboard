/**
 * PATCH-287. `assignRoles(scene)` names every converted element by the part of
 * the chart it is. It is the old-render ↔ new-render matching key for a redraw,
 * so it must be deterministic: the same SVG always yields the same roles.
 *
 * Role grammar:
 *   - background element            -> `background`
 *   - indexed element (has
 *     `data-indexes`)               -> `<elementType|kind>@<i,j>#<n>`
 *   - unindexed element             -> `<elementType|kind>#<n>`
 * `n` counts earlier elements with the same prefix in document order.
 */

import type { PictureScene, SceneElement } from '../toExcalidraw/scene';

/** The role of the picture's background rectangle (emitted by `toSkeleton`). */
export const BACKGROUND_ROLE = 'background';

export interface ParsedRole {
  type: string;
  indexes: number[];
  n: number;
  indexed: boolean;
}

/** Parse a role string back into type/indexes/occurrence, or `null`. */
export function parseRole(role: string): ParsedRole | null {
  if (role === BACKGROUND_ROLE) {
    return { type: BACKGROUND_ROLE, indexes: [], n: 0, indexed: false };
  }
  const hash = role.lastIndexOf('#');
  if (hash <= 0) return null;
  const n = Number(role.slice(hash + 1));
  if (!Number.isInteger(n) || n < 0) return null;
  const body = role.slice(0, hash);
  const at = body.indexOf('@');
  if (at < 0) {
    if (body.length === 0) return null;
    return { type: body, indexes: [], n, indexed: false };
  }
  const type = body.slice(0, at);
  const indexes = body.slice(at + 1).split(',').map(Number);
  if (type.length === 0 || indexes.length === 0) return null;
  if (indexes.some((value) => !Number.isInteger(value) || value < 0)) return null;
  return { type, indexes, n, indexed: true };
}

/** The item index an indexed role points at (the first `data-indexes`). */
export function roleItemIndex(role: string): number | null {
  const parsed = parseRole(role);
  if (!parsed || !parsed.indexed || parsed.indexes.length === 0) return null;
  return parsed.indexes[0];
}

function roleFor(el: SceneElement, counters: Map<string, number>): string {
  const base = el.source.elementType ?? el.kind;
  const indexes = el.source.indexes;
  const prefix = indexes ? `${base}@${indexes.join(',')}` : base;
  const n = counters.get(prefix) ?? 0;
  counters.set(prefix, n + 1);
  return `${prefix}#${n}`;
}

/** A role for every scene element plus the background, in document order. */
export function assignRoles(scene: PictureScene): Map<string, string> {
  const roles = new Map<string, string>();
  roles.set('background', BACKGROUND_ROLE);
  const counters = new Map<string, number>();
  for (const el of scene.elements) {
    roles.set(el.id, roleFor(el, counters));
  }
  return roles;
}
