// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TemplateGalleryModal from './TemplateGalleryModal';

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof TemplateGalleryModal>> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <TemplateGalleryModal
        open
        format="freeform"
        onClose={vi.fn()}
        onUse={vi.fn()}
        {...props}
      />,
    );
  });
  return host;
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;

async function click(element: HTMLElement | null) {
  await act(async () => {
    element!.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  document.body.innerHTML = '';
});

describe('TemplateGalleryModal', () => {
  it('shows the filter counts', async () => {
    await mount();
    expect(q('[data-gallery-filter="all"]')?.textContent).toContain('18');
    expect(q('[data-gallery-filter="freeform"]')?.textContent).toContain('8');
    expect(q('[data-gallery-filter="wall"]')?.textContent).toContain('2');
    expect(q('[data-gallery-filter="map"]')?.textContent).toContain('2');
  });

  it('opens filtered on the current format when it has templates', async () => {
    await mount({ format: 'freeform' });
    expect(q('[data-gallery-card="project-plan"]')).not.toBeNull();
    expect(q('[data-gallery-card="birthday-wall"]')).toBeNull();
    expect(q('[data-gallery-filter="freeform"]')?.getAttribute('aria-selected')).toBe('true');
  });

  it('falls back to "All" for a format with no templates', async () => {
    await mount({ format: 'kanban' });
    expect(q('[data-gallery-filter="all"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('[data-gallery-card="project-plan"]')).not.toBeNull();
  });

  it('filters the grid from the nav', async () => {
    await mount({ format: 'freeform' });
    await click(q('[data-gallery-filter="wall"]'));
    expect(q('[data-gallery-card="birthday-wall"]')).not.toBeNull();
    expect(q('[data-gallery-card="project-plan"]')).toBeNull();
  });

  it('opens a detail view with the contents, then reports the template and layout', async () => {
    const onUse = vi.fn();
    await mount({ format: 'freeform', onUse });

    await click(q('[data-gallery-card="project-plan"]'));
    expect(q('[data-use-template="project-plan"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Milestones with dates');
    expect(document.body.textContent).toContain("What's on the board");

    await click(q('[data-use-template="project-plan"]'));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0][0]).toMatchObject({ id: 'project-plan', layout: 'freeform' });
  });

  it('reports a template from another layout with that layout', async () => {
    const onUse = vi.fn();
    await mount({ format: 'freeform', onUse });

    await click(q('[data-gallery-filter="wall"]'));
    await click(q('[data-gallery-card="birthday-wall"]'));
    await click(q('[data-use-template="birthday-wall"]'));
    expect(onUse.mock.calls[0][0]).toMatchObject({ id: 'birthday-wall', layout: 'wall' });
  });

  it('returns from the detail view with Back to templates', async () => {
    await mount({ format: 'freeform' });
    await click(q('[data-gallery-card="project-plan"]'));
    expect(q('[data-gallery-card="project-plan"]')).toBeNull();
    await click(q('[data-back-to-templates]'));
    expect(q('[data-gallery-card="project-plan"]')).not.toBeNull();
  });
});
