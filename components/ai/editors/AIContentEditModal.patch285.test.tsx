// @vitest-environment jsdom
//
// PATCH-285. A stored drawn post is editable in the Edit window: click an
// element, change a colour, Save writes the edited picture; Cancel discards.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIContentEditModal from './AIContentEditModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}

const OUTLINE = {
  title: 'Launch',
  ordered: false,
  kind: 'steps',
  items: [{ label: 'A' }, { label: 'B' }],
};

const ENVELOPE = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'drawn',
    renderer: 'drawn',
    title: 'Launch',
    kind: 'flowchart',
    seed: 7,
    outline: OUTLINE,
    picture: {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 'r', type: 'rect', x: 10, y: 10, w: 200, h: 80, fill: '#aabbcc', stroke: '#000000' },
        { id: 't', type: 'text', text: 'Hi', x: 20, y: 30, w: 180, size: 16, color: '#111111', in: 'r' },
      ],
    },
  },
  meta: { renderer: 'drawn', subtype: 'drawn', prompt: 'p' },
} as never;

describe('PATCH-285 Edit window drawn editing', () => {
  it('edits an element and Save stores the edited picture', () => {
    const onSave = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={ENVELOPE} onSave={onSave} />);

    click(c.querySelector('[data-drawn-id="r"]') as Element);
    const swatch = c.querySelector('[data-drawn-swatch="fill"][data-drawn-swatch-value="#000000"]') as Element;
    expect(swatch, 'the shape panel is open').not.toBeNull();
    click(swatch);
    click(buttonContaining(c, 'Save changes'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0].aiComponentJson.data.picture;
    expect(saved.elements.find((el: { id: string }) => el.id === 'r').fill).toBe('#000000');
  });

  it('Cancel discards an edit', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={onClose} envelope={ENVELOPE} onSave={onSave} />);

    click(c.querySelector('[data-drawn-id="r"]') as Element);
    click(c.querySelector('[data-drawn-swatch="fill"][data-drawn-swatch-value="#000000"]') as Element);
    click(buttonContaining(c, 'Cancel'));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
