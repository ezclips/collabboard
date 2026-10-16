// @vitest-environment jsdom
//
// PATCH-380 Addendum 1. On a Columns board this is the prompt a toolbar post
// opens. A guest may not create a container, so "New Container" is hidden and
// only "Add to Existing" is offered.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ColumnContainerCreationPrompt from './ColumnContainerCreationPrompt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

function mount(props: Partial<React.ComponentProps<typeof ColumnContainerCreationPrompt>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ColumnContainerCreationPrompt
        isOpen
        onClose={vi.fn()}
        onNewContainer={vi.fn()}
        onAddToExisting={vi.fn()}
        {...props}
      />,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  document.body.innerHTML = '';
});

const text = () => host.textContent ?? '';
const newContainerButton = () =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New Container'));

describe('PATCH-380 Addendum 1 ColumnContainerCreationPrompt', () => {
  it('a member is offered both New Container and Add to Existing', () => {
    mount();
    expect(newContainerButton()).toBeTruthy();
    expect(text()).toContain('Add to Existing');
  });

  it('a guest (canCreateContainer=false) gets only Add to Existing', () => {
    mount({ canCreateContainer: false });
    expect(newContainerButton()).toBeFalsy();
    expect(text()).toContain('Add to Existing');
    expect(text()).not.toContain('New Container');
  });
});
