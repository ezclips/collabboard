/**
 * PATCH-273. Per-design presentation edits: `VisualOutline.elementOverridesByTemplate`
 * keeps one `ElementOverrides` map per design, keyed by template, so switching
 * designs never loses another design's moves/colours/additions. The flat
 * `elementOverrides` slot is retained and always mirrors the most recently
 * edited design, so every existing reader keeps working.
 *
 * Pure data only: no DOM, no AntV engine, no React. Extracted from
 * `elementOverrides.ts` to keep that file under the 800-line ceiling (PATCH-273
 * cleanup); no behaviour changed by the move.
 */

import type { VisualOutline } from '@/lib/ai/outline';

import { sanitizeElementOverrides, type ElementOverrides } from './elementOverrides';

/**
 * PATCH-273. At most this many designs keep their own edit map; a 13th write
 * drops the least recently written entry (insertion order = recency).
 */
export const ELEMENT_OVERRIDES_BY_TEMPLATE_MAX = 12;

/** PATCH-273. True when an overrides map holds no item, addition or orphan. */
export function isEmptyElementOverrides(overrides: ElementOverrides | undefined): boolean {
  return (
    !overrides ||
    (Object.keys(overrides.items).length === 0 &&
      (overrides.additions?.length ?? 0) === 0 &&
      Object.keys(overrides.orphaned ?? {}).length === 0)
  );
}

/**
 * PATCH-273. A NEW outline without `elementOverrides` and without
 * `elementOverridesByTemplate` (never mutates input). Both fields are stripped
 * because both carry user presentation edits; content comparison must ignore
 * either one.
 */
export function withoutElementOverrides(outline: VisualOutline): VisualOutline {
  if (outline.elementOverrides === undefined && outline.elementOverridesByTemplate === undefined) {
    return outline;
  }
  const next: VisualOutline = { ...outline };
  delete next.elementOverrides;
  delete next.elementOverridesByTemplate;
  return next;
}

/**
 * PATCH-273. Validates a per-design override map: a record whose keys are the
 * design names and whose values are `ElementOverrides`. An entry is kept only
 * when its key matches its own `template` and it is not empty; unknown/junk
 * entries are dropped. Capped at `ELEMENT_OVERRIDES_BY_TEMPLATE_MAX` by
 * insertion order (the map's key order is recency). Never throws.
 */
export function sanitizeElementOverridesByTemplate(
  raw: unknown,
): Record<string, ElementOverrides> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const out: Record<string, ElementOverrides> = {};
  let kept = 0;
  for (const key of Object.keys(source)) {
    if (kept >= ELEMENT_OVERRIDES_BY_TEMPLATE_MAX) break;
    const entry = sanitizeElementOverrides(source[key]);
    if (!entry || entry.template !== key || isEmptyElementOverrides(entry)) continue;
    out[key] = entry;
    kept += 1;
  }
  return kept > 0 ? out : undefined;
}

/**
 * PATCH-273. The edit map for ONE design. Prefers the per-design map; falls back
 * to the legacy flat `elementOverrides` slot when its template matches. Legacy
 * posts with only `elementOverrides` therefore keep their edits.
 */
export function overridesForTemplate(
  outline: VisualOutline,
  template: string,
): ElementOverrides | undefined {
  const mapped = outline.elementOverridesByTemplate?.[template];
  if (mapped) return mapped;
  const legacy = outline.elementOverrides;
  return legacy && legacy.template === template ? legacy : undefined;
}

/**
 * PATCH-273. A NEW outline with `template`'s entry set to `overrides` (or removed
 * when empty). The legacy `elementOverrides` slot is seeded into the map first
 * when it was the only copy, so nothing is lost. The edited key is re-inserted
 * last (recency); a full map drops its least recently written entry. The flat
 * `elementOverrides` always mirrors the edited entry. Pure.
 */
export function outlineWithTemplateOverrides(
  outline: VisualOutline,
  template: string,
  overrides: ElementOverrides | undefined,
): VisualOutline {
  const map: Record<string, ElementOverrides> = { ...(outline.elementOverridesByTemplate ?? {}) };

  // Seed the legacy flat slot into the map first, when it was the only copy of a
  // design's edits, so this write never loses it (PATCH-273 fallback hygiene).
  const legacy = outline.elementOverrides;
  if (legacy && !map[legacy.template] && !isEmptyElementOverrides(legacy)) {
    map[legacy.template] = legacy;
  }

  delete map[template];
  const empty = isEmptyElementOverrides(overrides);

  if (!empty) {
    // (Re-)insert last: insertion order is recency, so the edited key is newest.
    map[template] = overrides as ElementOverrides;
    // Enforce the cap by dropping the oldest (first) keys.
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length - ELEMENT_OVERRIDES_BY_TEMPLATE_MAX; i += 1) {
      delete map[keys[i]];
    }
  }

  const next: VisualOutline = { ...outline };
  if (Object.keys(map).length > 0) next.elementOverridesByTemplate = map;
  else delete next.elementOverridesByTemplate;

  if (empty) {
    delete next.elementOverrides;
  } else {
    next.elementOverrides = overrides as ElementOverrides;
  }
  return next;
}
