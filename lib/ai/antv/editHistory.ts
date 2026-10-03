/**
 * PATCH-270. The picture's edit history. It replaces the whole-content snapshots
 * that made Undo restore an older copy of the entire picture: an entry now
 * describes ONLY what changed, with both sides, and `applyEntry` writes that one
 * field onto the CURRENT outline. Content and overrides therefore stop erasing
 * each other, and one history serves the whole picture (the editor's bar/keys and
 * AntV's inline text edits).
 *
 * Pure: no React, no AntV, never mutates its input.
 */

import type { VisualOutline, VisualOutlineChild } from '@/lib/ai/outline';

import type { Addition } from './additions';
import {
  outlineWithOverrides,
  type ElementOverride,
  type ElementOverrides,
} from './elementOverrides';

export type EditField = 'icon' | 'label' | 'detail' | 'textStyle';

export interface OverrideSlot {
  before: ElementOverride | undefined;
  after: ElementOverride | undefined;
}

export interface AdditionSlot {
  before: Addition | undefined;
  after: Addition | undefined;
}

/**
 * PATCH-270 Addendum 1. An overrides change is PER KEY / PER ADDITION ID, never a
 * whole map: undoing a move can therefore never resurrect a stale copy of an
 * unrelated element or a redone addition.
 */
export interface OverridesEditEntry {
  kind: 'overrides';
  template: string;
  items: Record<string, OverrideSlot>;
  additions: Record<string, AdditionSlot>;
}

export type EditEntry =
  | OverridesEditEntry
  | { kind: 'item-field'; path: number[]; field: EditField; before: unknown; after: unknown }
  | { kind: 'title'; before: string; after: string }
  | { kind: 'group'; entries: EditEntry[] };

export const EDIT_HISTORY_MAX = 50;

/** PATCH-270. How the renderer hands an AntV content edit to the editor's history. */
export type ContentEditReporter = (previous: VisualOutline, next: VisualOutline) => void;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function setField(target: object, field: string, value: unknown): object {
  const next = { ...(target as Record<string, unknown>) };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next;
}

/**
 * PATCH-270. Sets one field on the item at `entry.path`. A path that no longer
 * exists returns the SAME outline (the entry is skipped), so a stale entry is
 * never applied to whatever now sits at that position.
 */
function applyItemField(outline: VisualOutline, entry: EditEntry & { kind: 'item-field' }, value: unknown) {
  const [i, j] = entry.path;
  const item = outline.items[i];
  if (!item) return outline;

  if (j === undefined) {
    const items = outline.items.slice();
    items[i] = setField(item, entry.field, value) as VisualOutline['items'][number];
    return { ...outline, items };
  }

  if (entry.field !== 'label' || !item.children || j < 0 || j >= item.children.length) return outline;
  const children: VisualOutlineChild[] = item.children.slice();
  children[j] = setField(children[j], 'label', value) as VisualOutlineChild;
  const items = outline.items.slice();
  items[i] = { ...item, children };
  return { ...outline, items };
}

function sameOverride(a: ElementOverride | undefined, b: ElementOverride | undefined): boolean {
  if (a === b) return true;
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left as Record<string, unknown>)[key] !== (right as Record<string, unknown>)[key]) return false;
  }
  return true;
}

/**
 * PATCH-270 Addendum 1. Applies only `entry`'s keys/ids onto the CURRENT
 * elementOverrides, leaving every other key and addition as it is. The map's
 * template is preserved (or taken from the entry when there is none yet).
 */
function applyOverrides(
  outline: VisualOutline,
  entry: OverridesEditEntry,
  direction: 'undo' | 'redo',
): VisualOutline {
  const current = outline.elementOverrides;
  const template = current?.template ?? entry.template;
  const items: Record<string, ElementOverride> = { ...(current?.items ?? {}) };
  const additions: Addition[] = (current?.additions ?? []).map((addition) => ({ ...addition }));

  for (const [key, slot] of Object.entries(entry.items)) {
    const value = direction === 'undo' ? slot.before : slot.after;
    if (value === undefined) delete items[key];
    else items[key] = { ...value };
  }

  for (const [id, slot] of Object.entries(entry.additions)) {
    const value = direction === 'undo' ? slot.before : slot.after;
    const index = additions.findIndex((addition) => addition.id === id);
    if (value === undefined) {
      if (index >= 0) additions.splice(index, 1);
    } else if (index >= 0) {
      additions[index] = { ...value };
    } else {
      additions.push({ ...value });
    }
  }

  const next: ElementOverrides = { template, items };
  if (additions.length) next.additions = additions;
  return outlineWithOverrides(outline, next);
}

/**
 * PATCH-270. Applies ONE side of `entry` to `outline`, returning a new outline.
 * `overrides` writes only its own keys/ids onto the current map; `item-field` sets
 * only that field on that item; `title` sets only the title. A group reverses its
 * entries on undo.
 */
export function applyEntry(
  outline: VisualOutline,
  entry: EditEntry,
  direction: 'undo' | 'redo',
): VisualOutline {
  switch (entry.kind) {
    case 'overrides':
      return applyOverrides(outline, entry, direction);
    case 'title':
      return { ...outline, title: direction === 'undo' ? entry.before : entry.after };
    case 'item-field':
      return applyItemField(outline, entry, direction === 'undo' ? entry.before : entry.after);
    case 'group': {
      const ordered = direction === 'undo' ? [...entry.entries].reverse() : entry.entries;
      let next = outline;
      for (const child of ordered) next = applyEntry(next, child, direction);
      return next;
    }
  }
}

/**
 * PATCH-270 Addendum 1. The per-key / per-addition-id differences between two
 * elementOverrides maps, with both sides. Returns `null` when nothing changed.
 */
export function diffOverrides(
  template: string,
  before: ElementOverrides | undefined,
  after: ElementOverrides | undefined,
): OverridesEditEntry | null {
  const items: Record<string, OverrideSlot> = {};
  const itemKeys = new Set([...Object.keys(before?.items ?? {}), ...Object.keys(after?.items ?? {})]);
  for (const key of itemKeys) {
    const b = before?.items[key];
    const a = after?.items[key];
    if (!sameOverride(b, a)) {
      items[key] = { before: b ? { ...b } : undefined, after: a ? { ...a } : undefined };
    }
  }

  const additions: Record<string, AdditionSlot> = {};
  const ids = new Set([
    ...(before?.additions ?? []).map((addition) => addition.id),
    ...(after?.additions ?? []).map((addition) => addition.id),
  ]);
  for (const id of ids) {
    const b = (before?.additions ?? []).find((addition) => addition.id === id);
    const a = (after?.additions ?? []).find((addition) => addition.id === id);
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) {
      additions[id] = { before: b ? { ...b } : undefined, after: a ? { ...a } : undefined };
    }
  }

  if (Object.keys(items).length === 0 && Object.keys(additions).length === 0) return null;
  return { kind: 'overrides', template, items, additions };
}

const ITEM_FIELDS = ['icon', 'label', 'detail'] as const;

/**
 * PATCH-270. The field-level content differences between two outlines: the title
 * and, per item matched by path, label / detail / icon / textStyle. Structural
 * changes and fields with no `EditField` (value, colour, date, kind) are not
 * content edits and are ignored. Used to record AntV inline text edits.
 */
export function diffContentEntries(prev: VisualOutline, next: VisualOutline): EditEntry[] {
  const entries: EditEntry[] = [];
  if (prev.title !== next.title) {
    entries.push({ kind: 'title', before: prev.title, after: next.title });
  }

  const count = Math.max(prev.items.length, next.items.length);
  for (let i = 0; i < count; i += 1) {
    const a = prev.items[i];
    const b = next.items[i];
    if (!a || !b) continue;

    for (const field of ITEM_FIELDS) {
      if (a[field] !== b[field]) {
        entries.push({ kind: 'item-field', path: [i], field, before: a[field], after: b[field] });
      }
    }
    if (!deepEqual(a.textStyle, b.textStyle)) {
      entries.push({
        kind: 'item-field',
        path: [i],
        field: 'textStyle',
        before: a.textStyle,
        after: b.textStyle,
      });
    }

    const ac = a.children ?? [];
    const bc = b.children ?? [];
    const childCount = Math.min(ac.length, bc.length);
    for (let j = 0; j < childCount; j += 1) {
      if (ac[j].label !== bc[j].label) {
        entries.push({
          kind: 'item-field',
          path: [i, j],
          field: 'label',
          before: ac[j].label,
          after: bc[j].label,
        });
      }
    }
  }

  return entries;
}

export interface EditHistory {
  past: EditEntry[];
  future: EditEntry[];
  record(entry: EditEntry): void;
  undoEntry(): EditEntry | undefined;
  redoEntry(): EditEntry | undefined;
  clear(): void;
}

/** PATCH-270. A small past/future stack; `record` clears the future, max 50. */
export function createEditHistory(): EditHistory {
  const history: EditHistory = {
    past: [],
    future: [],
    record(entry) {
      history.past.push(entry);
      if (history.past.length > EDIT_HISTORY_MAX) {
        history.past.splice(0, history.past.length - EDIT_HISTORY_MAX);
      }
      history.future = [];
    },
    undoEntry() {
      const entry = history.past.pop();
      if (!entry) return undefined;
      history.future.unshift(entry);
      if (history.future.length > EDIT_HISTORY_MAX) history.future.length = EDIT_HISTORY_MAX;
      return entry;
    },
    redoEntry() {
      const entry = history.future.shift();
      if (!entry) return undefined;
      history.past.push(entry);
      if (history.past.length > EDIT_HISTORY_MAX) history.past.shift();
      return entry;
    },
    clear() {
      history.past = [];
      history.future = [];
    },
  };
  return history;
}
