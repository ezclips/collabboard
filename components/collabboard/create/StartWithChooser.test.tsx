// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import StartWithChooser from './StartWithChooser';

const TEMPLATE: BoardTemplate = {
  id: 'project-plan',
  name: 'Project Plan',
  layout: 'freeform',
  previewUrl: '/templates/freeform/project-plan/preview.jpg',
  summary: 'Plan a project',
  contents: ['Milestones with dates'],
  posts: [],
};

let root: Root | null = null;
let host: HTMLElement;

async function mount(template: BoardTemplate | null) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StartWithChooser
        format="freeform"
        template={template}
        onChooseBlank={vi.fn()}
        onBrowseTemplates={vi.fn()}
      />,
    );
  });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;

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

describe('StartWithChooser template thumbnail', () => {
  it('renders the chosen template as an <img> in the thumb box, not as a background', async () => {
    await mount(TEMPLATE);
    const card = q('[data-choose-template]')!;
    const img = card.querySelector('[data-template-thumb] img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(TEMPLATE.previewUrl);
    for (const element of Array.from(card.querySelectorAll('*')) as HTMLElement[]) {
      expect(element.style.backgroundImage).toBe('');
    }
  });

  it('caps the width at half the natural width once loaded', async () => {
    await mount(TEMPLATE);
    const img = q('[data-template-thumb] img') as HTMLImageElement;
    expect(img.getAttribute('data-thumb-max-width')).toBeNull();

    Object.defineProperty(img, 'naturalWidth', { value: 416, configurable: true });
    await act(async () => { img.dispatchEvent(new Event('load', { bubbles: true })); });
    expect(img.getAttribute('data-thumb-max-width')).toBe('208');

    Object.defineProperty(img, 'naturalWidth', { value: 720, configurable: true });
    await act(async () => { img.dispatchEvent(new Event('load', { bubbles: true })); });
    expect(img.getAttribute('data-thumb-max-width')).toBe('360');
  });

  it('keeps the blank fan view when no template is chosen', async () => {
    await mount(null);
    const card = q('[data-choose-template]')!;
    expect(card.querySelector('[data-template-thumb]')).toBeNull();
    expect(card.querySelector('[data-browse-templates]')).not.toBeNull();
  });
});
