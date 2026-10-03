'use client';

import React from 'react';
import { Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-react';

import type { VisualOutline } from '@/lib/ai/outline';
import {
  applyElementOverrides,
  elementAtPoint,
  elementBaseBox,
  elementItemScope,
  elementKey,
  elementScreenBox,
  itemMemberKeys,
  outlineWithOverrides,
  resizeFactors,
  resizeOverrides,
  screenToViewBox,
  unionScreenBoxes,
  type ElementHandle,
  type ElementOverride,
  type ElementOverrides,
  type ResizeMember,
  type ScreenBox,
} from '@/lib/ai/antv/elementOverrides';
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
 * It only edits `elementOverrides`, so every commit is a plain outline change --
 * no AI call, no credit. It is NOT part of the saved picture.
 */

export interface AntvElementEditorProps {
  containerRef: React.RefObject<HTMLElement | null>;
  template: string;
  outline: VisualOutline;
  onChange: (next: VisualOutline) => void;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Selection =
  | { kind: 'item'; scope: string; keys: string[] }
  | { kind: 'element'; key: string; scope: string | null };

interface DragState {
  kind: 'move' | 'resize';
  pointerId: number;
  handle?: ElementHandle;
  startClientX: number;
  startClientY: number;
  startPoint: { x: number; y: number };
  keys: string[];
  startScreenBox: ScreenBox;
  startRect: Rect;
  startItems: Record<string, ElementOverride>;
  members: ResizeMember[];
  moved: boolean;
  /** On a click with no movement, narrow an already-selected item to this element. */
  narrowTo: Selection | null;
  /**
   * PATCH-260. A DEEP clone of the overrides at drag start. `applyLive` replaces
   * `overridesRef.current` with a new object on every pointermove, so the commit
   * cannot compare against that ref; this snapshot is the true "before".
   */
  baseOverrides: ElementOverrides | undefined;
}

/** A deep clone of an override map (each override is a flat primitive record). */
function cloneOverridesDeep(overrides: ElementOverrides | undefined): ElementOverrides | undefined {
  if (!overrides) return undefined;
  const items: Record<string, ElementOverride> = {};
  for (const key of Object.keys(overrides.items)) items[key] = { ...overrides.items[key] };
  return { template: overrides.template, items };
}

const HANDLES: Array<{ name: ElementHandle; fx: number; fy: number }> = [
  { name: 'nw', fx: 0, fy: 0 },
  { name: 'n', fx: 0.5, fy: 0 },
  { name: 'ne', fx: 1, fy: 0 },
  { name: 'e', fx: 1, fy: 0.5 },
  { name: 'se', fx: 1, fy: 1 },
  { name: 's', fx: 0.5, fy: 1 },
  { name: 'sw', fx: 0, fy: 1 },
  { name: 'w', fx: 0, fy: 0.5 },
];

const CURSORS: Record<ElementHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

const DRAG_THRESHOLD = 4;
const MIN_SCREEN_SIZE = 8;
const HISTORY_MAX = 50;
const ZERO_BOX: ScreenBox = { left: 0, top: 0, width: 0, height: 0 };

/**
 * PATCH-260, defect 6.1. Text elements whose own AntV interactions (the inline
 * text editor on double-click, the text toolbar on a single click) must not be
 * swallowed by our layer unless a real drag started.
 */
const TEXT_ELEMENT_TYPES = new Set(['title', 'item-label', 'item-value', 'item-desc', 'label', 'desc']);

function isTextElement(el: Element | null): boolean {
  const host = el?.closest?.('[data-element-type="title"], [data-element-type="item-label"], [data-element-type="item-value"], [data-element-type="item-desc"], foreignObject');
  if (host) return true;
  const type = el?.getAttribute?.('data-element-type');
  return type ? TEXT_ELEMENT_TYPES.has(type) : false;
}

function isTextEntry(target: Element | null): boolean {
  if (!target?.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (target as HTMLElement).isContentEditable === true;
}

/**
 * PATCH-260, defect 3. AntV's inline text editor marks its target
 * `contenteditable` and `.infographic-inline-text-editor`. In Chrome the active
 * element is not always that node (SVG text focus is inconsistent), so our
 * layer must not judge by `document.activeElement` alone -- while such an editor
 * is open we stay out of the way entirely, so Backspace/Delete can never hide
 * the element being typed into and our click handlers never swallow the events.
 */
function hasActiveAntvTextEditor(root: HTMLElement | null): boolean {
  if (!root) return false;
  const active = document.activeElement as HTMLElement | null;
  if (active && active.isContentEditable === true && root.contains(active)) return true;
  return Boolean(root.querySelector('[contenteditable="true"]'));
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

function sameOverrides(a: ElementOverrides | undefined, b: ElementOverrides | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.template !== b.template) return false;
  const keys = new Set([...Object.keys(a.items), ...Object.keys(b.items)]);
  for (const key of keys) {
    if (!sameOverride(a.items[key], b.items[key])) return false;
  }
  return true;
}

function initialOverrides(outline: VisualOutline, template: string): ElementOverrides | undefined {
  const stored = outline.elementOverrides;
  return stored && stored.template === template ? stored : undefined;
}

function selectedKeys(selection: Selection | null): string[] {
  if (!selection) return [];
  return selection.kind === 'item' ? selection.keys : [selection.key];
}

export default function AntvElementEditor({ containerRef, template, outline, onChange }: AntvElementEditorProps) {
  const zoom = React.useContext(PictureZoomContext) || 1;
  const counterScale = 1 / zoom;

  const [overrides, setOverrides] = React.useState<ElementOverrides | undefined>(() =>
    initialOverrides(outline, template),
  );
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);

  // Refs keep the native (window/container) listeners reading fresh values. The
  // state is NOT mirrored here during render: an interrupted/concurrent render
  // could otherwise clobber the ref with an older state between two pointermove
  // events, so a resize would start from a stale override set (defect 1). Every
  // state setter below writes its ref, and these effects are the backstop.
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
  const dragRef = React.useRef<DragState | null>(null);
  const pendingNarrowRef = React.useRef<Selection | null>(null);
  const suppressClickRef = React.useRef(false);
  const pastRef = React.useRef<Array<ElementOverrides | undefined>>([]);
  const futureRef = React.useRef<Array<ElementOverrides | undefined>>([]);

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

  // PATCH-260, defect 1. The editor OWNS `elementOverrides`; the outline prop
  // supplies everything else and can arrive from the AIComponentEditor round trip
  // a beat late (or, live, carrying a foreign/stale map). A prop must therefore
  // never clobber what the user just committed -- it may only ADD a key the
  // editor does not already have (e.g. an override authored by a text editor
  // outside this layer). Local committed state always wins for a shared key.
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

  // ── Selection ──────────────────────────────────────────────────────────────

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
      if (!candidate) return { selection: null, narrowTo: null };
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
      const keys = selectedKeys(next);
      setRect(measureKeys(keys));
    },
    [measureKeys],
  );

  // ── Drag: move / resize ────────────────────────────────────────────────────

  const beginMove = React.useCallback(
    (event: PointerEvent, next: Selection, narrowTo: Selection | null) => {
      const keys = selectedKeys(next);
      if (keys.length === 0) return;
      const root = rootElement();
      const svg = (root?.querySelector('svg') ?? null) as SVGSVGElement | null;
      const startItems: Record<string, ElementOverride> = {};
      for (const key of keys) startItems[key] = overridesRef.current?.items[key] ?? {};
      pendingNarrowRef.current = narrowTo;
      dragRef.current = {
        kind: 'move',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: screenToViewBox(svg, event.clientX, event.clientY),
        keys,
        startScreenBox: screenBoxOfKeys(keys),
        startRect: measureKeys(keys) ?? { left: 0, top: 0, width: 0, height: 0 },
        startItems,
        members: [],
        moved: false,
        narrowTo,
        baseOverrides: cloneOverridesDeep(overridesRef.current),
      };
    },
    [measureKeys, rootElement, screenBoxOfKeys],
  );

  const beginResize = React.useCallback(
    (event: React.PointerEvent, handle: ElementHandle) => {
      const current = selectionRef.current;
      if (!current) return;
      const keys = selectedKeys(current);
      event.preventDefault();
      event.stopPropagation();

      const members: ResizeMember[] = [];
      for (const key of keys) {
        const el = findElement(key);
        if (!el) continue;
        const override = overridesRef.current?.items[key] ?? {};
        if (override.hidden) continue;
        members.push({ key, baseBox: elementBaseBox(el), override });
      }
      if (members.length === 0) return;

      dragRef.current = {
        kind: 'resize',
        handle,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: { x: 0, y: 0 },
        keys,
        startScreenBox: screenBoxOfKeys(keys),
        startRect: measureKeys(keys) ?? { left: 0, top: 0, width: 0, height: 0 },
        startItems: {},
        members,
        moved: false,
        narrowTo: null,
        baseOverrides: cloneOverridesDeep(overridesRef.current),
      };
    },
    [findElement, measureKeys, screenBoxOfKeys],
  );

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const screenDx = event.clientX - drag.startClientX;
      const screenDy = event.clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(screenDx, screenDy) <= DRAG_THRESHOLD) return;
      drag.moved = true;
      pendingNarrowRef.current = null;
      suppressClickRef.current = true;
      event.stopPropagation();

      const root = rootElement();
      if (!root) return;
      const next = cloneOverrides();

      if (drag.kind === 'move') {
        // Defect 5.3. Recompute the screen->viewBox matrix FRESH here (and for
        // the start point), never reuse a point cached before a zoom/pan: the
        // PictureStage rewrites the svg viewBox when zooming, and a stale
        // start point made a 50 px drag commit ~1 px.
        const svg = (root.querySelector('svg') ?? null) as SVGSVGElement | null;
        const startPoint = screenToViewBox(svg, drag.startClientX, drag.startClientY);
        const point = screenToViewBox(svg, event.clientX, event.clientY);
        const viewDx = point.x - startPoint.x;
        const viewDy = point.y - startPoint.y;
        for (const key of drag.keys) {
          const base = drag.startItems[key] ?? {};
          next.items[key] = {
            ...base,
            dx: (base.dx ?? 0) + viewDx,
            dy: (base.dy ?? 0) + viewDy,
          };
        }
        applyLive(next);
        setRect(
          toPercent({
            ...drag.startScreenBox,
            left: drag.startScreenBox.left + screenDx,
            top: drag.startScreenBox.top + screenDy,
          }),
        );
        return;
      }

      const result = resizeOverrides({
        handle: drag.handle as ElementHandle,
        startScreenBox: { width: drag.startScreenBox.width, height: drag.startScreenBox.height },
        delta: { dx: screenDx, dy: screenDy },
        members: drag.members,
        minScreenSize: MIN_SCREEN_SIZE,
      });
      for (const key of Object.keys(result)) next.items[key] = result[key];
      applyLive(next);

      const { fx, fy } = resizeFactors(
        drag.handle as ElementHandle,
        drag.startScreenBox.width,
        drag.startScreenBox.height,
        { dx: screenDx, dy: screenDy },
        MIN_SCREEN_SIZE,
      );
      const movesLeft = drag.handle === 'nw' || drag.handle === 'w' || drag.handle === 'sw';
      const movesTop = drag.handle === 'nw' || drag.handle === 'n' || drag.handle === 'ne';
      const newW = drag.startScreenBox.width * fx;
      const newH = drag.startScreenBox.height * fy;
      setRect(
        toPercent({
          left: movesLeft ? drag.startScreenBox.left + drag.startScreenBox.width - newW : drag.startScreenBox.left,
          top: movesTop ? drag.startScreenBox.top + drag.startScreenBox.height - newH : drag.startScreenBox.top,
          width: newW,
          height: newH,
        }),
      );
    };

    // PATCH-260. `finished` ensures exactly ONE commit per drag even though the
    // end can arrive several ways (pointerup, pointercancel, lostpointercapture,
    // or the trailing `click`). It is set before any early return.
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (drag.moved) {
        commitDrag(drag.baseOverrides);
        return;
      }
      // A click (no movement): an already-selected item narrows to the element.
      // Keep it pending too, so a real browser `click` that arrives after this
      // (and any re-render in between) still applies the narrowing.
      if (drag.narrowTo) {
        pendingNarrowRef.current = drag.narrowTo;
        applyNarrow(drag.narrowTo);
      }
    };

    // PATCH-260, done-cause 2. A browser or another interaction can capture the
    // pointer, after which pointerup is retargeted and never bubbles to window.
    const onLostCapture = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.moved) commitDrag(drag.baseOverrides);
    };

    // PATCH-260, done-cause 3. If a drag is still open when the trailing `click`
    // arrives (its pointerup was swallowed), finish it here. The capture phase
    // runs before any target-phase stopPropagation.
    const onClickFallback = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pointerId = (event as Partial<PointerEvent>).pointerId;
      if (pointerId !== undefined && pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (drag.moved) commitDrag(drag.baseOverrides);
    };

    // Capture phase on window: a listener on a child (the svg, AntV's own
    // interactions) that calls stopPropagation in the bubble phase can no longer
    // hide the end of a drag from us.
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('lostpointercapture', onLostCapture, true);
    window.addEventListener('click', onClickFallback, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('lostpointercapture', onLostCapture, true);
      window.removeEventListener('click', onClickFallback, true);
    };
  }, [applyLive, applyNarrow, cloneOverrides, commitDrag, measureKeys, rootElement, toPercent]);

  // Container listeners: pick a selection, or start an item/element move.
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
      // real browser click (which fires after pointerup) always narrows even if
      // the pointerup did not reach our window listener. It must NOT swallow a
      // text element's own click/dblclick (defect 6.1).
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

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('click', onClick, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('click', onClick, true);
    };
  }, [applyNarrow, beginMove, measureSelection, resolvePointerDown, rootElement]);

  // Re-measure after a commit / undo.
  React.useEffect(() => {
    setRect(selection ? measureKeys(selectedKeys(selection)) : null);
  }, [measureKeys, overrides, selection]);

  // PATCH-260, defect 2. PictureStage zooms/pans by rewriting the SVG's
  // `viewBox`; the selection box and its handles are positioned in screen
  // geometry, so they must be recomputed when it changes -- otherwise the stale
  // handles stay where the picture used to be and intercept clicks meant for
  // another item.
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
        className="pointer-events-none absolute inset-0 z-30"
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  return (
    <div
      data-ai-element-overlay="true"
      data-ai-element-selected={selectionLabel}
      data-ai-element-members={selection.kind === 'item' ? selection.keys.join(',') : undefined}
      className="pointer-events-none absolute inset-0 z-30"
      style={{ pointerEvents: 'none' }}
    >
      <div
        data-ai-element-box="true"
        className="absolute border-2 border-blue-500"
        style={{
          pointerEvents: 'none',
          left: `${rect.left}%`,
          top: `${rect.top}%`,
          width: `${rect.width}%`,
          height: `${rect.height}%`,
        }}
      />

      {HANDLES.map((handle) => (
        <button
          key={handle.name}
          type="button"
          data-ai-element-handle={handle.name}
          aria-label={`Resize ${handle.name}`}
          onPointerDown={(event) => beginResize(event, handle.name)}
          className="absolute h-2.5 w-2.5 rounded-full border border-white bg-blue-500 shadow"
          style={{
            pointerEvents: 'auto',
            left: `${rect.left + handle.fx * rect.width}%`,
            top: `${rect.top + handle.fy * rect.height}%`,
            transform: `translate(-50%, -50%) scale(${counterScale})`,
            cursor: CURSORS[handle.name],
          }}
        />
      ))}

      <div
        data-ai-element-bar="true"
        className="absolute flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-lg"
        style={{
          pointerEvents: 'auto',
          left: `${rect.left}%`,
          top: `calc(${Math.max(rect.top, 0)}% - 30px)`,
          transform: `scale(${counterScale})`,
          transformOrigin: 'left bottom',
        }}
      >
        <button type="button" data-ai-element-undo="true" title="Undo" onClick={undo} className="rounded p-1 text-gray-600 hover:bg-gray-100">
          <Undo2 size={14} />
        </button>
        <button type="button" data-ai-element-redo="true" title="Redo" onClick={redo} className="rounded p-1 text-gray-600 hover:bg-gray-100">
          <Redo2 size={14} />
        </button>
        <button type="button" data-ai-element-reset="true" title="Reset element" onClick={handleReset} className="rounded p-1 text-gray-600 hover:bg-gray-100">
          <RotateCcw size={14} />
        </button>
        <button type="button" data-ai-element-delete="true" title="Delete" onClick={handleDelete} className="rounded p-1 text-red-600 hover:bg-red-50">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
