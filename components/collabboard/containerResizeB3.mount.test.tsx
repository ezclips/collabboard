// @vitest-environment jsdom
// PATCH POST-RESIZE-B3.1.1 -- mounted Freeform Container handle regression.
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';

const persistence = vi.hoisted(() => ({ update: vi.fn(async () => ({ ok: true })) }));

vi.mock('@/components/collabboard/canvas/contexts/CanvasConfigContext', () => ({
  useCanvasConfig: () => ({
    canvasZoom: 1,
    canvasId: 'board-1',
    isFreeformGraphMode: false,
    canUseFreeformEditButton: true,
    isColumnsLayout: false,
    worldOriginLeft: 0,
    worldOriginTop: 0,
  }),
}));

vi.mock('@/components/collabboard/canvas/contexts/CanvasEditorContext', () => ({
  useCanvasEditor: () => new Proxy({}, {
    get: (_target, property: string) => property.startsWith('set') ? vi.fn() : null,
  }),
}));

vi.mock('@/lib/domain/canvas/posts', () => ({
  createUpdatePostFieldsCommand: () => persistence.update,
}));
vi.mock('@/lib/infra/canvas/postsRepository', () => ({ createPostsRepository: () => ({}) }));

vi.mock('@/components/collabboard/menus/ColumnPostContextMenu', () => ({
  ColumnPostContextMenu: ({ children }: { children: React.ReactNode }) => <div data-test-column-menu>{children}</div>,
}));
vi.mock('@/components/collabboard/menus/NotePostContextMenu', () => ({
  NotePostContextMenu: ({ children }: { children: React.ReactNode }) => <div data-test-note-menu>{children}</div>,
}));
vi.mock('@/components/collabboard/RowColumnContainerCard', () => ({
  default: () => <div data-test-container-content />,
}));
vi.mock('@/components/collabboard/PostCardContent', () => ({
  default: () => <div data-test-post-content />,
  // P6J-F6-B2H: the freeform generic/Note branch now imports this named export
  // directly. Rendering nothing keeps this suite's handle counts unchanged.
  KnowledgeSourceMarker: () => null,
}));

import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = vi.fn();
const stableActions = new Proxy({}, { get: () => vi.fn() }) as any;
const editorHost = document.createElement('div');

function padlet(id: string, type: Padlet['type'], metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id,
    board_id: 'board-1',
    title: id,
    content: 'content',
    type,
    position_x: 100,
    position_y: 100,
    width: 350,
    height: 300,
    created_at: '',
    updated_at: '',
    metadata,
  };
}

function renderFreeform(rootPadlets: Padlet[], padlets = rootPadlets, selectedPadletId: string | null = null) {
  const host = editorHost.cloneNode(false) as HTMLDivElement;
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => root.render(
    <FreeformPadletCards
      rootPadlets={rootPadlets}
      padlets={padlets}
      setPadlets={vi.fn()}
      user={null}
      containerRef={{ current: document.createElement('div') }}
      getWorldPointFromClient={(x, y) => ({ x, y })}
      isDragging={false}
      draggingPadletId={null}
      dragOverContainerId={null}
      isGraphConnectMode={false}
      isLineMode={false}
      isDrawingMode={false}
      selectedPadletId={selectedPadletId}
      selectedPadletIds={[]}
      setSelectedPadletId={noop}
      setGraphConnectSelection={noop}
      graphRefreshToken={0}
      closeAllToolbars={noop}
      handlePadletMouseDown={noop}
      getClickedSide={noop}
      stableActions={stableActions}
      requestOpenDocument={noop}
    />,
  ));
  return { host, root };
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: 1 },
    button: { value: 0 },
    shiftKey: { value: false },
  });
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
  persistence.update.mockClear();
});

describe('PATCH POST-RESIZE-B3.1.1 mounted handle ownership', () => {
  it('selected root Container mounts exactly one dedicated handle through the real Container branch', () => {
    const container = padlet('container', 'container', { orientation: 'vertical', childPadletIds: [] });
    const { root, host } = renderFreeform([container], [container], container.id);
    expect(host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(1);
    act(() => root.unmount());
  });

  it('unselected root Container mounts zero handles', () => {
    const container = padlet('container', 'container');
    const { root, host } = renderFreeform([container], [container], null);
    expect(host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(0);
    act(() => root.unmount());
  });

  it('root Note mounts one handle while a Container child Note mounts zero', () => {
    const note = padlet('note', 'text');
    const rootNote = renderFreeform([note], [note], note.id);
    expect(rootNote.host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(1);
    act(() => rootNote.root.unmount());

    const container = padlet('container', 'container', { childPadletIds: ['child'] });
    const child = padlet('child', 'text', { parentId: container.id });
    const childFixture = renderFreeform([container], [container, child], container.id);
    expect(childFixture.host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(1);
    act(() => childFixture.root.unmount());
  });

  it('the mounted handle is hittable and one gesture performs one width-only persistence', () => {
    const container = padlet('container', 'container', { orientation: 'horizontal', childPadletIds: [] });
    const { root, host } = renderFreeform([container], [container], container.id);
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;
    expect(handle).toBeTruthy();
    expect(handle.querySelector('svg')).toBeTruthy();

    act(() => {
      handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
      handle.dispatchEvent(pointerEvent('pointermove', 25, 100));
      handle.dispatchEvent(pointerEvent('pointerup', 25, 100));
    });

    expect(persistence.update).toHaveBeenCalledTimes(1);
    const fields = (persistence.update as any).mock.calls[0][0].fields;
    expect(fields).toEqual(expect.objectContaining({ width: 385 }));
    expect(fields).not.toHaveProperty('height');
    expect(fields).not.toHaveProperty('metadata');
    act(() => root.unmount());
  });
});
