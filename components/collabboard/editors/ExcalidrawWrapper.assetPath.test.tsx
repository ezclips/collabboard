// @vitest-environment jsdom
//
// PATCH-286 -- the drawing editor's fonts are served by the app itself. The
// wrapper previously pointed `window.EXCALIDRAW_ASSET_PATH` at unpkg.com, whose
// release does not match this vendored fork. The wrapper restores the app-owned
// base URL (the fork appends `fonts/<Family>/<file>`), while still deferring to
// a value a host already set.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@excalidraw/excalidraw', () => {
  const Item = (props: any) => React.createElement('div', null, props.children);
  const MainMenu: any = (props: any) => React.createElement('div', null, props.children);
  MainMenu.Item = Item;
  MainMenu.Separator = () => React.createElement('div');
  MainMenu.DefaultItems = {
    Help: Item,
    ClearCanvas: Item,
    ToggleTheme: Item,
    ChangeCanvasBackground: Item,
  };
  return {
    Excalidraw: (props: any) => React.createElement('div', { 'data-testid': 'excalidraw-stub' }, props.children),
    MainMenu,
    WelcomeScreen: (props: any) => React.createElement('div', null, props.children),
  };
});
vi.mock('@excalidraw/excalidraw/index.css', () => ({}));
vi.mock('@/components/collabboard/menus/ExcalidrawCollabBoardContextMenu', () => ({
  default: () => React.createElement('div'),
}));

import ExcalidrawWrapper from './ExcalidrawWrapper';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExcalidrawWrapper
        excalidrawKey={1}
        initialData={{ elements: [], appState: {}, files: {}, scrollToContent: false }}
        onChange={() => {}}
        readOnly={false}
        onShowHelp={() => {}}
      />
    );
    await Promise.resolve();
  });
  mounted.push({ root, container });
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
  delete (window as any).EXCALIDRAW_ASSET_PATH;
});

describe('PATCH-286: the drawing editor serves its own fonts', () => {
  it('points EXCALIDRAW_ASSET_PATH at the app, never unpkg', async () => {
    await mount();

    const value = (window as any).EXCALIDRAW_ASSET_PATH as string;
    expect(value).toBe(`${window.location.origin}/excalidraw-assets/`);
    expect(value).not.toContain('unpkg');
  });

  it('keeps a value a host already set', async () => {
    (window as any).EXCALIDRAW_ASSET_PATH = '/already/set/';

    await mount();

    expect((window as any).EXCALIDRAW_ASSET_PATH).toBe('/already/set/');
  });
});
