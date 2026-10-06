/**
 * PATCH-302 Addendum 1. After a freeform template is applied, bring it into
 * view. The canvas opens at its default camera, so a wide template lands in a
 * corner and the Board AI panel covers the middle; the drop zone's button can
 * even sit under the panel. Poll until the posts exist, then scroll the canvas
 * so the drop zone (or the whole template) is centred in the canvas area that
 * is actually visible -- left of the Board AI panel when it is open.
 *
 * Browser-only: no React, no network, no state. Safe to call from an event
 * handler; it gives up after `timeoutMs` and never throws.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RevealScroll {
  /** Added to the container's scrollLeft / scrollTop. */
  left: number;
  top: number;
  /** The target is bigger than the visible area, so it is aligned, not centred. */
  tooLarge: boolean;
}

export interface FocusTarget {
  rect: Rect;
  element: Element;
  fromDropZone: boolean;
}

export function toRect(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>): Rect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return rects.reduce((acc, rect) => ({
    left: Math.min(acc.left, rect.left),
    top: Math.min(acc.top, rect.top),
    right: Math.max(acc.right, rect.right),
    bottom: Math.max(acc.bottom, rect.bottom),
  }));
}

/**
 * The drop zone's card when the Research template is present, else the union
 * of every post card. Null until anything has rendered.
 */
export function measureFocusTarget(doc: Document): FocusTarget | null {
  const zone = doc.querySelector('[data-research-drop-zone]');
  if (zone) {
    const card = zone.closest('[data-padlet-id]') ?? zone;
    return { rect: toRect(card.getBoundingClientRect()), element: card, fromDropZone: true };
  }
  const cards = Array.from(doc.querySelectorAll('[data-padlet-id]'));
  const rect = unionRects(cards.map((card) => toRect(card.getBoundingClientRect())));
  if (!rect) return null;
  return { rect, element: cards[0], fromDropZone: false };
}

/** The container's visible area, shortened on the right by the Board AI panel. */
export function visibleArea(container: Rect, panel: Rect | null): Rect {
  if (!panel) return container;
  return { ...container, right: Math.max(container.left, Math.min(container.right, panel.left)) };
}

/**
 * How far to scroll so the target is centred in the visible area. A target
 * larger than the visible area cannot be centred, so its top-left is aligned
 * 40 px inside instead.
 */
export function computeRevealScroll(focus: Rect, visible: Rect): RevealScroll {
  const focusWidth = focus.right - focus.left;
  const focusHeight = focus.bottom - focus.top;
  const visibleWidth = visible.right - visible.left;
  const visibleHeight = visible.bottom - visible.top;
  const tooLarge = focusWidth > visibleWidth || focusHeight > visibleHeight;
  const targetLeft = tooLarge ? visible.left + 40 : visible.left + (visibleWidth - focusWidth) / 2;
  const targetTop = tooLarge ? visible.top + 40 : visible.top + (visibleHeight - focusHeight) / 2;
  return { left: focus.left - targetLeft, top: focus.top - targetTop, tooLarge };
}

/** The nearest ancestor the browser can actually scroll. */
export function findScrollContainer(element: Element): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  let node = element.parentElement;
  while (node) {
    const style = view?.getComputedStyle(node);
    if (style) {
      const scrollsY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
      const scrollsX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth;
      if (scrollsX || scrollsY) return node;
    }
    node = node.parentElement;
  }
  return null;
}

export interface RevealOptions {
  doc?: Document;
  timeoutMs?: number;
  intervalMs?: number;
  /** Injectable for tests; defaults to a real timer. */
  wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export async function revealAppliedTemplate(options: RevealOptions = {}): Promise<void> {
  const doc = options.doc ?? document;
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 100;
  const wait = options.wait ?? defaultWait;

  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let target = measureFocusTarget(doc);
  for (let attempt = 0; !target && attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    target = measureFocusTarget(doc);
  }
  if (!target) return;

  const container = findScrollContainer(target.element);
  if (!container) return;

  const panel = doc.querySelector('[data-board-ai-chat="true"]');
  const panelRect = panel ? panel.getBoundingClientRect() : null;
  const visible = visibleArea(
    toRect(container.getBoundingClientRect()),
    panelRect && panelRect.width > 0 ? toRect(panelRect) : null,
  );
  const scroll = computeRevealScroll(target.rect, visible);
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  container.scrollBy({ left: scroll.left, top: scroll.top, behavior: reduced ? 'auto' : 'smooth' });
}
