// @vitest-environment jsdom
//
// PATCH-291. ExcalidrawWrapper gains a `libraryButton` switch. With
// `libraryButton="toolbar"` it renders OUR library button and hides
// Excalidraw's own top-right trigger; with the default it renders neither.
// PATCH-299 keeps the Browse-libraries link visible now that it works.
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
    Excalidraw: (props: any) =>
      React.createElement('div', { 'data-testid': 'excalidraw-stub' }, props.children),
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

async function mount(props: { libraryButton?: 'toolbar' | 'default'; readOnly?: boolean } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExcalidrawWrapper
        excalidrawKey={1}
        initialData={{ elements: [], appState: {}, files: {}, scrollToContent: false }}
        onChange={() => {}}
        readOnly={props.readOnly ?? false}
        onShowHelp={() => {}}
        libraryButton={props.libraryButton}
      />,
    );
    await Promise.resolve();
  });
  mounted.push({ root, container });
  return container;
}

function styles(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('style'))
    .map((node) => node.textContent ?? '')
    .join('\n');
}

afterEach(() => {
  for (const entry of mounted) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  mounted = [];
});

describe('PATCH-291: ExcalidrawWrapper libraryButton', () => {
  it('default mode renders neither our button nor the trigger-hiding rule', async () => {
    const container = await mount();
    expect(container.querySelector('[data-drawing-library-button]')).toBeNull();
    expect(styles(container)).not.toContain('[data-library-button="toolbar"] .default-sidebar-trigger');
    expect(container.querySelector('[data-library-button]')!.getAttribute('data-library-button')).toBe('default');
  });

  it('toolbar mode renders our button and the trigger-hiding rule', async () => {
    const container = await mount({ libraryButton: 'toolbar' });
    expect(container.querySelector('[data-drawing-library-button]')).not.toBeNull();
    expect(styles(container)).toContain('[data-library-button="toolbar"] .default-sidebar-trigger');
    expect(container.querySelector('[data-library-button]')!.getAttribute('data-library-button')).toBe('toolbar');
  });

  it('does not hide the Browse-libraries link in either mode', async () => {
    const withDefault = await mount();
    expect(styles(withDefault)).not.toContain('.library-menu-browse-button');
    const withToolbar = await mount({ libraryButton: 'toolbar' });
    expect(styles(withToolbar)).not.toContain('.library-menu-browse-button');
  });
});
