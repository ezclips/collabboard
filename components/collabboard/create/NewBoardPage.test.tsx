// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  push: vi.fn(),
  createBoard: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: hoisted.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('next/link', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      ReactModule.createElement('a', { href, ...rest }, children),
  };
});

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }));

vi.mock('@/lib/collabboard/create/createBoard', () => ({ createBoard: hoisted.createBoard }));

import NewBoardPage from './NewBoardPage';

let root: Root | null = null;
let host: HTMLElement;

async function mount() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<NewBoardPage />);
  });
  return host;
}

const q = (selector: string) =>
  (host.querySelector(selector) ?? document.querySelector(selector)) as HTMLElement | null;

async function click(element: HTMLElement | null) {
  await act(async () => {
    element!.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const nameValue = () => (q('[data-board-name]') as HTMLInputElement).value;

beforeEach(() => {
  document.body.innerHTML = '';
  hoisted.push.mockReset();
  hoisted.createBoard.mockReset();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
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

async function pickProjectPlan() {
  await click(q('[data-browse-templates]'));
  await click(q('[data-gallery-card="project-plan"]'));
  await click(q('[data-use-template="project-plan"]'));
}

describe('NewBoardPage', () => {
  it('renders exactly one "Create board" button and no button in the top bar', async () => {
    await mount();
    const createButtons = Array.from(document.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('Create board'),
    );
    expect(createButtons).toHaveLength(1);
    expect(q('[data-new-board-bar] button')).toBeNull();
    expect(q('[data-new-board-bar] a')?.getAttribute('href')).toBe('/dashboard');
  });

  it('frames the bar and the grid inside a max-w-[1320px] container', async () => {
    await mount();
    const frame = document.querySelector('[class*="max-w-[1320px]"]') as HTMLElement | null;
    expect(frame).not.toBeNull();
    expect(frame!.contains(q('[data-new-board-bar]'))).toBe(true);
    expect(frame!.contains(q('main'))).toBe(true);
  });

  it('starts with the default name, icon and background', async () => {
    await mount();
    expect(nameValue()).toBe('Untitled board');
    expect(q('[data-board-icon-field] [aria-pressed="true"]')).not.toBeNull();
    expect(q('[data-board-background-field] [aria-pressed="true"]')).not.toBeNull();
  });

  it('sets the name to the template name and reverts it on a format switch', async () => {
    await mount();
    expect(nameValue()).toBe('Untitled board');

    await pickProjectPlan();
    expect(nameValue()).toBe('Project Plan');

    await click(q('[data-format-tile="wall"]'));
    expect(nameValue()).toBe('Untitled board');
  });

  it('reverts the name when Blank board is chosen after a template', async () => {
    await mount();
    await pickProjectPlan();
    expect(nameValue()).toBe('Project Plan');

    await click(q('[data-choose-blank]'));
    expect(nameValue()).toBe('Untitled board');
  });

  it('keeps a user-typed name when a template is chosen', async () => {
    await mount();
    const input = q('[data-board-name]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      setValue.call(input, 'My research');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await pickProjectPlan();
    expect(nameValue()).toBe('My research');
  });

  it('pushes the board URL without a template param', async () => {
    hoisted.createBoard.mockResolvedValue({ ok: true, boardId: 'board-9' });
    await mount();
    await click(q('[data-create-board]'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hoisted.push).toHaveBeenCalledWith('/dashboard/canvas/board-9');
  });

  it('pushes the board URL with the template param', async () => {
    hoisted.createBoard.mockResolvedValue({ ok: true, boardId: 'board-9' });
    await mount();
    await pickProjectPlan();
    await click(q('[data-create-board]'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hoisted.push).toHaveBeenCalledWith('/dashboard/canvas/board-9?template=project-plan');
  });

  it('shows the error message when create fails', async () => {
    hoisted.createBoard.mockResolvedValue({ ok: false, message: 'Free plan allows up to 3 active boards. Upgrade to Pro to create more.' });
    await mount();
    await click(q('[data-create-board]'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Free plan allows up to 3 active boards.');
    expect(hoisted.push).not.toHaveBeenCalled();
  });

  it('toggles the two visible switches', async () => {
    await mount();
    const comments = host.querySelector('[aria-label="Comments"]') as HTMLElement;
    const newFirst = host.querySelector('[aria-label="New posts first"]') as HTMLElement;
    expect(comments.getAttribute('aria-checked')).toBe('true');
    expect(newFirst.getAttribute('aria-checked')).toBe('true');

    await click(comments);
    expect(comments.getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the switch knob inside the track (PATCH-301 Addendum 2)', async () => {
    await mount();
    const comments = host.querySelector('[aria-label="Comments"]') as HTMLElement;
    const knob = comments.querySelector('[data-switch-knob]') as HTMLElement;

    expect(knob.className).toContain('left-[3px]');
    expect(knob.className).toContain('translate-x-4');
    expect(knob.className).not.toContain('translate-x-0');

    await click(comments);
    expect(knob.className).toContain('left-[3px]');
    expect(knob.className).toContain('translate-x-0');
    expect(knob.className).not.toContain('translate-x-4');
  });
});
