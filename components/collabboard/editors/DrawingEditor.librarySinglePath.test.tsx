// @vitest-environment jsdom
//
// PATCH-299 Addendum 2. The drawing post's personal library must reach the
// mounted Excalidraw ONLY through `updateLibrary(merge:false)` -- never through
// initialData, whose asynchronous merge duplicated every item. A list ready
// before the API (here the community items, with AntV still pending) must be
// pushed the moment the API arrives.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DrawingEditor from './DrawingEditor';

const hoisted = vi.hoisted(() => ({
  initialData: null as any,
  excalidrawAPI: null as ((api: any) => void) | null,
}));

vi.mock('./ExcalidrawWrapper', () => ({
  default: (props: any) => {
    if (props.initialData) hoisted.initialData = props.initialData;
    if (props.excalidrawAPI) hoisted.excalidrawAPI = props.excalidrawAPI;
    return React.createElement('div', { 'data-testid': 'excalidraw-stub' });
  },
}));

vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({
  getExcalidrawLibrary: () => [
    { id: 'community-1', name: 'My import', created: 123, elements: [{ id: 'c1', type: 'ellipse' }] },
  ],
}));

vi.mock('@/lib/collabboard/antvLibrary', () => ({
  // AntV never resolves here: the ready list is the community one.
  loadAntvLibraryItems: () => new Promise(() => {}),
}));

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
  hoisted.initialData = null;
  hoisted.excalidrawAPI = null;
});

describe('PATCH-299 Addendum 2: DrawingEditor single library path', () => {
  it('pushes a ready list once the API arrives, with merge:false, and initialData carries no libraryItems', async () => {
    mount(<DrawingEditor isOpen onClose={() => {}} onSave={() => {}} initialMetadata={{}} />);
    await act(async () => {
      for (let i = 0; i < 30 && !hoisted.initialData; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(hoisted.initialData).not.toBeNull();
    expect(hoisted.initialData).not.toHaveProperty('libraryItems');

    const updateLibrary = vi.fn();
    act(() => {
      hoisted.excalidrawAPI!({ updateLibrary });
    });

    expect(updateLibrary).toHaveBeenCalledTimes(1);
    const arg = updateLibrary.mock.calls[0][0];
    expect(arg.merge).toBe(false);
    expect(arg.libraryItems.map((item: any) => item.id)).toEqual(['community-1']);
  });
});
