// @vitest-environment jsdom
//
// PATCH-275. The Edit window provides the same docked element-panel host: a
// column that appears only while an element is selected, in picture-first and
// in List view.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoredAIContent } from '@/lib/ai/contracts';

vi.mock('@/lib/ai/diagram-engine', () => ({
  renderDiagramCode: vi.fn(async () => ({ ok: true, svg: '<svg></svg>' })),
}));

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'preview' }),
}));

vi.mock('@/components/ai/renderers/InfographicRenderer', async () => {
  const ReactModule = await import('react');
  const ReactDOM = await import('react-dom');
  const { usePictureSidePanel } = await import('@/components/ai/renderers/PictureSidePanel');
  function Stub() {
    const panel = usePictureSidePanel();
    return ReactModule.createElement(
      'div',
      { 'data-test-antv-stub': 'true' },
      ReactModule.createElement('button', { 'data-test-select': 'true', onClick: () => panel?.setElementPanelOpen(true) }),
      ReactModule.createElement('button', { 'data-test-deselect': 'true', onClick: () => panel?.setElementPanelOpen(false) }),
      panel?.elementPanelOpen && panel.host
        ? ReactDOM.createPortal(ReactModule.createElement('div', { 'data-ai-element-panel': 'true' }), panel.host)
        : null,
    );
  }
  return { default: Stub };
});

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

function click(el: Element | null) {
  act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const INFOGRAPHIC_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'pyramid',
    outline: {
      title: 'Seasons',
      ordered: false,
      kind: 'levels',
      items: [{ label: 'Spring' }, { label: 'Summer' }],
    },
  },
};

function render() {
  return mount(
    <AIContentEditModal isOpen onClose={() => {}} envelope={INFOGRAPHIC_ENVELOPE} onSave={() => {}} />,
  );
}

describe('PATCH-275 AIContentEditModal element panel host', () => {
  it('adds the host column only while an element is selected, in picture-first view', () => {
    const c = render();
    expect(c.querySelector('[data-ai-side-panel-host]')).toBeNull();

    click(c.querySelector('[data-test-select]'));
    const host = c.querySelector('[data-ai-side-panel-host]') as HTMLElement;
    expect(host).not.toBeNull();
    expect(host.querySelector('[data-ai-element-panel]')).not.toBeNull();
    expect(host.closest('[data-ai-modal-body="true"]')).not.toBeNull();

    click(c.querySelector('[data-test-deselect]'));
    expect(c.querySelector('[data-ai-side-panel-host]')).toBeNull();
  });

  it('adds the host column in List view too, as the last child of the modal body', () => {
    const c = render();
    click(c.querySelector('[data-ai-list-view-toggle]'));
    const body = c.querySelector('[data-ai-modal-body="true"]') as HTMLElement;
    expect(body).not.toBeNull();

    click(c.querySelector('[data-test-select]'));
    const host = c.querySelector('[data-ai-side-panel-host]') as HTMLElement;
    expect(host).not.toBeNull();
    expect(body.lastElementChild).toBe(host);
    expect(host.querySelector('[data-ai-element-panel]')).not.toBeNull();
  });
});
