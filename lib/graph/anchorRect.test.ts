// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { measureAnchorRect } from './anchorRect';
import type { Padlet } from '@/types/collabboard';

type Box = { left: number; top: number; width: number; height: number };

function stubRect(el: Element, r: Box) {
  (el as HTMLElement).getBoundingClientRect = () => ({
    x: r.left,
    y: r.top,
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.left + r.width,
    bottom: r.top + r.height,
    toJSON: () => ({}),
  } as DOMRect);
}

function post(type = 'text'): Padlet {
  return { id: 'p', type } as unknown as Padlet;
}

function wrapper(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-padlet-id', 'p');
  return el;
}

describe('PATCH-227 measureAnchorRect', () => {
  it('uses the visual anchor when present and non-zero', () => {
    const el = wrapper();
    const img = document.createElement('img');
    img.setAttribute('data-graph-anchor', 'visual');
    el.appendChild(img);
    stubRect(el, { left: 0, top: 0, width: 100, height: 100 });
    stubRect(img, { left: 10, top: 10, width: 80, height: 60 });

    expect(measureAnchorRect(el, post('drawing'))).toEqual({
      left: 10, top: 10, width: 80, height: 60, usedVisualAnchor: true,
    });
  });

  it('ignores a zero-size visual anchor and falls through', () => {
    const el = wrapper();
    const img = document.createElement('img');
    img.setAttribute('data-graph-anchor', 'visual');
    el.appendChild(img);
    stubRect(el, { left: 5, top: 6, width: 100, height: 100 });
    stubRect(img, { left: 0, top: 0, width: 0, height: 0 });

    expect(measureAnchorRect(el, post('drawing'))).toEqual({
      left: 5, top: 6, width: 100, height: 100, usedVisualAnchor: false,
    });
  });

  it('cuts the bottom at a visible exclude row whose top is inside the rect', () => {
    const el = wrapper();
    const row = document.createElement('div');
    row.setAttribute('data-graph-anchor-exclude', 'true');
    el.appendChild(row);
    stubRect(el, { left: 0, top: 0, width: 100, height: 100 });
    stubRect(row, { left: 0, top: 80, width: 100, height: 20 });

    expect(measureAnchorRect(el, post())).toEqual({
      left: 0, top: 0, width: 100, height: 80, usedVisualAnchor: false,
    });
  });

  it('does not cut when the exclude row is not visible', () => {
    const el = wrapper();
    const row = document.createElement('div');
    row.setAttribute('data-graph-anchor-exclude', 'true');
    el.appendChild(row);
    stubRect(el, { left: 0, top: 0, width: 100, height: 100 });
    stubRect(row, { left: 0, top: 80, width: 100, height: 0 });

    expect(measureAnchorRect(el, post())).toEqual({
      left: 0, top: 0, width: 100, height: 100, usedVisualAnchor: false,
    });
  });

  it('returns the old rect when neither anchor is present', () => {
    const el = wrapper();
    stubRect(el, { left: 5, top: 6, width: 100, height: 100 });
    expect(measureAnchorRect(el, post())).toEqual({
      left: 5, top: 6, width: 100, height: 100, usedVisualAnchor: false,
    });
  });

  it('keeps the comment-root fallback', () => {
    const el = wrapper();
    const commentRoot = document.createElement('div');
    commentRoot.setAttribute('data-comment-post-root', 'true');
    el.appendChild(commentRoot);
    stubRect(el, { left: 0, top: 0, width: 100, height: 100 });
    stubRect(commentRoot, { left: 2, top: 3, width: 50, height: 60 });

    expect(measureAnchorRect(el, post('comment'))).toEqual({
      left: 2, top: 3, width: 50, height: 60, usedVisualAnchor: false,
    });
  });

  it('keeps the collapsed-wrapper child fallback', () => {
    const el = wrapper();
    const child = document.createElement('div');
    el.appendChild(child);
    stubRect(el, { left: 0, top: 0, width: 0, height: 0 });
    stubRect(child, { left: 1, top: 2, width: 50, height: 60 });

    expect(measureAnchorRect(el, post())).toEqual({
      left: 1, top: 2, width: 50, height: 60, usedVisualAnchor: false,
    });
  });
});
