'use client';

import React from 'react';

import { additionKindOf, findAdditionByKey } from '@/lib/ai/antv/additions';
import {
  elementAtPoint,
  elementItemScope,
  elementKey,
  isTransientElement,
  type ElementOverrides,
} from '@/lib/ai/antv/elementOverrides';

import {
  hasActiveAntvTextEditor,
  isTextElement,
  resolveAntvPointerDown,
  selectedKeys,
  type ChromeRect,
  type Selection,
} from './AntvElementChrome';

/**
 * PATCH-270. The editor's pointer/selection listeners, split out of
 * `AntvElementEditor` to keep that file under the 700-line ceiling. Behaviour is
 * unchanged: a pointerdown selects and starts a move, a click narrows, and a
 * double-click on a shape/icon opens the colour menu while text is left to AntV.
 */
export interface UseAntvElementSelectionOptions {
  rootElement: () => HTMLElement | null;
  selectionRef: React.MutableRefObject<Selection | null>;
  overridesRef: React.MutableRefObject<ElementOverrides | undefined>;
  pendingNarrowRef: React.MutableRefObject<Selection | null>;
  suppressClickRef: React.MutableRefObject<boolean>;
  measureKeys: (keys: string[]) => ChromeRect | null;
  setSelection: (next: Selection | null) => void;
  setRect: (rect: ChromeRect | null) => void;
  applyNarrow: (next: Selection) => void;
  beginMove: (event: PointerEvent, next: Selection, narrowTo: Selection | null) => void;
  openPanel: () => void;
  setEditingText: (value: { key: string; value: string } | null) => void;
}

export function useAntvElementSelection(options: UseAntvElementSelectionOptions): void {
  const {
    rootElement,
    selectionRef,
    overridesRef,
    pendingNarrowRef,
    suppressClickRef,
    measureKeys,
    setSelection,
    setRect,
    applyNarrow,
    beginMove,
    openPanel,
    setEditingText,
  } = options;

  React.useEffect(() => {
    const root = rootElement();
    if (!root) return;

    const measureSelection = (next: Selection | null) => {
      setRect(next ? measureKeys(selectedKeys(next)) : null);
    };

    const resolvePointerDown = (target: Element | null, clientX: number, clientY: number) =>
      resolveAntvPointerDown(root, selectionRef.current, target, clientX, clientY);

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
          openPanel();
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
      openPanel();
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('click', onClick, true);
    root.addEventListener('dblclick', onDoubleClick, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('dblclick', onDoubleClick, true);
    };
  }, [
    applyNarrow,
    beginMove,
    measureKeys,
    openPanel,
    overridesRef,
    pendingNarrowRef,
    rootElement,
    selectionRef,
    setEditingText,
    setRect,
    setSelection,
    suppressClickRef,
  ]);
}
