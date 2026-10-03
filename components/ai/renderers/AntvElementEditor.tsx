'use client';

import React from 'react';

import {
  applyElementOverrides,
  elementAtPoint,
  elementItemScope,
  elementKey,
  elementScreenBox,
  isTransientElement,
  outlineWithOverrides,
  unionScreenBoxes,
  withoutElementOverrides,
  type ElementOverride,
  type ElementOverrides,
  type ScreenBox,
} from '@/lib/ai/antv/elementOverrides';
import {
  additionKindOf,
  findAdditionByKey,
  isAdditionKey,
  removeAddition,
  resetAdditionColour,
  updateAddition,
} from '@/lib/ai/antv/additions';
import { outlinesEqual } from '@/lib/ai/antv/mapOutline';
import { isIconElement } from '@/lib/ai/antv/elementColours';
import { VISUAL_PALETTE } from '@/lib/ai/visualPalette';
import type { VisualOutline } from '@/lib/ai/outline';
import {
  AntvElementChrome,
  HISTORY_MAX,
  ZERO_BOX,
  hasActiveAntvTextEditor,
  initialOverrides,
  isTextElement,
  isTextEntry,
  resolveAntvPointerDown,
  sameOverrides,
  selectedKeys,
  type ChromeRect,
  type Selection,
} from './AntvElementChrome';
import AntvAddedTextInput from './AntvAddedTextInput';
import AntvElementColourMenu, { type ColourRow } from './AntvElementColourMenu';
import AntvIconPicker from './AntvIconPicker';
import { useAntvElementDrag } from './useAntvElementDrag';
import { useAntvIconSwap } from './useAntvIconSwap';
import { useLayerCounterScale } from './PictureEditOverlay';

/**
 * PATCH-260. The HTML editing layer over an AntV picture. Defects fixed live:
 *   - 1: resize works in SCREEN deltas, so the new on-screen box is exactly the
 *     old box plus the pointer delta at any zoom;
 *   - 2: every box comes from SVG geometry (getBBox -> getScreenCTM), so 0x0
 *     client-rect elements (icons) select; only handles/bar take pointer events;
 *   - 3: the first click on an item's part selects the WHOLE item and moves all
 *     its members in one history entry; a second click drills into one element.
 *
 * PATCH-261 adds a colour menu (Fill/Border/Icon colour/Text) opened from the bar
 * or by double-clicking a shape/icon. It only edits `elementOverrides`, so every
 * commit is a plain outline change -- no AI call, no credit -- and it is NOT part
 * of the saved picture. Presentational chrome and the drag machine are split into
 * AntvElementChrome / useAntvElementDrag.
 */

export interface AntvElementEditorProps {
  containerRef: React.RefObject<HTMLElement | null>;
  template: string;
  outline: VisualOutline;
  onChange: (next: VisualOutline) => void;
  /** PATCH-261. The picture's six palette swatches (`theme.palette` strokes). */
  palette?: readonly string[];
  /**
   * PATCH-263 Addendum 1. The scope of the currently selected item/element, so
   * the mind-map +/− overlay can show that node's controls.
   */
  onSelectionChange?: (scope: string | null) => void;
}

const DEFAULT_PALETTE: readonly string[] = VISUAL_PALETTE.map((entry) => entry.stroke);

type Rect = ChromeRect;

/** PATCH-262. One undoable state: overrides plus the outline content (no overrides). */
interface Snapshot {
  overrides: ElementOverrides | undefined;
  content: VisualOutline;
}

/** PATCH-261/262. The row a value of this element type should land on. */
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

export default function AntvElementEditor({
  containerRef,
  template,
  outline,
  onChange,
  palette = DEFAULT_PALETTE,
  onSelectionChange,
}: AntvElementEditorProps) {
  // PATCH-263 Addendum 2. The chrome counter-scales from the layer's REAL
  // on-screen scale; `1 / PictureZoomContext` drew it 1.85-2.7x too big on the
  // AntV path, where the stage zooms the viewBox instead of CSS-scaling the layer.
  const counterScale = useLayerCounterScale(containerRef);

  const [overrides, setOverrides] = React.useState<ElementOverrides | undefined>(() =>
    initialOverrides(outline, template),
  );
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [colourOpen, setColourOpen] = React.useState(false);
  const [iconOpen, setIconOpen] = React.useState(false);
  const [editingText, setEditingText] = React.useState<{ key: string; value: string } | null>(null);
  const [recent, setRecent] = React.useState<string[]>([]);

  // Refs keep the native (window/container) listeners reading fresh values. The
  // state is NOT mirrored here during render: an interrupted/concurrent render
  // could otherwise clobber the ref with an older state between two pointermove
  // events, so a resize would start from a stale override set (defect 1).
  const overridesRef = React.useRef(overrides);
  const selectionRef = React.useRef(selection);
  const outlineRef = React.useRef(outline);
  outlineRef.current = outline;
  React.useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);
  React.useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  const pendingNarrowRef = React.useRef<Selection | null>(null);
  const suppressClickRef = React.useRef(false);
  const pastRef = React.useRef<Snapshot[]>([]);
  const futureRef = React.useRef<Snapshot[]>([]);
  /** PATCH-261. Rows already given a history entry in the open colour session. */
  const colourSessionRef = React.useRef<Set<ColourRow>>(new Set());

  const rootElement = React.useCallback((): HTMLElement | null => containerRef.current, [containerRef]);

  const findElement = React.useCallback(
    (key: string): Element | null => {
      const root = rootElement();
      if (!root) return null;
      for (const el of Array.from(root.querySelectorAll('[data-element-type]'))) {
        if (elementKey(el, root) === key) return el;
      }
      return null;
    },
    [rootElement],
  );

  const toPercent = React.useCallback(
    (box: ScreenBox): Rect => {
      const root = rootElement();
      const host = root?.getBoundingClientRect();
      const width = host?.width || 1;
      const height = host?.height || 1;
      return {
        left: ((box.left - (host?.left ?? 0)) / width) * 100,
        top: ((box.top - (host?.top ?? 0)) / height) * 100,
        width: (box.width / width) * 100,
        height: (box.height / height) * 100,
      };
    },
    [rootElement],
  );

  const screenBoxOfKeys = React.useCallback(
    (keys: string[]): ScreenBox => {
      const boxes = keys.map((key) => {
        const el = findElement(key);
        return el ? elementScreenBox(el) : null;
      });
      return unionScreenBoxes(boxes) ?? ZERO_BOX;
    },
    [findElement],
  );

  const measureKeys = React.useCallback(
    (keys: string[]): Rect | null => (keys.length ? toPercent(screenBoxOfKeys(keys)) : null),
    [screenBoxOfKeys, toPercent],
  );

  const cloneOverrides = React.useCallback((): ElementOverrides => {
    const current = overridesRef.current;
    if (!current) return { template, items: {} };
    const next: ElementOverrides = { template: current.template, items: { ...current.items } };
    if (current.additions) next.additions = current.additions.map((addition) => ({ ...addition }));
    return next;
  }, [template]);

  const applyLive = React.useCallback(
    (next: ElementOverrides) => {
      overridesRef.current = next;
      setOverrides(next);
      const root = rootElement();
      if (root) applyElementOverrides(root, next, template);
    },
    [rootElement, template],
  );

  /** The undoable state right now: overrides + the outline's content only. */
  const snapshot = React.useCallback(
    (): Snapshot => ({ overrides: overridesRef.current, content: withoutElementOverrides(outlineRef.current) }),
    [],
  );

  const emit = React.useCallback(
    (nextOverrides: ElementOverrides | undefined, content: VisualOutline) => {
      const next = outlineWithOverrides(content, nextOverrides);
      outlineRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  // PATCH-260, defect 1. The editor OWNS `elementOverrides`; the outline prop can
  // arrive a beat late (or, live, carrying a foreign/stale map). A prop must never
  // clobber what the user just committed -- it may only ADD a key the editor does
  // not already have. Local committed state always wins for a shared key.
  //
  // PATCH-262. Additions are shared with the Add side panel, which writes them
  // straight into the outline; they are taken from the prop, and the most
  // recently added one is selected.
  React.useEffect(() => {
    const incoming = initialOverrides(outline, template);
    const incomingItems = incoming?.items ?? {};
    const local = overridesRef.current;
    const localItems = local?.items ?? {};
    const added = Object.keys(incomingItems).filter((key) => !(key in localItems));
    const incomingAdditions = incoming?.additions;
    const localAdditions = local?.additions;
    const additionsChanged =
      JSON.stringify(incomingAdditions ?? []) !== JSON.stringify(localAdditions ?? []);
    if (added.length === 0 && !additionsChanged) return;

    const merged: ElementOverrides = { template, items: { ...localItems } };
    for (const key of added) merged.items[key] = incomingItems[key];
    if (incomingAdditions && incomingAdditions.length) merged.additions = incomingAdditions;
    overridesRef.current = merged;
    setOverrides(merged);
    const root = rootElement();
    if (root) applyElementOverrides(root, merged, template);

    if (incomingAdditions && incomingAdditions.length) {
      const localIds = new Set((localAdditions ?? []).map((addition) => addition.id));
      const fresh = incomingAdditions.filter((addition) => !localIds.has(addition.id));
      if (fresh.length) {
        // The Add panel wrote the addition straight into the outline: make the
        // insertion undoable here, where the editor owns the history.
        pastRef.current = [
          ...pastRef.current,
          { overrides: local, content: withoutElementOverrides(outline) },
        ].slice(-HISTORY_MAX);
        futureRef.current = [];
        const key = `ai-addition@${fresh[fresh.length - 1].id}`;
        const nextSelection: Selection = { kind: 'element', key, scope: null };
        selectionRef.current = nextSelection;
        setSelection(nextSelection);
        setRect(measureKeys([key]));
      }
    }
  }, [outline, template, rootElement, measureKeys]);

  const setPresent = React.useCallback(
    (next: ElementOverrides | undefined) => {
      overridesRef.current = next;
      setOverrides(next);
      emit(next, outlineRef.current);
    },
    [emit],
  );

  const commit = React.useCallback(
    (next: ElementOverrides | undefined) => {
      if (sameOverrides(overridesRef.current, next)) return;
      pastRef.current = [...pastRef.current, snapshot()].slice(-HISTORY_MAX);
      futureRef.current = [];
      setPresent(next);
    },
    [setPresent, snapshot],
  );

  const commitDrag = React.useCallback(
    (base: ElementOverrides | undefined) => {
      const next = overridesRef.current;
      if (sameOverrides(base, next)) return;
      pastRef.current = [
        ...pastRef.current,
        { overrides: base, content: withoutElementOverrides(outlineRef.current) },
      ].slice(-HISTORY_MAX);
      futureRef.current = [];
      setPresent(next);
    },
    [setPresent],
  );

  /** PATCH-262. A content-only change (an outline item's icon), undoable. */
  const commitContent = React.useCallback(
    (content: VisualOutline) => {
      if (outlinesEqual(withoutElementOverrides(content), withoutElementOverrides(outlineRef.current))) return;
      pastRef.current = [...pastRef.current, snapshot()].slice(-HISTORY_MAX);
      futureRef.current = [];
      emit(overridesRef.current, content);
    },
    [emit, snapshot],
  );

  const restore = React.useCallback(
    (snap: Snapshot) => {
      overridesRef.current = snap.overrides;
      setOverrides(snap.overrides);
      emit(snap.overrides, snap.content);
      const root = rootElement();
      if (root) applyElementOverrides(root, snap.overrides, template);
    },
    [emit, rootElement, template],
  );

  const undo = React.useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [snapshot(), ...futureRef.current].slice(0, HISTORY_MAX);
    restore(previous);
  }, [restore, snapshot]);

  const redo = React.useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, snapshot()].slice(-HISTORY_MAX);
    restore(next);
  }, [restore, snapshot]);

  const commitHidden = React.useCallback(
    (keys: string[]) => {
      let next = cloneOverrides();
      for (const key of keys) {
        if (isAdditionKey(key)) next = removeAddition(next, key);
        else next.items[key] = { ...(next.items[key] ?? {}), hidden: true };
      }
      commit(next);
    },
    [cloneOverrides, commit],
  );

  const commitReset = React.useCallback(
    (keys: string[]) => {
      let next = cloneOverrides();
      for (const key of keys) {
        if (isAdditionKey(key)) next = resetAdditionColour(next, key);
        else delete next.items[key];
      }
      commit(next);
    },
    [cloneOverrides, commit],
  );

  // ── Colour (PATCH-261) ─────────────────────────────────────────────────────

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

  // PATCH-261 fix. AntV's own text toolbar sits directly above a selected text
  // element (z-index 9999), exactly where our bar would be, so a text-only
  // selection drops the bar below the box. If below would leave the stage, fall
  // back to the normal above-left placement.
  const textOnlySelection = colourKeys.length > 0 && colourKeys.every((key) => isTextElement(findElement(key)));
  const barBelow = rect !== null && textOnlySelection && rect.top + rect.height < 80;

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

  const applyColour = React.useCallback(
    (row: ColourRow, hex: string) => {
      const keys = selectedKeys(selectionRef.current);
      if (keys.length === 0) return;
      let next = cloneOverrides();
      let changed = false;
      for (const key of keys) {
        const el = findElement(key);
        if (!el || !rowApplies(row, el)) continue;
        const patch: ElementOverride = row === 'border' ? { stroke: hex } : row === 'text' ? { text: hex } : { fill: hex };
        if (isAdditionKey(key)) next = updateAddition(next, key, patch);
        else next.items[key] = { ...(next.items[key] ?? {}), ...patch };
        changed = true;
      }
      if (!changed || sameOverrides(overridesRef.current, next)) return;
      if (!colourSessionRef.current.has(row)) {
        colourSessionRef.current.add(row);
        pastRef.current = [...pastRef.current, snapshot()].slice(-HISTORY_MAX);
        futureRef.current = [];
      }
      overridesRef.current = next;
      setOverrides(next);
      emit(next, outlineRef.current);
      setRecent((prev) => [hex, ...prev.filter((value) => value !== hex)].slice(0, 6));
    },
    [cloneOverrides, emit, findElement, snapshot],
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
  }, [cloneOverrides, commit]);

  const toggleColour = React.useCallback(() => {
    setColourOpen((open) => {
      colourSessionRef.current = new Set();
      return !open;
    });
  }, []);

  // ── Change icon (PATCH-262) ────────────────────────────────────────────────
  const { iconItemIndex, iconCurrent, applyIcon } = useAntvIconSwap({
    selection,
    findElement,
    template,
    outline,
    getContent: () => outlineRef.current,
    commitContent,
    onPicked: () => setIconOpen(false),
  });

  const toggleIcon = React.useCallback(() => {
    setIconOpen((open) => !open);
    setColourOpen(false);
  }, []);

  // Added text: double-click opens a small inline input (Enter/blur commit,
  // Escape cancels). The input is an <input>, so the editor's key handler yields.
  const commitAddedText = React.useCallback(
    (key: string, value: string) => {
      const addition = findAdditionByKey(overridesRef.current, key);
      if (addition) commit(updateAddition(cloneOverrides(), key, { label: value.slice(0, 200) }));
      setEditingText(null);
    },
    [cloneOverrides, commit],
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  const applyNarrow = React.useCallback(
    (next: Selection) => {
      selectionRef.current = next;
      setSelection(next);
      setRect(measureKeys(selectedKeys(next)));
    },
    [measureKeys],
  );

  const measureSelection = React.useCallback(
    (next: Selection | null) => {
      setRect(measureKeys(selectedKeys(next)));
    },
    [measureKeys],
  );

  // Move/resize pointer machine (PATCH-260), and its text-selection guard.
  const { beginMove, beginResize } = useAntvElementDrag({
    rootElement,
    selectionRef,
    overridesRef,
    pendingNarrowRef,
    suppressClickRef,
    applyLive,
    cloneOverrides,
    commitDrag,
    applyNarrow,
    measureKeys,
    screenBoxOfKeys,
    toPercent,
    findElement,
    setRect,
  });

  const resolvePointerDown = React.useCallback(
    (target: Element | null, clientX: number, clientY: number): { selection: Selection | null; narrowTo: Selection | null } => {
      const root = rootElement();
      if (!root) return { selection: null, narrowTo: null };
      return resolveAntvPointerDown(root, selectionRef.current, target, clientX, clientY);
    },
    [rootElement],
  );

  const selectionLabel = selection ? (selection.kind === 'item' ? `item@${selection.scope}` : selection.key) : '';

  // PATCH-263 Addendum 1. Publish the selected scope so the mind-map +/− overlay
  // can reveal the controls of the selected node.
  React.useEffect(() => {
    onSelectionChange?.(selection ? selection.scope : null);
  }, [selection, onSelectionChange]);

  // Container listeners: pick a selection, start an item/element move, or open
  // the colour menu on a double-click of a shape/icon.
  React.useEffect(() => {
    const root = rootElement();
    if (!root) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (hasActiveAntvTextEditor(root)) return;
      const target = event.target as Element | null;
      if (target?.closest?.('[data-element-type^="btn-"]')) return;
      const { selection: next, narrowTo } = resolvePointerDown(target, event.clientX, event.clientY);
      selectionRef.current = next;
      setSelection(next);
      measureSelection(next);
      if (next) beginMove(event, next, narrowTo);
    };

    const onClick = (event: MouseEvent) => {
      if (hasActiveAntvTextEditor(root)) return;
      const text = isTextElement(event.target as Element | null);
      // A pending narrow from a no-move pointerdown is applied here too, so a
      // real browser click always narrows even if the pointerup did not reach our
      // window listener. It must NOT swallow a text element's own click/dblclick.
      if (pendingNarrowRef.current) {
        const next = pendingNarrowRef.current;
        pendingNarrowRef.current = null;
        applyNarrow(next);
        if (!text) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      if (!text) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // PATCH-261. Double-click on a shape/icon is Napkin's colour gesture. Text
    // keeps AntV's inline editor, so a text double-click is left untouched.
    const onDoubleClick = (event: MouseEvent) => {
      if (hasActiveAntvTextEditor(root)) return;
      const target = event.target as Element | null;
      const hit = elementAtPoint(root, event.clientX, event.clientY) ?? target?.closest?.('[data-element-type]') ?? null;
      // PATCH-262. Our additions: double-click text edits it inline; any other
      // addition opens the colour menu (not AntV's text editor).
      const additionHit = hit && !isTransientElement(hit) ? additionKindOf(hit) : null;
      if (hit && additionHit) {
        const key = elementKey(hit, root);
        if (!key) return;
        event.preventDefault();
        event.stopPropagation();
        const next: Selection = { kind: 'element', key, scope: null };
        selectionRef.current = next;
        setSelection(next);
        setRect(measureKeys([key]));
        if (additionHit === 'text') {
          const addition = findAdditionByKey(overridesRef.current, key);
          setEditingText({ key, value: addition?.label ?? '' });
        } else {
          colourSessionRef.current = new Set();
          setColourOpen(true);
        }
        return;
      }
      if (isTextElement(target)) return;
      if (!hit || isTransientElement(hit)) return;
      const key = elementKey(hit, root);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      const next: Selection = { kind: 'element', key, scope: elementItemScope(hit, root) };
      selectionRef.current = next;
      setSelection(next);
      setRect(measureKeys([key]));
      colourSessionRef.current = new Set();
      setColourOpen(true);
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('click', onClick, true);
    root.addEventListener('dblclick', onDoubleClick, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('dblclick', onDoubleClick, true);
    };
  }, [applyNarrow, beginMove, measureKeys, measureSelection, resolvePointerDown, rootElement]);

  // Draw the overrides (including additions) once the container exists.
  React.useEffect(() => {
    const root = rootElement();
    if (root) applyElementOverrides(root, overridesRef.current, template);
  }, [rootElement, template]);

  // Re-measure after a commit / undo.
  React.useEffect(() => {
    setRect(selection ? measureKeys(selectedKeys(selection)) : null);
  }, [measureKeys, overrides, selection]);

  // PATCH-260, defect 2. PictureStage zooms/pans by rewriting the SVG's
  // `viewBox`; the selection box and its handles are positioned in screen
  // geometry, so they must be recomputed when it changes.
  React.useEffect(() => {
    const root = rootElement();
    if (!root || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      const current = selectionRef.current;
      if (current) setRect(measureKeys(selectedKeys(current)));
    });
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ['viewBox'] });
    return () => observer.disconnect();
  }, [measureKeys, rootElement]);

  // Reset local state when the design changes.
  React.useEffect(() => {
    const next = initialOverrides(outlineRef.current, template);
    overridesRef.current = next;
    selectionRef.current = null;
    setOverrides(next);
    setSelection(null);
    setColourOpen(false);
    setIconOpen(false);
    setEditingText(null);
    colourSessionRef.current = new Set();
    pastRef.current = [];
    futureRef.current = [];
  }, [template]);

  // Keyboard: Escape deselects; Delete hides; Ctrl/⌘+Z / Shift+Z / Y.
  React.useEffect(() => {
    if (!selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntry(document.activeElement) || hasActiveAntvTextEditor(rootElement())) return;
      const keys = selectedKeys(selectionRef.current);
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        // PATCH-265. The editor owns Escape while it has a selection: the open
        // popover closes first, then a second Escape deselects. PATCH-262 adds
        // the icon picker to that order (and the added-text input consumes its
        // own Escape before this handler runs). Prevent the key in the capture
        // phase so a document listener -- the docked panel's close-on-Escape --
        // yields to it.
        event.preventDefault();
        if (iconOpen) {
          setIconOpen(false);
        } else if (colourOpen) {
          setColourOpen(false);
        } else {
          selectionRef.current = null;
          setSelection(null);
        }
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        commitHidden(keys);
      } else if (mod && !event.shiftKey && key === 'z') {
        event.preventDefault();
        undo();
      } else if (mod && ((event.shiftKey && key === 'z') || key === 'y')) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [colourOpen, iconOpen, commitHidden, redo, rootElement, selection, undo]);

  const handleDelete = () => commitHidden(selectedKeys(selectionRef.current));
  const handleReset = () => commitReset(selectedKeys(selectionRef.current));

  if (!selection || !rect) {
    return (
      <div
        data-ai-element-overlay="true"
        data-ai-element-selected=""
        className="pointer-events-none absolute inset-0 z-[10000]"
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  // PATCH-263. The handles need the container's on-screen size to convert the
  // outward offset (half handle + 2px) into the percent geometry the overlay
  // uses. `rect` is already relative to this same host.
  const hostRect = rootElement()?.getBoundingClientRect();
  const screenWidth = hostRect?.width ?? 0;
  const screenHeight = hostRect?.height ?? 0;

  return (
    <AntvElementChrome
      selectionLabel={selectionLabel}
      members={selection.kind === 'item' ? selection.keys.join(',') : undefined}
      rect={rect}
      screenWidth={screenWidth}
      screenHeight={screenHeight}
      counterScale={counterScale}
      colourOpen={colourOpen}
      barBelow={barBelow}
      showIconButton={iconItemIndex != null}
      iconOpen={iconOpen}
      onResize={beginResize}
      onUndo={undo}
      onRedo={redo}
      onReset={handleReset}
      onDelete={handleDelete}
      onToggleColour={toggleColour}
      onToggleIcon={toggleIcon}
    >
      {colourOpen && (
        <AntvElementColourMenu
          rows={colourRows}
          palette={palette}
          recent={recent}
          current={colourCurrent}
          rect={rect}
          counterScale={counterScale}
          below={barBelow}
          onPick={applyColour}
          onReset={resetColour}
        />
      )}
      {iconOpen && (
        <AntvIconPicker
          rect={rect}
          counterScale={counterScale}
          current={iconCurrent}
          below={barBelow}
          onPick={applyIcon}
          onClose={() => setIconOpen(false)}
        />
      )}
      {editingText && (
        <AntvAddedTextInput
          value={editingText.value}
          left={rect.left + rect.width / 2}
          top={rect.top + rect.height / 2}
          counterScale={counterScale}
          onCommit={(value) => commitAddedText(editingText.key, value)}
          onCancel={() => setEditingText(null)}
        />
      )}
    </AntvElementChrome>
  );
}
