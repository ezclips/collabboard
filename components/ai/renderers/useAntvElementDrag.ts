'use client';

import React from 'react';

import {
  elementBaseBox,
  resizeFactors,
  resizeOverrides,
  screenToViewBox,
  type ElementHandle,
  type ElementOverride,
  type ElementOverrides,
  type ResizeMember,
  type ScreenBox,
} from '@/lib/ai/antv/elementOverrides';
import {
  DRAG_THRESHOLD,
  MIN_SCREEN_SIZE,
  cloneOverridesDeep,
  selectedKeys,
  type ChromeRect,
  type Selection,
} from './AntvElementChrome';

/**
 * PATCH-260/261. The move/resize pointer machine, split out of
 * `AntvElementEditor` to keep that file under the 700-line ceiling. It only
 * mutates the override map through the editor's own callbacks, so history and
 * the no-AI-call contract are unchanged. It also stops the browser selecting
 * page text while a drag is live (PATCH-261 Addendum 1.2).
 */

interface DragState {
  kind: 'move' | 'resize';
  pointerId: number;
  handle?: ElementHandle;
  startClientX: number;
  startClientY: number;
  startPoint: { x: number; y: number };
  keys: string[];
  startScreenBox: ScreenBox;
  startRect: ChromeRect;
  startItems: Record<string, ElementOverride>;
  members: ResizeMember[];
  moved: boolean;
  narrowTo: Selection | null;
  baseOverrides: ElementOverrides | undefined;
}

function preventSelectStart(event: Event): void {
  event.preventDefault();
}

export interface UseAntvElementDragOptions {
  rootElement: () => HTMLElement | null;
  selectionRef: React.MutableRefObject<Selection | null>;
  overridesRef: React.MutableRefObject<ElementOverrides | undefined>;
  pendingNarrowRef: React.MutableRefObject<Selection | null>;
  suppressClickRef: React.MutableRefObject<boolean>;
  applyLive: (next: ElementOverrides) => void;
  cloneOverrides: () => ElementOverrides;
  commitDrag: (base: ElementOverrides | undefined) => void;
  applyNarrow: (next: Selection) => void;
  measureKeys: (keys: string[]) => ChromeRect | null;
  screenBoxOfKeys: (keys: string[]) => ScreenBox;
  toPercent: (box: ScreenBox) => ChromeRect;
  findElement: (key: string) => Element | null;
  setRect: (rect: ChromeRect | null) => void;
}

export function useAntvElementDrag(options: UseAntvElementDragOptions): {
  beginMove: (event: PointerEvent, next: Selection, narrowTo: Selection | null) => void;
  beginResize: (event: React.PointerEvent, handle: ElementHandle) => void;
} {
  const {
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
  } = options;

  const dragRef = React.useRef<DragState | null>(null);

  const setDraggingUserSelect = React.useCallback((dragging: boolean) => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (!body) return;
    if (dragging) {
      body.style.userSelect = 'none';
      body.addEventListener('selectstart', preventSelectStart, true);
    } else {
      body.style.userSelect = '';
      body.removeEventListener('selectstart', preventSelectStart, true);
    }
  }, []);

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
    [measureKeys, overridesRef, pendingNarrowRef, rootElement, screenBoxOfKeys],
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
    [findElement, measureKeys, overridesRef, screenBoxOfKeys, selectionRef],
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
      setDraggingUserSelect(true);
      event.stopPropagation();

      const root = rootElement();
      if (!root) return;
      const next = cloneOverrides();

      if (drag.kind === 'move') {
        // Defect 5.3. Recompute the screen->viewBox matrix FRESH here (and for
        // the start point), never reuse a point cached before a zoom/pan.
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

    // PATCH-260. The end can arrive several ways (pointerup, pointercancel,
    // lostpointercapture, or the trailing `click`); exactly one commit per drag.
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setDraggingUserSelect(false);
      if (drag.moved) {
        commitDrag(drag.baseOverrides);
        return;
      }
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
      setDraggingUserSelect(false);
      if (drag.moved) commitDrag(drag.baseOverrides);
    };

    // PATCH-260, done-cause 3. If a drag is still open when the trailing `click`
    // arrives (its pointerup was swallowed), finish it here.
    const onClickFallback = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pointerId = (event as Partial<PointerEvent>).pointerId;
      if (pointerId !== undefined && pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setDraggingUserSelect(false);
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
      setDraggingUserSelect(false);
    };
  }, [
    applyLive,
    applyNarrow,
    cloneOverrides,
    commitDrag,
    pendingNarrowRef,
    rootElement,
    setDraggingUserSelect,
    suppressClickRef,
    toPercent,
  ]);

  return { beginMove, beginResize };
}
