'use client';

import React from 'react';

import {
  applyElementOverrides,
  elementAtPoint,
  elementItemScope,
  elementKey,
  elementScreenBox,
  isTransientElement,
  itemMemberKeys,
  outlineWithOverrides,
  unionScreenBoxes,
  type ElementOverride,
  type ElementOverrides,
  type ScreenBox,
} from '@/lib/ai/antv/elementOverrides';
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
  sameOverrides,
  selectedKeys,
  type ChromeRect,
  type Selection,
} from './AntvElementChrome';
import AntvElementColourMenu, { type ColourRow } from './AntvElementColourMenu';
import { useAntvElementDrag } from './useAntvElementDrag';
import { PictureZoomContext } from './PictureStage';

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
}

const DEFAULT_PALETTE: readonly string[] = VISUAL_PALETTE.map((entry) => entry.stroke);

type Rect = ChromeRect;

/** PATCH-261. The row a value of this element type should land on. */
function rowApplies(row: ColourRow, el: Element): boolean {
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
}: AntvElementEditorProps) {
  const zoom = React.useContext(PictureZoomContext) || 1;
  const counterScale = 1 / zoom;

  const [overrides, setOverrides] = React.useState<ElementOverrides | undefined>(() =>
    initialOverrides(outline, template),
  );
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [colourOpen, setColourOpen] = React.useState(false);
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
  const pastRef = React.useRef<Array<ElementOverrides | undefined>>([]);
  const futureRef = React.useRef<Array<ElementOverrides | undefined>>([]);
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
    return current ? { template: current.template, items: { ...current.items } } : { template, items: {} };
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

  // PATCH-260, defect 1. The editor OWNS `elementOverrides`; the outline prop can
  // arrive a beat late (or, live, carrying a foreign/stale map). A prop must never
  // clobber what the user just committed -- it may only ADD a key the editor does
  // not already have. Local committed state always wins for a shared key.
  React.useEffect(() => {
    const incoming = initialOverrides(outline, template);
    const incomingItems = incoming?.items ?? {};
    const local = overridesRef.current;
    const localItems = local?.items ?? {};
    const added = Object.keys(incomingItems).filter((key) => !(key in localItems));
    if (added.length === 0) return;
    const merged: ElementOverrides = { template, items: { ...localItems } };
    for (const key of added) merged.items[key] = incomingItems[key];
    overridesRef.current = merged;
    setOverrides(merged);
  }, [outline, template]);

  const notify = React.useCallback(
    (next: ElementOverrides | undefined) => onChange(outlineWithOverrides(outlineRef.current, next)),
    [onChange],
  );

  const setPresent = React.useCallback(
    (next: ElementOverrides | undefined) => {
      overridesRef.current = next;
      setOverrides(next);
      notify(next);
    },
    [notify],
  );

  const commit = React.useCallback(
    (next: ElementOverrides | undefined) => {
      if (sameOverrides(overridesRef.current, next)) return;
      pastRef.current = [...pastRef.current, overridesRef.current].slice(-HISTORY_MAX);
      futureRef.current = [];
      setPresent(next);
    },
    [setPresent],
  );

  const commitDrag = React.useCallback(
    (base: ElementOverrides | undefined) => {
      const next = overridesRef.current;
      if (sameOverrides(base, next)) return;
      pastRef.current = [...pastRef.current, base].slice(-HISTORY_MAX);
      futureRef.current = [];
      setPresent(next);
    },
    [setPresent],
  );

  const undo = React.useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [overridesRef.current, ...futureRef.current].slice(0, HISTORY_MAX);
    setPresent(previous);
  }, [setPresent]);

  const redo = React.useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, overridesRef.current].slice(-HISTORY_MAX);
    setPresent(next);
  }, [setPresent]);

  const commitHidden = React.useCallback(
    (keys: string[]) => {
      const next = cloneOverrides();
      for (const key of keys) next.items[key] = { ...(next.items[key] ?? {}), hidden: true };
      commit(next);
    },
    [cloneOverrides, commit],
  );

  const commitReset = React.useCallback(
    (keys: string[]) => {
      const next = cloneOverrides();
      for (const key of keys) delete next.items[key];
      commit(next);
    },
    [cloneOverrides, commit],
  );

  // ── Colour (PATCH-261) ─────────────────────────────────────────────────────

  const colourKeys = selectedKeys(selection);
  const colourCurrent: ElementOverride = (colourKeys.length ? overrides?.items[colourKeys[0]] : undefined) ?? {};

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
      if (isTextElement(el)) rows.add('text');
      else if (isIconElement(el)) rows.add('icon');
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
      const next = cloneOverrides();
      let changed = false;
      for (const key of keys) {
        const el = findElement(key);
        if (!el || !rowApplies(row, el)) continue;
        const patch: ElementOverride = row === 'border' ? { stroke: hex } : row === 'text' ? { text: hex } : { fill: hex };
        next.items[key] = { ...(next.items[key] ?? {}), ...patch };
        changed = true;
      }
      if (!changed || sameOverrides(overridesRef.current, next)) return;
      if (!colourSessionRef.current.has(row)) {
        colourSessionRef.current.add(row);
        pastRef.current = [...pastRef.current, overridesRef.current].slice(-HISTORY_MAX);
        futureRef.current = [];
      }
      overridesRef.current = next;
      setOverrides(next);
      notify(next);
      setRecent((prev) => [hex, ...prev.filter((value) => value !== hex)].slice(0, 6));
    },
    [cloneOverrides, findElement, notify],
  );

  const resetColour = React.useCallback(() => {
    const keys = selectedKeys(selectionRef.current);
    if (keys.length === 0) return;
    const next = cloneOverrides();
    let changed = false;
    for (const key of keys) {
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

  /**
   * PATCH-260, defect 4.1. What a pointerdown should drag, and (for an
   * already-selected item) what a click WITHOUT movement should narrow to.
   * Narrowing never happens on pointerdown, so a drag on a selected item moves
   * the whole item.
   */
  const resolvePointerDown = React.useCallback(
    (target: Element | null, clientX: number, clientY: number): { selection: Selection | null; narrowTo: Selection | null } => {
      const root = rootElement();
      if (!root) return { selection: null, narrowTo: null };
      if (target?.closest?.('[data-element-type^="btn-"]')) {
        return { selection: selectionRef.current, narrowTo: null };
      }

      // Defect 5.2. The pointer, not event.target: a big title box can cover an
      // icon, so pick the smallest SVG box containing the point.
      const hit = elementAtPoint(root, clientX, clientY);
      const candidate = hit ?? target?.closest?.('[data-element-type]') ?? null;
      // AntV's editor overlay is not part of the picture: never select it.
      if (!candidate || isTransientElement(candidate)) return { selection: null, narrowTo: null };
      const key = elementKey(candidate, root);
      if (!key) return { selection: null, narrowTo: null };

      const elementSelection: Selection = { kind: 'element', key, scope: elementItemScope(candidate, root) };
      const scope = elementSelection.scope;
      if (!scope) return { selection: elementSelection, narrowTo: null };

      const current = selectionRef.current;
      const itemActive =
        current !== null &&
        ((current.kind === 'item' && current.scope === scope) ||
          (current.kind === 'element' && current.scope === scope));
      if (!itemActive) {
        return { selection: { kind: 'item', scope, keys: itemMemberKeys(scope, root) }, narrowTo: null };
      }
      if (current.kind === 'element') {
        return { selection: elementSelection, narrowTo: null };
      }
      // The whole item is selected: drag it now, narrow only on a no-move click.
      return { selection: current, narrowTo: elementSelection };
    },
    [rootElement],
  );

  const selectionLabel = selection ? (selection.kind === 'item' ? `item@${selection.scope}` : selection.key) : '';

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
      if (isTextElement(target)) return;
      const hit = elementAtPoint(root, event.clientX, event.clientY) ?? target?.closest?.('[data-element-type]') ?? null;
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
        selectionRef.current = null;
        setSelection(null);
        setColourOpen(false);
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commitHidden, redo, rootElement, selection, undo]);

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

  return (
    <AntvElementChrome
      selectionLabel={selectionLabel}
      members={selection.kind === 'item' ? selection.keys.join(',') : undefined}
      rect={rect}
      counterScale={counterScale}
      colourOpen={colourOpen}
      barBelow={barBelow}
      onResize={beginResize}
      onUndo={undo}
      onRedo={redo}
      onReset={handleReset}
      onDelete={handleDelete}
      onToggleColour={toggleColour}
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
    </AntvElementChrome>
  );
}
