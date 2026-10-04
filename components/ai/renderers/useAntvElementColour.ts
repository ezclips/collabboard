'use client';

import React from 'react';

import {
  additionKindOf,
  findAdditionByKey,
  isAdditionKey,
  resetAdditionColour,
  updateAddition,
} from '@/lib/ai/antv/additions';
import { isBadgeElement, isIconElement } from '@/lib/ai/antv/elementColours';
import { diffOverrides, type EditEntry } from '@/lib/ai/antv/editHistory';
import type { ElementOverride, ElementOverrides } from '@/lib/ai/antv/elementOverrides';
import type { VisualOutline } from '@/lib/ai/outline';

import { sameOverrides } from './AntvElementChrome';

/**
 * PATCH-270/275. The element panel's colour commits. Behaviour for history is
 * unchanged: one entry per row per session, then live updates. PATCH-275 makes
 * the recent list stable: picks are collected during a session (this panel on
 * this selection) and merged into the visible list only when the session ends.
 *
 * PATCH-276. Every row acts on the OBJECT's parts: the panel's subject is the
 * whole selected item, whether the user selected it or drilled into one part.
 * The Icon colour row targets the inner `item-icon`, and the new Icon background
 * row targets the badge shape of `item-icon-group` (key `…#badge`).
 */

export type ColourRow = 'fill' | 'border' | 'icon' | 'badge' | 'text';

export const COLOUR_ROW_LABELS: Record<ColourRow, string> = {
  fill: 'Fill',
  border: 'Border',
  icon: 'Icon colour',
  badge: 'Icon background',
  text: 'Text colour',
};

/** One DOM part a row acts on, with the override key it writes. */
export interface ColourPart {
  key: string;
  el: Element;
}

/** The row a value of this element type should land on. */
export function rowApplies(row: ColourRow, el: Element): boolean {
  const kind = additionKindOf(el);
  if (kind) {
    if (row === 'text') return kind === 'text';
    if (row === 'icon') return kind === 'icon';
    return kind !== 'text' && kind !== 'icon';
  }
  if (row === 'text') return isIconElement(el) ? false : isTextElementLike(el);
  if (row === 'icon') return isIconElement(el);
  return !isTextElementLike(el) && !isIconElement(el);
}

function isTextElementLike(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'text' || tag === 'foreignobject') return true;
  const type = el.getAttribute('data-element-type');
  return type === 'title' || type === 'item-label' || type === 'item-value' || type === 'item-desc' || type === 'label' || type === 'desc';
}

/** The inner icon element of an icon group, or the element itself when it is one. */
function iconElementOf(el: Element): Element | null {
  if (el.tagName.toLowerCase() === 'use' || el.getAttribute('data-element-type') === 'item-icon') return el;
  if (el.getAttribute('data-element-type') === 'item-icon-group') {
    return el.querySelector('[data-element-type="item-icon"]') ?? el.querySelector('use');
  }
  return null;
}

/** The badge shape of an icon group, when it has one. */
function badgeElementOf(el: Element): Element | null {
  if (el.getAttribute('data-element-type') !== 'item-icon-group') return null;
  for (const child of Array.from(el.children)) {
    if (isBadgeElement(child)) return child;
  }
  return null;
}

/**
 * PATCH-276. The parts one colour row acts on for an OBJECT: `objectKeys` is the
 * whole item's member list. The icon row resolves each icon group down to its
 * inner `item-icon`; the badge row resolves it to the badge shape.
 */
export function colourPartsForObject(
  row: ColourRow,
  objectKeys: string[],
  findElement: (key: string) => Element | null,
  keyOf: (el: Element) => string | null,
): ColourPart[] {
  const parts: ColourPart[] = [];
  const seen = new Set<string>();
  for (const key of objectKeys) {
    const el = findElement(key);
    if (!el) continue;
    const target = row === 'icon' ? iconElementOf(el) : row === 'badge' ? badgeElementOf(el) : el;
    if (!target) continue;
    if (row !== 'badge' && !rowApplies(row, target)) continue;
    const targetKey = keyOf(target);
    if (!targetKey || seen.has(targetKey)) continue;
    seen.add(targetKey);
    parts.push({ key: targetKey, el: target });
  }
  return parts;
}

/** The colour rows an object has, in panel order. */
export function colourRowsForObject(
  objectKeys: string[],
  findElement: (key: string) => Element | null,
): ColourRow[] {
  const rows = new Set<ColourRow>();
  for (const key of objectKeys) {
    const el = findElement(key);
    if (!el) continue;
    const kind = additionKindOf(el);
    if (kind === 'text' || (!kind && isTextElementLike(el))) rows.add('text');
    else if (kind === 'icon' || (!kind && isIconElement(el))) {
      rows.add('icon');
      if (badgeElementOf(el)) rows.add('badge');
    } else {
      rows.add('fill');
      rows.add('border');
    }
  }
  return [...rows];
}

export interface UseAntvElementColourOptions {
  template: string;
  /** PATCH-276. The whole object's member keys, not the drilled part's. */
  objectKeysRef: React.MutableRefObject<string[]>;
  overridesRef: React.MutableRefObject<ElementOverrides | undefined>;
  findElement: (key: string) => Element | null;
  /** PATCH-276. The override key of a DOM element (badge keys included). */
  keyOf: (el: Element) => string | null;
  cloneOverrides: () => ElementOverrides;
  commit: (next: ElementOverrides | undefined) => void;
  recordEdit: (entry: EditEntry) => void;
  setOverrides: (next: ElementOverrides | undefined) => void;
  getContent: () => VisualOutline;
  emit: (nextOverrides: ElementOverrides | undefined, content: VisualOutline) => void;
  palette: readonly string[];
}

export interface AntvElementColour {
  recent: string[];
  applyColour: (row: ColourRow, hex: string, options?: { collect?: boolean }) => void;
  resetColour: () => void;
  resetRow: (row: ColourRow) => void;
  resetSession: () => void;
  endSession: () => void;
}

const RECENT_MAX = 6;

/** The override field a row writes. */
function rowField(row: ColourRow): 'fill' | 'stroke' | 'text' {
  if (row === 'border') return 'stroke';
  if (row === 'text') return 'text';
  return 'fill';
}

const COLOUR_ROWS: readonly ColourRow[] = ['fill', 'border', 'icon', 'badge', 'text'];

export function useAntvElementColour(options: UseAntvElementColourOptions): AntvElementColour {
  const {
    template,
    objectKeysRef,
    overridesRef,
    findElement,
    keyOf,
    cloneOverrides,
    commit,
    recordEdit,
    setOverrides,
    getContent,
    emit,
    palette,
  } = options;

  const [recent, setRecent] = React.useState<string[]>([]);
  /** Rows already given a history entry in the open colour session. */
  const colourSessionRef = React.useRef<Set<ColourRow>>(new Set());
  /** Picks made in this session, oldest first; never reorders the visible list. */
  const sessionPicksRef = React.useRef<string[]>([]);

  // PATCH-275 Addendum 2. The palette prop is a NEW array on every renderer
  // render (`theme.palette.map(...)`), so it must not feed the session
  // callbacks' identities: read it through a ref and keep `endSession` stable,
  // or the editor's session effect would end the session after every pick.
  const paletteRef = React.useRef(palette);
  paletteRef.current = palette;

  const resetSession = React.useCallback(() => {
    colourSessionRef.current = new Set();
    sessionPicksRef.current = [];
  }, []);

  const endSession = React.useCallback(() => {
    const picks = sessionPicksRef.current;
    colourSessionRef.current = new Set();
    sessionPicksRef.current = [];
    if (picks.length === 0) return;
    const paletteSet = new Set(paletteRef.current.map((hex) => hex.toLowerCase()));
    setRecent((previous) => {
      const merged = [...picks].reverse().concat(previous);
      const seen = new Set<string>();
      const next: string[] = [];
      for (const hex of merged) {
        if (paletteSet.has(hex) || seen.has(hex)) continue;
        seen.add(hex);
        next.push(hex);
        if (next.length >= RECENT_MAX) break;
      }
      return next;
    });
  }, []);

  const applyColour = React.useCallback(
    (row: ColourRow, hex: string, options2: { collect?: boolean } = {}) => {
      const parts = colourPartsForObject(row, objectKeysRef.current, findElement, keyOf);
      if (parts.length === 0) return;
      let next = cloneOverrides();
      const patch: ElementOverride =
        row === 'border' ? { stroke: hex } : row === 'text' ? { text: hex } : { fill: hex };
      for (const part of parts) {
        if (isAdditionKey(part.key)) next = updateAddition(next, part.key, patch);
        else next.items[part.key] = { ...(next.items[part.key] ?? {}), ...patch };
      }
      if (sameOverrides(overridesRef.current, next)) return;
      if (!colourSessionRef.current.has(row)) {
        colourSessionRef.current.add(row);
        const entry = diffOverrides(template, overridesRef.current, next);
        if (entry) recordEdit(entry);
      }
      overridesRef.current = next;
      setOverrides(next);
      emit(next, getContent());
      if (options2.collect !== false) sessionPicksRef.current.push(hex.toLowerCase());
    },
    [cloneOverrides, emit, findElement, getContent, keyOf, overridesRef, recordEdit, objectKeysRef, setOverrides, template],
  );

  const resetColour = React.useCallback(() => {
    const keys = objectKeysRef.current;
    if (keys.length === 0) return;
    const targetKeys = new Set<string>();
    for (const row of COLOUR_ROWS) {
      for (const part of colourPartsForObject(row, keys, findElement, keyOf)) targetKeys.add(part.key);
    }
    if (targetKeys.size === 0) return;
    let next = cloneOverrides();
    let changed = false;
    for (const key of targetKeys) {
      if (isAdditionKey(key)) {
        next = resetAdditionColour(next, key);
        changed = true;
        continue;
      }
      const item = next.items[key];
      if (!item) continue;
      const rest: ElementOverride = { ...item };
      delete rest.fill;
      delete rest.stroke;
      delete rest.text;
      if (Object.keys(rest).length) next.items[key] = rest;
      else delete next.items[key];
      changed = true;
    }
    if (!changed) return;
    colourSessionRef.current = new Set();
    commit(next);
  }, [cloneOverrides, commit, findElement, keyOf, objectKeysRef]);

  /** PATCH-275. The Original swatch: remove ONE field's override in this session. */
  const resetRow = React.useCallback(
    (row: ColourRow) => {
      const parts = colourPartsForObject(row, objectKeysRef.current, findElement, keyOf);
      if (parts.length === 0) return;
      const field = rowField(row);
      let next = cloneOverrides();
      let changed = false;
      for (const part of parts) {
        if (isAdditionKey(part.key)) {
          const addition = findAdditionByKey(next, part.key);
          if (!addition || addition[field] === undefined) continue;
          const patched = { ...addition };
          delete patched[field];
          next = updateAddition(next, part.key, patched);
          changed = true;
          continue;
        }
        const item = next.items[part.key];
        if (!item || item[field] === undefined) continue;
        const patched: ElementOverride = { ...item };
        delete patched[field];
        if (Object.keys(patched).length) next.items[part.key] = patched;
        else delete next.items[part.key];
        changed = true;
      }
      if (!changed) return;
      const entry = diffOverrides(template, overridesRef.current, next);
      if (entry) recordEdit(entry);
      overridesRef.current = next;
      setOverrides(next);
      emit(next, getContent());
    },
    [cloneOverrides, emit, findElement, getContent, keyOf, overridesRef, recordEdit, objectKeysRef, setOverrides, template],
  );

  return { recent, applyColour, resetColour, resetRow, resetSession, endSession };
}

/** PATCH-275. The current override literal for a row across the row's parts. */
export function rowOverride(
  row: ColourRow,
  parts: ColourPart[],
  overrides: ElementOverrides | undefined,
): string | undefined {
  for (const { key } of parts) {
    if (isAdditionKey(key)) {
      const addition = findAdditionByKey(overrides, key);
      if (!addition) continue;
      const value = row === 'border' ? addition.stroke : row === 'text' ? addition.text : addition.fill;
      if (value) return value;
      continue;
    }
    const item = overrides?.items[key];
    if (!item) continue;
    const value = row === 'border' ? item.stroke : row === 'text' ? item.text : item.fill;
    if (value) return value;
  }
  return undefined;
}