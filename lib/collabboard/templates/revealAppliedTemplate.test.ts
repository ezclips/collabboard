// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeRevealScroll,
  measureFocusTarget,
  revealAppliedTemplate,
  visibleArea,
  type Rect,
} from './revealAppliedTemplate';

function stubRect(element: Element, rect: Rect) {
  element.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('measureFocusTarget (PATCH-302 Addendum 1)', () => {
  it('chooses the drop zone card when the Research drop zone is present', () => {
    document.body.innerHTML = '<div data-padlet-id="p1"><div data-research-drop-zone="true"></div></div>';
    const card = document.querySelector('[data-padlet-id="p1"]') as HTMLElement;
    stubRect(card, { left: 100, top: 200, right: 460, bottom: 540 });

    const target = measureFocusTarget(document);
    expect(target?.fromDropZone).toBe(true);
    expect(target?.element).toBe(card);
    expect(target?.rect).toEqual({ left: 100, top: 200, right: 460, bottom: 540 });
  });

  it('unions every post card when there is no drop zone', () => {
    document.body.innerHTML = '<div data-padlet-id="a"></div><div data-padlet-id="b"></div>';
    const [a, b] = Array.from(document.querySelectorAll('[data-padlet-id]')) as HTMLElement[];
    stubRect(a, { left: 0, top: 0, right: 100, bottom: 100 });
    stubRect(b, { left: 200, top: 50, right: 300, bottom: 150 });

    const target = measureFocusTarget(document);
    expect(target?.fromDropZone).toBe(false);
    expect(target?.element).toBe(a);
    expect(target?.rect).toEqual({ left: 0, top: 0, right: 300, bottom: 150 });
  });

  it('returns null before anything has rendered', () => {
    expect(measureFocusTarget(document)).toBeNull();
  });
});

describe('computeRevealScroll (PATCH-302 Addendum 1)', () => {
  const container: Rect = { left: 0, top: 0, right: 1920, bottom: 889 };
  const focus: Rect = { left: 1065, top: 517, right: 1425, bottom: 857 };

  it('centres the target in the full canvas with no panel', () => {
    const scroll = computeRevealScroll(focus, visibleArea(container, null));
    expect(scroll).toEqual({ left: 285, top: 242.5, tooLarge: false });
  });

  it('centres the target in the area left of the Board AI panel', () => {
    const panel: Rect = { left: 1500, top: 0, right: 1920, bottom: 889 };
    const scroll = computeRevealScroll(focus, visibleArea(container, panel));
    expect(scroll).toEqual({ left: 495, top: 242.5, tooLarge: false });
  });

  it('aligns the top-left 40 px inside when the target is larger than the visible area', () => {
    const big: Rect = { left: 0, top: 0, right: 2000, bottom: 1000 };
    const visible: Rect = { left: 0, top: 0, right: 1500, bottom: 889 };
    expect(computeRevealScroll(big, visible)).toEqual({ left: -40, top: -40, tooLarge: true });
  });
});

describe('revealAppliedTemplate (PATCH-302 Addendum 1)', () => {
  it('gives up without throwing after the poll window', async () => {
    const wait = vi.fn(() => Promise.resolve());
    await expect(
      revealAppliedTemplate({ doc: document, timeoutMs: 300, intervalMs: 100, wait }),
    ).resolves.toBeUndefined();
    expect(wait).toHaveBeenCalledTimes(3);
  });
});
