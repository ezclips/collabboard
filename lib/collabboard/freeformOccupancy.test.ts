// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFreeformOccupiedRects, readFreeformVisibleArea } from './freeformOccupancy';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function stub(element: HTMLElement, box: DOMRect): HTMLElement {
  element.getBoundingClientRect = () => box;
  return element;
}

const toWorld = (clientX: number, clientY: number) => ({ x: clientX, y: clientY });

function mountContainer(): HTMLElement {
  const container = document.createElement('div');
  stub(container, rect(0, 0, 1000, 800));
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readFreeformVisibleArea', () => {
  it('cuts the right edge at an open Board AI panel', () => {
    const container = mountContainer();
    const panel = stub(document.createElement('div'), rect(600, 0, 400, 800));
    panel.setAttribute('data-board-ai-chat', 'true');
    document.body.appendChild(panel);

    expect(readFreeformVisibleArea(container, toWorld)).toEqual({ x: 0, y: 0, width: 600, height: 800 });
  });

  it('ignores a hidden Board AI panel (zero width)', () => {
    const container = mountContainer();
    const panel = stub(document.createElement('div'), rect(600, 0, 0, 800));
    panel.setAttribute('data-board-ai-chat', 'true');
    document.body.appendChild(panel);

    expect(readFreeformVisibleArea(container, toWorld)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it('cuts the right edge at a side-panel PDF reader', () => {
    const container = mountContainer();
    const reader = stub(document.createElement('div'), rect(700, 0, 880, 800));
    reader.setAttribute('data-knowledge-reader-presentation', 'side-panel');
    document.body.appendChild(reader);

    expect(readFreeformVisibleArea(container, toWorld)).toEqual({ x: 0, y: 0, width: 700, height: 800 });
  });

  it('cuts at the leftmost edge when both panels are open', () => {
    const container = mountContainer();
    const chat = stub(document.createElement('div'), rect(700, 0, 400, 800));
    chat.setAttribute('data-board-ai-chat', 'true');
    document.body.appendChild(chat);
    const reader = stub(document.createElement('div'), rect(600, 0, 880, 800));
    reader.setAttribute('data-knowledge-reader-presentation', 'side-panel');
    document.body.appendChild(reader);

    expect(readFreeformVisibleArea(container, toWorld)).toEqual({ x: 0, y: 0, width: 600, height: 800 });
  });

  it('ignores a reader whose presentation is not side-panel', () => {
    const container = mountContainer();
    const reader = stub(document.createElement('div'), rect(600, 0, 880, 800));
    reader.setAttribute('data-knowledge-reader-presentation', 'full-screen');
    document.body.appendChild(reader);

    expect(readFreeformVisibleArea(container, toWorld)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });
});

describe('readFreeformOccupiedRects', () => {
  it('ignores posts outside the container and posts with zero size', () => {
    const container = mountContainer();

    const inside = stub(document.createElement('div'), rect(100, 100, 50, 60));
    inside.setAttribute('data-padlet-id', 'inside');
    container.appendChild(inside);

    const outside = stub(document.createElement('div'), rect(2000, 2000, 50, 60));
    outside.setAttribute('data-padlet-id', 'outside');
    container.appendChild(outside);

    const zero = stub(document.createElement('div'), rect(300, 300, 0, 0));
    zero.setAttribute('data-padlet-id', 'zero');
    container.appendChild(zero);

    expect(readFreeformOccupiedRects(container, toWorld)).toEqual([{ x: 100, y: 100, width: 50, height: 60 }]);
  });
});
