// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  apply: vi.fn(),
  factory: vi.fn(),
}));

vi.mock('@/lib/infra/canvas/postsRepository', () => ({
  createPostsRepository: () => ({}),
}));

vi.mock('@/lib/infra/canvas/sectionsRepository', () => ({
  createSectionsRepository: () => ({}),
}));

vi.mock('@/lib/domain/canvas/boardTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/canvas/boardTemplates')>();
  return {
    ...actual,
    createApplyBoardTemplateCommand: (repository: unknown) => {
      hoisted.factory(repository);
      return hoisted.apply;
    },
  };
});

vi.mock('@/lib/collabboard/templates/revealAppliedTemplate', () => ({
  revealAppliedTemplate: vi.fn(),
}));

import BoardTemplatePicker from './BoardTemplatePicker';
import { readBoardTemplateRequest } from '@/lib/collabboard/templates/templateRequest';
import { revealAppliedTemplate } from '@/lib/collabboard/templates/revealAppliedTemplate';

const BOARD = 'board-1';
const DISMISS_KEY = `fable.templatePicker.dismissed.${BOARD}`;
const ROOT = path.resolve(__dirname, '../../..');

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof BoardTemplatePicker>> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BoardTemplatePicker
        boardId={BOARD}
        layout="freeform"
        posts={[]}
        postsLoaded
        canEdit
        {...props}
      />,
    );
  });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const click = async (element: HTMLElement | null) => {
  await act(async () => {
    element!.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

async function rerender(props: Partial<React.ComponentProps<typeof BoardTemplatePicker>> = {}) {
  await act(async () => {
    root!.render(
      <BoardTemplatePicker
        boardId={BOARD}
        layout="freeform"
        posts={[]}
        postsLoaded
        canEdit
        {...props}
      />,
    );
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function realPost(overrides: Record<string, unknown> = {}) {
  return { id: 'p-1', type: 'text', title: 'Real', content: '<p>x</p>', metadata: {}, ...overrides } as any;
}

function placeholderPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'placeholder-1',
    type: 'container',
    title: '',
    content: '',
    metadata: { isContainer: true, childPadletIds: [] },
    ...overrides,
  } as any;
}

async function outsidePress() {
  await act(async () => {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  hoisted.apply.mockReset();
  hoisted.factory.mockReset();
  hoisted.apply.mockResolvedValue({ ok: true, value: 1 });
  vi.mocked(revealAppliedTemplate).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
});

describe('BoardTemplatePicker visibility', () => {
  it('renders nothing for a viewer', async () => {
    await mount({ canEdit: false });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('renders nothing for a non-empty board', async () => {
    await mount({ posts: [realPost()] });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('renders nothing before posts have loaded', async () => {
    await mount({ postsLoaded: false });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('renders nothing for a layout with no group', async () => {
    await mount({ layout: 'kanban' });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('renders nothing once dismissed for this board', async () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    await mount();
    expect(q('[data-board-template-picker]')).toBeNull();
  });
});

describe('BoardTemplatePicker behaviour', () => {
  it('shows the group label and the selectable rows', async () => {
    await mount();
    expect(q('[data-board-template-picker]')?.textContent).toContain('Freeform canvas');
    expect(q('[data-board-template-row="empty"]')?.textContent).toContain('Empty board');
    expect(q('[data-board-template-row="project-plan"]')?.textContent).toContain('Project Plan');
    expect(q('[data-board-template-row="empty"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders nine template rows under "Freeform canvas"', async () => {
    await mount();
    expect(q('[data-board-template-picker]')?.textContent).toContain('Freeform canvas');
    const rows = Array.from(host.querySelectorAll('[data-board-template-row]'));
    const templateRows = rows.filter((row) => row.getAttribute('data-board-template-row') !== 'empty');
    expect(templateRows).toHaveLength(9);
    expect(templateRows.map((row) => row.getAttribute('data-board-template-row'))).toEqual([
      'research',
      'project-plan',
      'moodboard',
      'creative-brief',
      'character-profile',
      'weekly-plan',
      'trip-planner',
      'event-plan',
      'product-launch',
    ]);
  });

  it('shows the selected template\u2019s preview image and none for Empty board', async () => {
    await mount();
    expect(q('[data-board-template-preview]')).toBeNull();

    await click(q('[data-board-template-row="moodboard"]'));
    const preview = q('[data-board-template-preview]');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute('src')).toBe('/templates/freeform/moodboard/preview.jpg');
    expect(preview?.getAttribute('alt')).toBe('Moodboard preview');

    await click(q('[data-board-template-row="empty"]'));
    expect(q('[data-board-template-preview]')).toBeNull();
  });

  it('runs the command once, shows Adding…, closes and stores dismissal on success', async () => {
    const pending = deferred<{ ok: true; value: number }>();
    hoisted.apply.mockReturnValue(pending.promise);
    await mount();

    await click(q('[data-board-template-row="project-plan"]'));
    const applyButton = q('[data-board-template-apply]') as HTMLButtonElement;
    expect(applyButton.textContent).toContain('Use this template');

    await click(applyButton);
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(hoisted.apply.mock.calls[0][0]).toEqual({
      boardId: BOARD,
      template: expect.objectContaining({ id: 'project-plan' }),
      existingSections: [],
      replacePostIds: [],
    });
    expect(hoisted.apply.mock.calls[0][1]).toEqual({ userId: null });
    expect((q('[data-board-template-apply]') as HTMLButtonElement).textContent).toContain('Adding…');

    await act(async () => {
      pending.resolve({ ok: true, value: 1 });
      await pending.promise;
    });
    expect(q('[data-board-template-picker]')).toBeNull();
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it('passes the board sections through as existingSections', async () => {
    const sections = [{ id: 12, title: 'One', position: 2 }];
    await mount({ sections });
    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));
    expect(hoisted.apply.mock.calls[0][0]).toMatchObject({ existingSections: sections });
  });

  it('stays with "Adding…" when template posts arrive while the command is still in flight, then closes on success', async () => {
    const pending = deferred<{ ok: true; value: number }>();
    hoisted.apply.mockReturnValue(pending.promise);
    await mount();
    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));

    await rerender({ posts: [realPost()] });
    expect(q('[data-board-template-picker]')).not.toBeNull();
    expect((q('[data-board-template-apply]') as HTMLButtonElement).textContent).toContain('Adding…');

    await act(async () => {
      pending.resolve({ ok: true, value: 1 });
      await pending.promise;
    });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('stays with the error message when posts had arrived before a failed command resolved', async () => {
    const pending = deferred<{ ok: false; error: { code: string; message: string } }>();
    hoisted.apply.mockReturnValue(pending.promise);
    await mount();
    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));

    await rerender({ posts: [realPost()] });
    expect(q('[data-board-template-picker]')).not.toBeNull();

    await act(async () => {
      pending.resolve({ ok: false, error: { code: 'unavailable', message: 'boom' } });
      await pending.promise;
    });
    expect(host.textContent).toContain('The template could not be added. Nothing was changed — try again.');
    expect((q('[data-board-template-apply]') as HTMLButtonElement).disabled).toBe(false);
    expect(q('[data-board-template-picker]')).not.toBeNull();
  });

  it('shows an inline error, keeps the button enabled and does not dismiss', async () => {
    hoisted.apply.mockResolvedValue({ ok: false, error: { code: 'unavailable', message: 'boom' } });
    await mount();
    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));

    expect(host.textContent).toContain('The template could not be added. Nothing was changed — try again.');
    expect((q('[data-board-template-apply]') as HTMLButtonElement).disabled).toBe(false);
    expect(q('[data-board-template-picker]')).not.toBeNull();
    expect(window.localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it('Start empty dismisses without running the command', async () => {
    await mount();
    const applyButton = q('[data-board-template-apply]') as HTMLButtonElement;
    expect(applyButton.textContent).toContain('Start empty');

    await click(applyButton);
    expect(hoisted.apply).not.toHaveBeenCalled();
    expect(q('[data-board-template-picker]')).toBeNull();
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it('still works when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('nope');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('nope');
    });

    await mount();
    expect(q('[data-board-template-picker]')).not.toBeNull();

    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('calls onApplied once, only after the command resolves ok', async () => {
    const onApplied = vi.fn();
    const pending = deferred<{ ok: true; value: number }>();
    hoisted.apply.mockReturnValue(pending.promise);
    await mount({ onApplied });
    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));

    expect(onApplied).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ ok: true, value: 1 });
      await pending.promise;
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('passes the applied template to onApplied', async () => {
    const onApplied = vi.fn();
    await mount({ onApplied });
    await click(q('[data-board-template-row="research"]'));
    await click(q('[data-board-template-apply]'));

    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied.mock.calls[0][0]).toMatchObject({ id: 'research', openBoardAiAfterApply: true });
  });

  it('reveals the board after a successful freeform apply', async () => {
    await mount();
    await click(q('[data-board-template-row="research"]'));
    await click(q('[data-board-template-apply]'));
    expect(revealAppliedTemplate).toHaveBeenCalledTimes(1);
  });

  it('does not reveal after a non-freeform apply', async () => {
    await mount({ layout: 'wall' });
    await click(q('[data-board-template-row="birthday-wall"]'));
    await click(q('[data-board-template-apply]'));
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(revealAppliedTemplate).not.toHaveBeenCalled();
  });

  it('does not reveal when the command fails', async () => {
    hoisted.apply.mockResolvedValue({ ok: false, error: { code: 'unavailable', message: 'boom' } });
    await mount();
    await click(q('[data-board-template-row="research"]'));
    await click(q('[data-board-template-apply]'));
    expect(revealAppliedTemplate).not.toHaveBeenCalled();
  });

  it('does not call onApplied when the command fails', async () => {
    const onApplied = vi.fn();
    hoisted.apply.mockResolvedValue({ ok: false, error: { code: 'unavailable', message: 'boom' } });
    await mount({ onApplied });
    await click(q('[data-board-template-row="project-plan"]'));
    await click(q('[data-board-template-apply]'));

    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe('BoardTemplatePicker placeholders (Timeline)', () => {
  it('shows the picker for a board with only a placeholder container', async () => {
    await mount({ layout: 'timeline', posts: [placeholderPost()] });
    expect(q('[data-board-template-picker]')).not.toBeNull();
  });

  it('hides the picker for a titled container', async () => {
    await mount({ layout: 'timeline', posts: [placeholderPost({ title: 'Entry' })] });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('hides the picker for a container with a child', async () => {
    await mount({
      layout: 'timeline',
      posts: [placeholderPost({ metadata: { isContainer: true, childPadletIds: ['child-1'] } })],
    });
    expect(q('[data-board-template-picker]')).toBeNull();
  });

  it('passes the placeholder ids as replacePostIds', async () => {
    await mount({ layout: 'timeline', posts: [placeholderPost()] });
    await click(q('[data-board-template-row="history-of-flight"]'));
    await click(q('[data-board-template-apply]'));
    expect(hoisted.apply.mock.calls[0][0]).toMatchObject({ replacePostIds: ['placeholder-1'] });
  });
});

describe('BoardTemplatePicker collapse to pill', () => {
  it('collapses to the pill on an outside press without dismissing', async () => {
    await mount();
    expect(q('[data-board-template-picker]')).not.toBeNull();

    await outsidePress();
    expect(q('[data-board-template-picker]')).toBeNull();
    expect(q('[data-board-template-pill]')).not.toBeNull();
    expect(q('[data-board-template-pill]')?.textContent).toContain('Templates');
    expect(window.localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it('reopens the panel from the pill', async () => {
    await mount();
    await outsidePress();
    await click(q('[data-board-template-pill]'));
    expect(q('[data-board-template-picker]')).not.toBeNull();
    expect(q('[data-board-template-pill]')).toBeNull();
  });

  it('stays open on an inside press', async () => {
    await mount();
    const panel = q('[data-board-template-picker]')!;
    await act(async () => {
      panel.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(q('[data-board-template-picker]')).not.toBeNull();
  });

  it('collapses on Escape', async () => {
    await mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(q('[data-board-template-pill]')).not.toBeNull();
    expect(q('[data-board-template-picker]')).toBeNull();
  });
});

describe('source invariants', () => {
  it('mounts BoardTemplatePicker exactly once in CanvasClient', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    expect(source.split('<BoardTemplatePicker').length - 1).toBe(1);
  });

  it('wires the picker\u2019s onApplied to fetchData so posts appear without a reload', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    const start = source.indexOf('<BoardTemplatePicker');
    const block = source.slice(start, source.indexOf('/>', start));
    expect(block).toContain('onApplied');
    expect(block).toContain('fetchData');
  });

  it('passes the board sections into the picker mount', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    const start = source.indexOf('<BoardTemplatePicker');
    const block = source.slice(start, source.indexOf('/>', start));
    expect(block).toContain('sections={sections}');
  });

  it('passes the posts into the picker mount instead of a count', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    const start = source.indexOf('<BoardTemplatePicker');
    const block = source.slice(start, source.indexOf('/>', start));
    expect(block).toContain('posts={padlets}');
    expect(block).not.toContain('postCount');
  });

  it('keeps the picker mount at seven lines (CanvasClient net growth 0)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    const start = source.indexOf('<BoardTemplatePicker');
    const block = source.slice(start, source.indexOf('/>', start));
    expect(block.split('\n').length).toBe(7);
  });

  it('opens Board AI from the picker mount when the template asks for it', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    const start = source.indexOf('<BoardTemplatePicker');
    const block = source.slice(start, source.indexOf('/>', start));
    expect(block).toContain('openBoardAiAfterApply');
    expect(block).toContain('toggleBoardAiChat');
    expect(block).toContain('isBoardAiChatOpen');
  });

  it('removes the Template 1 button from the dashboard', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/dashboard/page.tsx'), 'utf8');
    expect(source).not.toMatch(/Template 1/);
  });

  it('deletes the old template1 module', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/collabboard/templates/template1.ts'))).toBe(false);
  });
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('BoardTemplatePicker ?template= auto-apply (PATCH-301)', () => {
  const withParam = (value: string) => {
    window.history.replaceState({}, '', `/dashboard/canvas/${BOARD}?template=${value}&other=keep`);
  };

  it('applies once on an empty editable board and strips the param, keeping the others', async () => {
    withParam('project-plan');
    await mount();
    await settle();

    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(hoisted.apply.mock.calls[0][0]).toMatchObject({
      boardId: BOARD,
      template: expect.objectContaining({ id: 'project-plan' }),
    });
    expect(window.location.search).not.toContain('template');
    expect(window.location.search).toContain('other=keep');
    expect(q('[data-board-template-picker]')).toBeNull();
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it('never applies the same param twice', async () => {
    withParam('project-plan');
    await mount();
    await settle();
    await rerender({ posts: [realPost()] });
    await settle();
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
  });

  it('gives onApplied the auto-applied template', async () => {
    withParam('research');
    const onApplied = vi.fn();
    await mount({ onApplied });
    await settle();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied.mock.calls[0][0]).toMatchObject({ id: 'research', openBoardAiAfterApply: true });
  });

  it('reveals after an auto-applied freeform template', async () => {
    withParam('research');
    await mount();
    await settle();
    expect(revealAppliedTemplate).toHaveBeenCalledTimes(1);
  });

  it('ignores the param on a non-empty board but still strips it', async () => {
    withParam('project-plan');
    await mount({ posts: [realPost()] });
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('template');
  });

  it('ignores the param for a viewer', async () => {
    withParam('project-plan');
    await mount({ canEdit: false });
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
  });

  it('ignores an unknown id', async () => {
    withParam('nope');
    await mount();
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
  });

  it('ignores an id that belongs to another layout', async () => {
    withParam('birthday-wall');
    await mount({ layout: 'freeform' });
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
  });

  it('applies a template that belongs to the board layout', async () => {
    withParam('birthday-wall');
    await mount({ layout: 'wall' });
    await settle();
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(hoisted.apply.mock.calls[0][0]).toMatchObject({
      template: expect.objectContaining({ id: 'birthday-wall' }),
    });
  });
});

const PENDING_KEY = `board-template-request:${BOARD}`;

async function mountStrict(props: Partial<React.ComponentProps<typeof BoardTemplatePicker>> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <React.StrictMode>
        <BoardTemplatePicker
          boardId={BOARD}
          layout="freeform"
          posts={[]}
          postsLoaded
          canEdit
          {...props}
        />
      </React.StrictMode>,
    );
  });
  return host;
}

describe('BoardTemplatePicker ?template= under Strict Mode (PATCH-301 Addendum 1)', () => {
  const withParam = (value: string) => {
    window.history.replaceState({}, '', `/dashboard/canvas/${BOARD}?template=${value}&other=keep`);
  };

  it('applies exactly once inside React.StrictMode', async () => {
    withParam('project-plan');
    await mountStrict();
    await settle();
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(hoisted.apply.mock.calls[0][0]).toMatchObject({
      boardId: BOARD,
      template: expect.objectContaining({ id: 'project-plan' }),
    });
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('carries the request across an unmount/remount and applies exactly once', async () => {
    withParam('project-plan');
    await mount({ postsLoaded: false });
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
    expect(readBoardTemplateRequest(BOARD)).toEqual({ id: 'project-plan', state: 'pending' });

    act(() => root!.unmount());
    root = null;
    host.remove();

    await mount({ postsLoaded: true });
    await settle();
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('removes the pending key when a non-empty board ignores the request', async () => {
    withParam('project-plan');
    await mount({ posts: [realPost()] });
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('removes the pending key for a viewer', async () => {
    withParam('project-plan');
    await mount({ canEdit: false });
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('removes the pending key for an unknown id', async () => {
    withParam('nope');
    await mount();
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe('BoardTemplatePicker template request state machine (PATCH-301 Addendum 3)', () => {
  const withParam = (value: string) => {
    window.history.replaceState({}, '', `/dashboard/canvas/${BOARD}?template=${value}`);
  };

  it('moves pending → applying → removed across the apply', async () => {
    withParam('project-plan');
    const pending = deferred<{ ok: true; value: number }>();
    hoisted.apply.mockReturnValue(pending.promise);
    await mount();
    await settle();

    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(readBoardTemplateRequest(BOARD)).toEqual({ id: 'project-plan', state: 'applying' });

    await act(async () => {
      pending.resolve({ ok: true, value: 1 });
      await pending.promise;
    });
    expect(readBoardTemplateRequest(BOARD)).toBeNull();
  });

  it('removes the key when the apply fails', async () => {
    withParam('project-plan');
    hoisted.apply.mockResolvedValue({ ok: false, error: { code: 'unavailable', message: 'boom' } });
    await mount();
    await settle();
    expect(hoisted.apply).toHaveBeenCalledTimes(1);
    expect(readBoardTemplateRequest(BOARD)).toBeNull();
  });

  it('never applies a key that is already applying', async () => {
    window.sessionStorage.setItem(
      `board-template-request:${BOARD}`,
      JSON.stringify({ id: 'project-plan', state: 'applying' }),
    );
    await mount();
    await settle();
    expect(hoisted.apply).not.toHaveBeenCalled();
  });
});
