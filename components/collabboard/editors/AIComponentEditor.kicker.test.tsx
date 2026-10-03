// @vitest-environment jsdom
//
// PATCH-264. The generator's main preview lets the user rename or remove the
// diagram type label; the choice survives switching designs and rides into the
// Save payload.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

import AIComponentEditor from './AIComponentEditor';

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
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}

const OUTLINE = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [{ label: 'Spring' }, { label: 'Summer' }, { label: 'Autumn' }],
};

const STORED = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'stack',
    outline: OUTLINE,
  },
  meta: { renderer: 'infographic', subtype: 'infographic', prompt: 'p' },
};

describe('PATCH-264 AIComponentEditor kicker', () => {
  it('removes the label, keeps it removed across designs, and saves an empty kicker', () => {
    const onSave = vi.fn();
    const c = mount(
      <AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={onSave} />,
    );

    // The main preview shows the default label; the x removes it.
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('infographic');
    click(c.querySelector('[data-ai-kicker-remove]')!);
    expect(c.querySelector('[data-ai-kicker]')).toBeNull();
    expect(c.querySelector('[data-ai-kicker-add]')).not.toBeNull();

    // Switch to another of our designs: the label stays removed (a '+ Add label'
    // chip, never the default text).
    const pyramid = c.querySelector('[data-ai-outline-option="infographic:pyramid"]');
    expect(pyramid).not.toBeNull();
    click(pyramid!);
    expect(c.querySelector('[data-ai-kicker]')).toBeNull();
    expect(c.querySelector('[data-ai-kicker-add]')).not.toBeNull();

    click(buttonContaining(c, 'Save to Canvas'));
    const saved = onSave.mock.calls.at(-1)![0];
    expect(saved.aiComponentJson.data.kicker).toBe('');
  });
});
