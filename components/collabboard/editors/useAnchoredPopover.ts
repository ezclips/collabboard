"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface AnchorRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface PopoverPlacement {
    left: number;
    top: number;
    placement: 'right' | 'left';
}

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 8;

// Prefers opening to the right of the trigger (matches the proven
// CommentEditor/CommentPost layout); flips to the left when the right side
// doesn't have room, and clamps both axes inside the viewport so the popup
// never renders off-screen near a canvas edge.
export function computePopoverPlacement(
    triggerRect: AnchorRect,
    popoverSize: { width: number; height: number },
    viewport: { width: number; height: number }
): PopoverPlacement {
    const spaceRight = viewport.width - (triggerRect.left + triggerRect.width) - TRIGGER_GAP;
    const spaceLeft = triggerRect.left - TRIGGER_GAP;

    const placement: 'right' | 'left' =
        spaceRight >= popoverSize.width || spaceRight >= spaceLeft ? 'right' : 'left';

    const rawLeft =
        placement === 'right'
            ? triggerRect.left + triggerRect.width + TRIGGER_GAP
            : triggerRect.left - TRIGGER_GAP - popoverSize.width;

    const maxLeft = Math.max(viewport.width - popoverSize.width - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
    const left = Math.min(Math.max(rawLeft, VIEWPORT_MARGIN), maxLeft);

    const maxTop = Math.max(viewport.height - popoverSize.height - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
    const top = Math.min(Math.max(triggerRect.top, VIEWPORT_MARGIN), maxTop);

    return { left, top, placement };
}

// Measures a popover against a trigger rect (captured via
// getBoundingClientRect at click time -- robust to any canvas zoom/pan
// transform ancestors, unlike CSS-relative positioning) and recomputes on
// resize/scroll while open. Consumers portal the popover to document.body
// with `position: fixed` using the returned coordinates.
export function useAnchoredPopover(
    isOpen: boolean,
    triggerRect: AnchorRect | null,
    liveAnchorRef?: RefObject<Element | null>
) {
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<PopoverPlacement | null>(null);

    const recalculate = useCallback(() => {
        const liveRect = liveAnchorRef?.current?.getBoundingClientRect();
        const resolvedRect = liveRect
            ? { top: liveRect.top, left: liveRect.left, width: liveRect.width, height: liveRect.height }
            : triggerRect;
        if (!resolvedRect) {
            setPosition(null);
            return;
        }
        const popover = popoverRef.current;
        if (!popover) return;
        const popoverRect = popover.getBoundingClientRect();
        setPosition(
            computePopoverPlacement(
                resolvedRect,
                { width: popoverRect.width, height: popoverRect.height },
                { width: window.innerWidth, height: window.innerHeight }
            )
        );
    }, [liveAnchorRef, triggerRect]);

    useLayoutEffect(() => {
        if (!isOpen || !triggerRect) {
            setPosition(null);
            return;
        }
        recalculate();
        window.addEventListener('resize', recalculate);
        window.addEventListener('scroll', recalculate, true);
        let frame = 0;
        if (liveAnchorRef) {
            const trackAnchor = () => {
                recalculate();
                frame = window.requestAnimationFrame(trackAnchor);
            };
            frame = window.requestAnimationFrame(trackAnchor);
        }
        return () => {
            window.removeEventListener('resize', recalculate);
            window.removeEventListener('scroll', recalculate, true);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [isOpen, triggerRect, liveAnchorRef, recalculate]);

    return { popoverRef, position };
}

// Popover shells keep mousedown from stealing focus off the editor behind
// them -- but a blanket preventDefault also stops the popover's OWN form
// fields (link URL box, hex input) from ever receiving focus on click, so
// they must be let through. Same carve-out TextStylePopup makes internally.
export function preventPopoverFocusLoss(event: React.MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        event.stopPropagation();
        return;
    }
    event.preventDefault();
    event.stopPropagation();
}

export function rectFromElement(element: Element): AnchorRect {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}
