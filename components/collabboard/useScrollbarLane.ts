"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

// The actual pixel width the browser reserves for `element`'s own
// scrollbar/gutter right now, derived from real layout rather than an
// assumed OS/browser constant. With `scrollbar-gutter: stable` set on the
// element this reservation is present whether or not a scrollbar is
// currently painting, so `offsetWidth - clientWidth` is a stable, exact
// measurement (border-box minus content+padding box) rather than an
// approximation -- it equals 0 on platforms whose scrollbar takes no layout
// space at all (e.g. macOS overlay scrollbars), meaning no compensation is
// applied there either.
export function computeScrollbarLane(offsetWidth: number, clientWidth: number): number {
  const gutter = offsetWidth - clientWidth;
  return gutter > 0 ? gutter : 0;
}

// Measures the real scrollbar/gutter reservation on `ref`'s own element and
// keeps it in sync via ResizeObserver, so a caller can widen the element by
// exactly that amount (with a matching negative margin) to push the
// reservation into a dedicated outside lane instead of letting it shrink the
// element's own content box -- see RowColumnContainerCard.tsx and
// PostCardContent.tsx's nested-Container branch, the two Container child-list
// scroll viewports that both apply this. Returns 0 (no compensation) while
// `enabled` is false, matching the element's own non-scrolling CSS state.
// Each call site measures its own element independently -- there is no
// shared/global scrollbar-width state, so nested Containers each get their
// own correct value even if one is mid-resize while the other is not.
export function useScrollbarLane(ref: RefObject<HTMLElement | null>, enabled: boolean): number {
  const [lane, setLane] = useState(0);
  const laneRef = useRef(0);

  useLayoutEffect(() => {
    if (!enabled) {
      laneRef.current = 0;
      setLane(0);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const next = computeScrollbarLane(el.offsetWidth, el.clientWidth);
      if (next !== laneRef.current) {
        laneRef.current = next;
        setLane(next);
      }
    };

    measure();
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [ref, enabled]);

  return lane;
}
