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

import { isTextElement, selectedKeys, sameOverrides, type Selection } from './AntvElementChrome';
import type { ColourRow } from './AntvElementColourMenu';

/**
 * PATCH-270. The colour menu's state and commits, split out of
 * `AntvElementEditor` to keep that file under the 700-line ceiling. Behaviour is
 * unchanged: one history entry per row per colour session, then live updates.
 */

/** The row a value of this element type should land on. */
function rowApplies(row: ColourRow, el: Element): boolean {
  const kind = additionKindOf(el);
  if (kind) {
    if (row === 'text') return kind === 'text';
    if (row === 'icon') return kind === 'icon';
    return kind !== 'text' && kind !== 'icon';
  }
  if (row === 'text') return isTextElement(el);
  if (row === 'icon') return isIconElement(el);
  return !isTextElement(el) && !isIconElement(el);
}

export interface UseAntvElementColourOptions {
  template: string;
  selection: Selection | null;
  selectionRef: React.MutableRefObject<Selection | null>;
  overrides: ElementOverrides | undefined;
  overridesRef: React.MutableRefObject<ElementOverrides | undefined>;
  findElement: (key: string) => Element | null;
  cloneOverrides: () => ElementOverrides;
  commit: (next: ElementOverrides | undefined) => void;
  recordEdit: (entry: EditEntry) => void;
  setOverrides: (next: ElementOverrides | undefined) => void;
  getContent: () => VisualOutline;
  emit: (nextOverrides: ElementOverrides | undefined, content: VisualOutline) => void;
}

export interface AntvElementColour {
  colourOpen: boolean;
  recent: string[];
  colourKeys: string[];
  colourCurrent: ElementOverride;
  colourRows: ColourRow[];
  setColourOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openColour: () => void;
  resetSession: () => void;
  toggleColour: () => void;
  applyColour: (row: ColourRow, hex: string) => void;
  resetColour: () => void;
}

export function useAntvElementColour(options: UseAntvElementColourOptions): AntvElementColour {
  const {
    template,
    selection,
    selectionRef,
    overrides,
    overridesRef,
    findElement,
    cloneOverrides,
    commit,
    recordEdit,
    setOverrides,
    getContent,
    emit,
  } = options;

  const [colourOpen, setColourOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  /** Rows already given a history entry in the open colour session. */
  const colourSessionRef = React.useRef<Set<ColourRow>>(new Set());

  const colourKeys = selectedKeys(selection);
  const colourCurrent: ElementOverride = (() => {
    const key = colourKeys[0];
    if (!key) return {};
    if (isAdditionKey(key)) {
      const addition = findAdditionByKey(overrides, key);
      return addition ? { fill: addition.fill, stroke: addition.stroke, text: addition.text } : {};
    }
    return overrides?.items[key] ?? {};
  })();

  const colourRows = React.useMemo<ColourRow[]>(() => {
    if (!colourOpen) return [];
    const rows = new Set<ColourRow>();
    for (const key of selectedKeys(selection)) {
      const el = findElement(key);
      if (!el) continue;
      const kind = additionKindOf(el);
      if (kind === 'text' || (!kind && isTextElement(el))) rows.add('text');
      else if (kind === 'icon' || (!kind && isIconElement(el))) rows.add('icon');
      else {
        rows.add('fill');
        rows.add('border');
      }
    }
    return [...rows];
  }, [colourOpen, selection, findElement, overrides]);

  const resetSession = React.useCallback(() => {
    colourSessionRef.current = new Set();
  }, []);

  const openColour = React.useCallback(() => {
    colourSessionRef.current = new Set();
    setColourOpen(true);
  }, []);

  const toggleColour = React.useCallback(() => {
    setColourOpen((open) => {
      colourSessionRef.current = new Set();
      return !open;
    });
  }, []);

  const applyColour = React.useCallback(
    (row: ColourRow, hex: string) => {
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
      setRecent((prev) => [hex, ...prev.filter((value) => value !== hex)].slice(0, 6));
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

  return {
    colourOpen,
    recent,
    colourKeys,
    colourCurrent,
    colourRows,
    setColourOpen,
    openColour,
    resetSession,
    toggleColour,
    applyColour,
    resetColour,
  };
}
