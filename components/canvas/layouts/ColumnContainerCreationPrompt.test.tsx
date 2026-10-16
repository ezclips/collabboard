// @vitest-environment jsdom
//
// PATCH-380 Addendum 1 / PATCH-381. On a Columns board this is the prompt a
// toolbar post opens. PATCH-381 unified its heading and disabled "Add to
// Existing" with a hint when the board has no containers.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ColumnContainerCreationPrompt from './ColumnContainerCreationPrompt';
import { ADD_TO_EXISTING_EMPTY_HINT } from '@/lib/domain/canvas/placementOptions';

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
const addToExistingButton = () =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Add to Existing'));

describe('PATCH-380 Addendum 1 / PATCH-381 ColumnContainerCreationPrompt', () => {
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

  it('reads "Where should this go?" for the new-post prompt', () => {
    mount();
    expect(text()).toContain('Where should this go?');
  });

  it('with 0 containers disables Add to Existing and shows the hint', () => {
    const onAddToExisting = vi.fn();
    mount({ containerCount: 0, onAddToExisting });
    const button = addToExistingButton()!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('[data-placement-hint]')?.textContent).toBe(ADD_TO_EXISTING_EMPTY_HINT);
    act(() => button.click());
    expect(onAddToExisting).not.toHaveBeenCalled();
  });

  it('with a container leaves Add to Existing enabled and hint-free', () => {
    const onAddToExisting = vi.fn();
    mount({ containerCount: 2, onAddToExisting });
    const button = addToExistingButton()!;
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(host.querySelector('[data-placement-hint]')).toBeNull();
    act(() => button.click());
    expect(onAddToExisting).toHaveBeenCalledTimes(1);
  });
});
