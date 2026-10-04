// @vitest-environment jsdom
//
// PATCH-275. The generator's docked column coordinates the design panel with the
// element panel: one at a time, the design panel returns when the element panel
// closes, and onSidePanelChange follows the element panel too.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

// The real preview would load the AntV engine. Stand in for it with a consumer
// of the shared context that can open/close the element panel, so we test the
// column coordination itself.
vi.mock('@/components/ai/renderers/InfographicRenderer', async () => {
  const ReactModule = await import('react');
  const { usePictureSidePanel } = await import('@/components/ai/renderers/PictureSidePanel');
  function Stub() {
    const panel = usePictureSidePanel();
    return ReactModule.createElement(
      'div',
      { 'data-test-antv-stub': 'true' },
      ReactModule.createElement('button', { 'data-test-select': 'true', onClick: () => panel?.setElementPanelOpen(true) }),
      ReactModule.createElement('button', { 'data-test-deselect': 'true', onClick: () => panel?.setElementPanelOpen(false) }),
      panel?.elementPanelOpen ? ReactModule.createElement('div', { 'data-ai-element-panel': 'true' }) : null,
    );
  }
  return { default: Stub };
});

import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

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

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};
const OPTIONS = suggestDesigns(OUTLINE);
const ANTV_SELECTED = OPTIONS.find((option) => option.key.startsWith('antv:'))!;

const envelopeFor = (option: (typeof OPTIONS)[number]) => ({
  mode: 'diagram',
  version: 1,
  data: option.envelopeData,
  meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
});

function render(overrides: Partial<React.ComponentProps<typeof OutlineSuggestionsPanel>> = {}) {
  return mount(
    <OutlineSuggestionsPanel
      options={OPTIONS}
      selectedKey={ANTV_SELECTED.key}
      onSelect={() => {}}
      envelopeFor={envelopeFor}
      outline={OUTLINE}
      onEditOutline={() => {}}
      onThemeChange={() => {}}
      {...overrides}
    />,
  );
}

describe('PATCH-275 OutlineSuggestionsPanel dock coordination', () => {
  it('selecting an element hides Designs and shows the element panel; deselecting brings Designs back', () => {
    const c = render();
    expect(c.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();

    click(c.querySelector('[data-test-select]'));
    expect(c.querySelector('[data-ai-element-panel]')).not.toBeNull();
    expect(c.querySelector('[data-ai-side-panel="designs"]')).toBeNull();

    click(c.querySelector('[data-test-deselect]'));
    expect(c.querySelector('[data-ai-element-panel]')).toBeNull();
    expect(c.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();
  });

  it('clicking Edit text closes the element panel and opens its own panel', () => {
    const c = render();
    click(c.querySelector('[data-test-select]'));
    expect(c.querySelector('[data-ai-element-panel]')).not.toBeNull();

    click(c.querySelector('[data-ai-edit-text-toggle]'));
    expect(c.querySelector('[data-ai-element-panel]')).toBeNull();
    expect(c.querySelector('[data-ai-side-panel="edit"]')).not.toBeNull();
  });

  it('onSidePanelChange is true while only the element panel is open', () => {
    const onSidePanelChange = vi.fn();
    const c = render({ onSidePanelChange });

    // Close Designs so only the element panel can keep the column open.
    click(c.querySelector('[data-ai-designs-toggle]'));
    expect(onSidePanelChange).toHaveBeenLastCalledWith(false);

    click(c.querySelector('[data-test-select]'));
    expect(c.querySelector('[data-ai-element-panel]')).not.toBeNull();
    expect(onSidePanelChange).toHaveBeenLastCalledWith(true);

    click(c.querySelector('[data-test-deselect]'));
    expect(onSidePanelChange).toHaveBeenLastCalledWith(false);
  });
});
