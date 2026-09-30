// @vitest-environment jsdom
//
// PATCH-227 -- the connect dot's drag interaction: dashed portalled preview,
// target outline, and exactly-one-write-on-a-valid-drop semantics.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreeformGraphEdge } from '@/types/graphTypes';
import { toast } from 'sonner';

import GraphConnectHandle from './GraphConnectHandle';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const upsertEdgeMock = vi.fn(async (edge: Partial<FreeformGraphEdge>) => edge as FreeformGraphEdge);
let mockEdges: FreeformGraphEdge[] = [];

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: () => ({
    getEdges: async () => mockEdges,
    upsertEdge: upsertEdgeMock,
  }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const toastMock = vi.mocked(toast);

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  upsertEdgeMock.mockClear();
  vi.clearAllMocks();
  mockEdges = [];
  document.querySelectorAll('[data-graph-connect-preview="true"]').forEach((n) => n.remove());
  document.body.querySelectorAll('[data-padlet-id]').forEach((n) => n.remove());
});

beforeEach(() => {
  (document as any).elementsFromPoint = vi.fn(() => []);
});

function postEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-padlet-id', id);
  // Attached so the component's `[data-padlet-id]` lookup for the outline finds
  // it, exactly as a real post on the board would be.
  document.body.appendChild(el);
  return el;
}

function render(props: Partial<React.ComponentProps<typeof GraphConnectHandle>> = {}) {
  return mount(
    <GraphConnectHandle
      boardId="board1"
      postId="postA"
      isTopLevel={(id) => id === 'postB'}
      {...props}
    />,
  );
}

function dotOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-graph-connect-handle="true"]') as HTMLElement;
}

function pointerDown(el: HTMLElement, x: number, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
}
function pointerMove(el: HTMLElement, x: number, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
}
async function pointerUp(el: HTMLElement, x: number, y: number) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

const preview = () => document.querySelector('[data-graph-connect-preview="true"]');
const outline = () => document.querySelector('[data-graph-connect-preview="true"] rect');

describe('PATCH-227 GraphConnectHandle', () => {
  it('drags to a valid post: one upsertEdge with the right ids/direction/style, and a portalled preview', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    const onEdgesChanged = vi.fn();
    const container = render({ onEdgesChanged });
    const dot = dotOf(container);

    pointerDown(dot, 0, 0);
    expect(preview(), 'preview is portalled during the drag').not.toBeNull();
    pointerMove(dot, 100, 100);
    expect(outline(), 'a valid target is outlined').not.toBeNull();
    await pointerUp(dot, 100, 100);

    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({
      board_id: 'board1',
      source_post_id: 'postA',
      target_post_id: 'postB',
      relation_type: 'solid',
      direction: 'forward',
      label: null,
      style: { color: '#9ca3af' },
    });
    expect(typeof (upsertEdgeMock.mock.calls[0][0] as FreeformGraphEdge).id).toBe('string');
    expect(onEdgesChanged).toHaveBeenCalledTimes(1);
    expect(preview(), 'preview removed after the drop').toBeNull();
  });

  it('a drop on empty board writes nothing', async () => {
    (document as any).elementsFromPoint = vi.fn(() => []);
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    expect(outline()).toBeNull();
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });

  it('a drop on the source writes nothing', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postA')]);
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });

  it('an already-connected pair writes nothing and says so', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    mockEdges = [{
      id: 'e1', board_id: 'board1', source_post_id: 'postB', target_post_id: 'postA',
      relation_type: 'solid', direction: 'forward', label: null, style: null,
      created_at: '', updated_at: '',
    } as FreeformGraphEdge];
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('These posts are already connected.');
  });

  it('Escape during the drag cancels, and the preview is removed', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    expect(preview()).not.toBeNull();

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(preview()).toBeNull();

    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });
});
