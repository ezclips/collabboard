'use client';

import React from 'react';

import {
  additionKindOf,
  findAdditionByKey,
  isAdditionKey,
  resetAdditionColour,
  updateAddition,
} from '@/lib/ai/antv/additions';
import { isIconElement } from '@/lib/ai/antv/elementColours';
import { diffOverrides, type EditEntry } from '@/lib/ai/antv/editHistory';
import type { ElementOverride, ElementOverrides } from '@/lib/ai/antv/elementOverrides';
import type { VisualOutline } from '@/lib/ai/outline';

import { selectedKeys, sameOverrides, type Selection } from './AntvElementChrome';

/**
 * PATCH-270/275. The element panel's colour commits. Behaviour for history is
 * unchanged: one entry per row per session, then live updates. PATCH-275 makes
 * the recent list stable: picks are collected during a session (this panel on
 * this selection) and merged into the visible list only when the session ends.
 */

export type ColourRow = 'fill' | 'border' | 'icon' | 'text';

export const COLOUR_ROW_LABELS: Record<ColourRow, string> = {
  fill: 'Fill',
  border: 'Border',
  icon: 'Icon colour',
  text: 'Text colour',
};

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

/** The colour rows a selection has, in panel order. */
export function colourRowsForSelection(keys: string[], findElement: (key: string) => Element | null): ColourRow[] {
  const rows = new Set<ColourRow>();
  for (const key of keys) {
    const el = findElement(key);
    if (!el) continue;
    const kind = additionKindOf(el);
    if (kind === 'text' || (!kind && isTextElementLike(el))) rows.add('text');
    else if (kind === 'icon' || (!kind && isIconElement(el))) rows.add('icon');
    else {
      rows.add('fill');
      rows.add('border');
    }
  }
  return [...rows];
}

export interface UseAntvElementColourOptions {
  template: string;
  selectionRef: React.MutableRefObject<Selection | null>;
  overridesRef: React.MutableRefObject<ElementOverrides | undefined>;
  findElement: (key: string) => Element | null;
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

export function useAntvElementColour(options: UseAntvElementColourOptions): AntvElementColour {
  const {
    template,
    selectionRef,
    overridesRef,
    findElement,
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
      const keys = selectedKeys(selectionRef.current);
      if (keys.length === 0) return;
      let next = cloneOverrides();
      let changed = false;
      for (const key of keys) {
        const el = findElement(key);
        if (!el || !rowApplies(row, el)) continue;
        const patch: ElementOverride =
          row === 'border' ? { stroke: hex } : row === 'text' ? { text: hex } : { fill: hex };
        if (isAdditionKey(key)) next = updateAddition(next, key, patch);
        else next.items[key] = { ...(next.items[key] ?? {}), ...patch };
        changed = true;
      }
      if (!changed || sameOverrides(overridesRef.current, next)) return;
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
    [cloneOverrides, emit, findElement, getContent, overridesRef, recordEdit, selectionRef, setOverrides, template],
  );

  const resetColour = React.useCallback(() => {
    const keys = selectedKeys(selectionRef.current);
    if (keys.length === 0) return;
    let next = cloneOverrides();
    let changed = false;
    for (const key of keys) {
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
  }, [cloneOverrides, commit, selectionRef]);

  /** PATCH-275. The Original swatch: remove ONE field's override in this session. */
  const resetRow = React.useCallback(
    (row: ColourRow) => {
      const keys = selectedKeys(selectionRef.current);
      if (keys.length === 0) return;
      const field = rowField(row);
      let next = cloneOverrides();
      let changed = false;
      for (const key of keys) {
        const el = findElement(key);
        if (!el || !rowApplies(row, el)) continue;
        if (isAdditionKey(key)) {
          const addition = findAdditionByKey(next, key);
          if (!addition || addition[field] === undefined) continue;
          const patched = { ...addition };
          delete patched[field];
          next = updateAddition(next, key, patched);
          changed = true;
          continue;
        }
        const item = next.items[key];
        if (!item || item[field] === undefined) continue;
        const patched: ElementOverride = { ...item };
        delete patched[field];
        if (Object.keys(patched).length) next.items[key] = patched;
        else delete next.items[key];
        changed = true;
      }
      if (!changed) return;
      const entry = diffOverrides(template, overridesRef.current, next);
      if (entry) recordEdit(entry);
      overridesRef.current = next;
      setOverrides(next);
      emit(next, getContent());
    },
    [cloneOverrides, emit, findElement, getContent, overridesRef, recordEdit, setOverrides, selectionRef, template],
  );

  return { recent, applyColour, resetColour, resetRow, resetSession, endSession };
}

/** PATCH-275. The current override literal for a row across the selection. */
export function rowOverride(
  row: ColourRow,
  keys: string[],
  overrides: ElementOverrides | undefined,
): string | undefined {
  for (const key of keys) {
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
