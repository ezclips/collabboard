/**
 * PATCH-274. Structural edits (add / remove / reorder an item) shift item
 * positions, but element override keys are POSITIONAL (`type@<data-indexes>`).
 * Codex F4: recolour item B at index 1, remove item A at index 0, and the
 * override now lands on C, while B loses it. This module rewrites every stored
 * override key so it keeps following its item's stable `id`.
 *
 * Pure: no DOM, no AntV, no React, never mutates its input.
 */

import type { VisualOutline } from '@/lib/ai/outline';

import {
  ELEMENT_ORPHANED_MAX_KEYS,
  type ElementOverride,
  type ElementOverrides,
} from './elementOverrides';
import { isHierarchyTemplate, outlineItemIndexForElementPath } from './mapOutline';

/** A key with an `@indexes` part (the part that can be positional). */
const KEY_WITH_INDEXES = /^([a-z-]{1,40})@([0-9]+(?:,[0-9]+)*)(#[0-9]{1,4})?$/;

function idSequence(outline: VisualOutline): string {
  return outline.items.map((item) => item.id ?? '').join('|');
}

/**
 * PATCH-274. Rewrites ONE element key for the new item order, or returns `null`
 * when the key's item no longer exists (it must be orphaned):
 *   - keys without `@indexes` (e.g. `title#0`) are returned unchanged;
 *   - the key's item-level index is its first index for flat designs, the index
 *     after the root for hierarchy designs (the shared `mapOutline` rule);
 *   - child indexes after the item index are left unchanged.
 */
export function remapElementKey(
  key: string,
  prev: VisualOutline,
  newIndexById: Map<string, number>,
  template: string,
): string | null {
  const match = KEY_WITH_INDEXES.exec(key);
  if (!match) return key;
  const type = match[1];
  const ordinal = match[3] ?? '';
  const indexes = match[2].split(',').map(Number);

  const itemIndex = outlineItemIndexForElementPath(indexes, template);
  if (itemIndex === null) return key;
  const id = prev.items[itemIndex]?.id;
  if (!id) return key;

  const newIndex = newIndexById.get(id);
  if (newIndex === undefined) return null;

  const position = isHierarchyTemplate(template) ? 1 : 0;
  const rewritten = indexes.slice();
  rewritten[position] = newIndex;
  return `${type}@${rewritten.join(',')}${ordinal}`;
}

/** PATCH-274. Rewrites every key of one design's map, orphaning removed ones. */
function remapEntry(
  entry: ElementOverrides,
  prev: VisualOutline,
  newIndexById: Map<string, number>,
): ElementOverrides {
  const items: Record<string, ElementOverride> = {};
  const orphaned: Record<string, ElementOverride> = { ...(entry.orphaned ?? {}) };
  let orphanCount = Object.keys(orphaned).length;

  for (const [key, override] of Object.entries(entry.items)) {
    const mapped = remapElementKey(key, prev, newIndexById, entry.template);
    if (mapped === null) {
      // Recoverable data instead of silently retargeting: keep the override
      // aside, never applied, capped like additions.
      if (orphanCount < ELEMENT_ORPHANED_MAX_KEYS && !(key in orphaned)) {
        orphaned[key] = override;
        orphanCount += 1;
      }
    } else {
      items[mapped] = override;
    }
  }

  return {
    template: entry.template,
    items,
    ...(entry.additions?.length ? { additions: entry.additions } : {}),
    ...(orphanCount > 0 ? { orphaned } : {}),
  };
}

/**
 * PATCH-274. A NEW outline whose override keys follow their items' stable ids
 * across an add/remove/reorder. Rewrites EVERY template entry in
 * `elementOverridesByTemplate` and the mirrored flat `elementOverrides`. When
 * the sequence of item ids is unchanged the input is returned as-is (identity).
 */
export function remapOverridesForItems(prev: VisualOutline, next: VisualOutline): VisualOutline {
  if (idSequence(prev) === idSequence(next)) return next;

  const newIndexById = new Map<string, number>();
  next.items.forEach((item, index) => {
    if (item.id) newIndexById.set(item.id, index);
  });

  const out: VisualOutline = { ...next };

  const byTemplate = next.elementOverridesByTemplate;
  if (byTemplate) {
    const remapped: Record<string, ElementOverrides> = {};
    for (const [template, entry] of Object.entries(byTemplate)) {
      remapped[template] = remapEntry(entry, prev, newIndexById);
    }
    out.elementOverridesByTemplate = remapped;
  }

  if (next.elementOverrides) {
    out.elementOverrides = remapEntry(next.elementOverrides, prev, newIndexById);
  }

  return out;
}
