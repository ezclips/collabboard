// @vitest-environment jsdom
//
// PATCH-275. The shared docked panel shell and its context.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DockedPanelShell,
  PictureSidePanelContext,
  usePictureSidePanel,
  type PictureSidePanelContextValue,
} from './PictureSidePanel';

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

describe('PATCH-275 DockedPanelShell', () => {
  it('renders the section, header, extra and close button', () => {
    const onClose = vi.fn();
    const c = mount(
      <DockedPanelShell id="designs" icon={<span data-test-icon="true" />} title="Designs" headerExtra={<span data-test-extra="true" />} onClose={onClose}>
        <div data-test-body="true" />
      </DockedPanelShell>,
    );

    const section = c.querySelector('[data-ai-side-panel="designs"]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.className).toContain('flex');
    expect(section.querySelector('[data-test-icon="true"]')).not.toBeNull();
    expect(section.textContent).toContain('Designs');
    expect(section.querySelector('[data-test-extra="true"]')).not.toBeNull();
    expect(section.querySelector('[data-test-body="true"]')).not.toBeNull();

    act(() => { (section.querySelector('[data-ai-side-panel-close="true"]') as Element).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH-275 PictureSidePanelContext', () => {
  function Probe() {
    const value = usePictureSidePanel();
    return <span data-test-value={value ? 'present' : 'null'} />;
  }

  it('is null without a provider', () => {
    const c = mount(<Probe />);
    expect(c.querySelector('[data-test-value]')!.getAttribute('data-test-value')).toBe('null');
  });

  it('returns the provided value', () => {
    const value: PictureSidePanelContextValue = {
      host: document.createElement('div'),
      elementPanelOpen: true,
      setElementPanelOpen: () => {},
    };
    const c = mount(
      <PictureSidePanelContext.Provider value={value}>
        <Probe />
      </PictureSidePanelContext.Provider>,
    );
    expect(c.querySelector('[data-test-value]')!.getAttribute('data-test-value')).toBe('present');
  });
});
