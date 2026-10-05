// @vitest-environment jsdom
//
// PATCH-284. A stored drawn post opens in the Edit window showing the picture,
// offers Save/Cancel/Edit as drawing, and saves byte-identically when nothing
// changed.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIContentEditModal from './AIContentEditModal';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

vi.mock('@/components/ai/renderers/EditAsDrawingButton', () => ({
  default: () => React.createElement('button', { 'data-ai-edit-as-drawing': 'true' }),
}));

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
      elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' }],
    },
  },
  meta: { renderer: 'drawn', subtype: 'drawn', prompt: 'p' },
} as never;

describe('PATCH-284 Edit window drawn post', () => {
  it('opens showing the picture and offers Edit as drawing', () => {
    const c = mount(
      <AIContentEditModal isOpen onClose={() => {}} envelope={ENVELOPE} onSave={() => {}} onEditAsDrawing={() => {}} />,
    );
    expect(c.querySelector('[data-testid="ai-content-stub"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-as-drawing="true"]')).not.toBeNull();
  });

  it('saves byte-identically when nothing changed', () => {
    const onSave = vi.fn();
    const c = mount(
      <AIContentEditModal isOpen onClose={() => {}} envelope={ENVELOPE} onSave={onSave} />,
    );
    click(buttonContaining(c, 'Save changes'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].aiComponentJson).toEqual(ENVELOPE);
  });
});
