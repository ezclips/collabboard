'use client';

/**
 * PATCH-289. A large preview of a drawing-library item, shown on hover because
 * Excalidraw's own thumbnails are tiny. It never touches the Excalidraw fork:
 * it listens by delegation on the wrapper's root element, and renders a CLONE
 * of the thumbnail `<svg>` — never the live node — in a fixed floating box.
 */

import React from 'react';

const DWELL_MS = 250;
const MARGIN = 8;
const MAX_WIDTH = 360;
const MAX_HEIGHT = 300;
const DRAGGER_SELECTOR = '.library-unit__dragger';

export interface LibraryHoverPreviewProps {
  rootRef: React.RefObject<HTMLElement | null>;
}

interface Point {
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function previewWidth(): number {
  return Math.min(MAX_WIDTH, window.innerWidth * 0.4);
}

/** Left of the unit, vertically centred, or below it when the left has no room. */
export function positionFor(
  rect: { left: number; top: number; bottom: number; height: number },
  width: number,
  height: number,
): Point {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const leftCandidate = rect.left - width - MARGIN;
  if (leftCandidate >= MARGIN) {
    return {
      left: leftCandidate,
      top: clamp(rect.top + rect.height / 2 - height / 2, MARGIN, viewportHeight - height - MARGIN),
    };
  }
  return {
    left: clamp(rect.left, MARGIN, viewportWidth - width - MARGIN),
    top: clamp(rect.bottom + MARGIN, MARGIN, viewportHeight - height - MARGIN),
  };
}

export default function LibraryHoverPreview({ rootRef }: LibraryHoverPreviewProps): React.ReactElement {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const unitRef = React.useRef<Element | null>(null);

  const hide = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    unitRef.current = null;
    const box = boxRef.current;
    if (box) {
      box.style.display = 'none';
      while (box.firstChild) box.removeChild(box.firstChild);
    }
  }, []);

  const show = React.useCallback((unit: Element) => {
    const original = unit.querySelector('svg');
    const box = boxRef.current;
    if (!original || !box) return;
    const clone = original.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', '100%');
    clone.removeAttribute('height');
    clone.style.height = 'auto';
    clone.style.maxHeight = `${MAX_HEIGHT}px`;
    clone.style.display = 'block';
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(clone);
    box.style.display = 'block';
    const width = previewWidth();
    box.style.width = `${width}px`;
    const point = positionFor(unit.getBoundingClientRect(), width, box.getBoundingClientRect().height);
    box.style.left = `${point.left}px`;
    box.style.top = `${point.top}px`;
  }, []);

  React.useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const onPointerOver = (event: Event) => {
      if ((event as PointerEvent).pointerType === 'touch') return;
      const target = event.target as Element | null;
      const unit = target?.closest?.(DRAGGER_SELECTOR) ?? null;
      if (!unit || !unit.querySelector('svg')) return;
      if (unitRef.current === unit && boxRef.current?.style.display === 'block') return;
      hide();
      unitRef.current = unit;
      timer.current = setTimeout(() => {
        timer.current = null;
        show(unit);
      }, DWELL_MS);
    };

    const onPointerOut = (event: Event) => {
      const unit = unitRef.current;
      if (!unit) return;
      const related = (event as PointerEvent).relatedTarget as Node | null;
      if (related && unit.contains(related)) return;
      hide();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };

    const observer = new MutationObserver(() => {
      const unit = unitRef.current;
      if (unit && (!unit.isConnected || !element.contains(unit))) hide();
    });

    element.addEventListener('pointerover', onPointerOver);
    element.addEventListener('pointerout', onPointerOut);
    element.addEventListener('dragstart', hide);
    element.addEventListener('wheel', hide, true);
    document.addEventListener('keydown', onKeyDown);
    observer.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener('pointerover', onPointerOver);
      element.removeEventListener('pointerout', onPointerOut);
      element.removeEventListener('dragstart', hide);
      element.removeEventListener('wheel', hide, true);
      document.removeEventListener('keydown', onKeyDown);
      observer.disconnect();
      hide();
    };
  }, [rootRef, hide, show]);

  return (
    <div
      data-library-hover-preview
      ref={boxRef}
      style={{
        position: 'fixed',
        zIndex: 1000,
        pointerEvents: 'none',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
        padding: 8,
        display: 'none',
      }}
    />
  );
}
