// @vitest-environment jsdom
//
// PATCH-222 -- the drawing preview must be exported transparent.
//
// No existing DrawingEditor test mocks exportToSvg (the comment-canonicalization
// test lets the element ref stay empty, so the export branch never runs). This
// focused test drives the real handleSaveAndClose: it captures the wrapper's
// onChange so elementsRef is non-empty, stubs exportToSvg, and reads the
// appState the editor passes to it.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingEditor from './DrawingEditor';

const hoisted = vi.hoisted(() => ({
  onChange: null as null | ((elements: any[], appState: any, files: any) => void),
  exportToSvg: vi.fn(),
}));

vi.mock('./ExcalidrawWrapper', () => ({
  default: (props: any) => {
    hoisted.onChange = props.onChange;
    return React.createElement('div', { 'data-testid': 'excalidraw-stub' });
  },
}));
vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({ getExcalidrawLibrary: () => [] }));
vi.mock('@excalidraw/excalidraw', () => ({ exportToSvg: hoisted.exportToSvg }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
  vi.clearAllMocks();
  hoisted.onChange = null;
});

/** Lets next/dynamic resolve the (mocked) wrapper, then hands back onChange. */
async function waitForOnChange() {
  await act(async () => {
    for (let i = 0; i < 20 && !hoisted.onChange; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
  return hoisted.onChange;
}

describe('PATCH-222: a drawing preview is exported transparent', () => {
  it('exportToSvg is called with exportBackground: false, dark mode still off', async () => {
    hoisted.exportToSvg.mockResolvedValue(
      document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    );

    const onSave = vi.fn();
    const c = mount(
      <DrawingEditor isOpen onClose={() => {}} onSave={onSave} initialMetadata={{}} />,
    );

    const onChange = await waitForOnChange();
    expect(onChange, 'the wrapper rendered and captured onChange').toBeTruthy();
    act(() => {
      onChange!([{ id: 'e1' }], { theme: 'light' }, {});
    });

    const overlay = c.firstElementChild as HTMLElement;
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(hoisted.exportToSvg).toHaveBeenCalledTimes(1);
    const options = hoisted.exportToSvg.mock.calls[0][0];
    expect(options.appState.exportBackground).toBe(false);
    expect(options.appState.exportWithDarkMode).toBe(false);
  });
});
