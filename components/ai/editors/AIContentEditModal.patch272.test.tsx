// @vitest-environment jsdom
//
// PATCH-272. The Edit window loads and saves the validated data: a stored post
// with an unknown AntV template opens showing, and saves, the fallback design.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoredAIContent } from '@/lib/ai/contracts';

vi.mock('@/lib/ai/diagram-engine', () => ({
  renderDiagramCode: vi.fn(async () => ({ ok: true, svg: '<svg></svg>' })),
}));

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

const UNKNOWN_TEMPLATE_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'antv:obsolete-template',
    outline: {
      title: 'Seasons',
      ordered: false,
      kind: 'list',
      items: [
        { label: 'Spring', detail: 'warm' },
        { label: 'Summer', detail: 'hot' },
        { label: 'Autumn', detail: 'cool' },
      ],
    },
  },
};

describe('PATCH-272 AIContentEditModal loads and saves the validated data', () => {
  it('an unknown template opens as the fallback and saves the fallback', () => {
    const onSave = vi.fn();
    const c = mount(
      <AIContentEditModal isOpen onClose={() => {}} envelope={UNKNOWN_TEMPLATE_ENVELOPE} onSave={onSave} />,
    );

    // List view holds the design row.
    click(c.querySelector('[data-ai-list-view-toggle="true"]') as Element);

    expect(c.querySelector('[data-ai-infographic-design="antv:obsolete-template"]')).toBeNull();
    const fallbackButton = c.querySelector('[data-ai-infographic-design="antv:list-grid-badge-card"]') as HTMLElement;
    expect(fallbackButton).not.toBeNull();
    expect(fallbackButton.className).toContain('border-indigo-500');

    click(buttonContaining(c, 'Save changes'));
    const saved = onSave.mock.calls[0][0].aiComponentJson as StoredAIContent;
    expect((saved.data as { template: string }).template).toBe('antv:list-grid-badge-card');
  });
});
