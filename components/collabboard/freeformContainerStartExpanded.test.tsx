// @vitest-environment jsdom
// PATCH-293 Addendum 3. A container whose metadata.startExpanded is true starts
// expanded (its child list is not capped at 300px); toggling once collapses it;
// a container without the flag behaves exactly as before.
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';

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
  createUpdatePostFieldsCommand: () => vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/infra/canvas/postsRepository', () => ({ createPostsRepository: () => ({}) }));

vi.mock('@/components/collabboard/menus/ColumnPostContextMenu', () => ({
  ColumnPostContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/collabboard/menus/NotePostContextMenu', () => ({
  NotePostContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/collabboard/PostCardContent', () => ({
  default: () => <div data-test-post-content />,
  KnowledgeSourceMarker: () => null,
}));
vi.mock('@/components/collabboard/RowColumnContainerCard', async () => {
  const ReactModule = await import('react');
  return {
    default: ({
      isExpanded,
      onExpandAvailabilityChange,
    }: {
      isExpanded?: boolean;
      onExpandAvailabilityChange?: (available: boolean) => void;
    }) => {
      ReactModule.useEffect(() => {
        onExpandAvailabilityChange?.(true);
      }, [onExpandAvailabilityChange]);
      return ReactModule.createElement('div', {
        'data-test-container-content': 'true',
        'data-expanded': String(isExpanded === true),
      });
    },
  };
});

import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = vi.fn();
const stableActions = new Proxy({}, { get: () => vi.fn() }) as any;

function padlet(id: string, type: Padlet['type'], metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id,
    board_id: 'board-1',
    title: id,
    content: '',
    type,
    position_x: 100,
    position_y: 100,
    width: 360,
    height: 300,
    created_at: '',
    updated_at: '',
    metadata,
  };
}

function renderFreeform(rootPadlets: Padlet[], padlets = rootPadlets) {
  const host = document.createElement('div');
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
      selectedPadletId={null}
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

function containerFixtures(startExpanded: boolean) {
  const container = padlet('container', 'container', {
    isContainer: true,
    orientation: 'vertical',
    childPadletIds: ['child'],
    ...(startExpanded ? { startExpanded: true } : {}),
  });
  const child = padlet('child', 'text', { parentId: container.id });
  return { container, child };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Freeform container startExpanded (Addendum 3)', () => {
  it('passes isExpanded=true for a container whose metadata.startExpanded is true', () => {
    const { container, child } = containerFixtures(true);
    const { host, root } = renderFreeform([container], [container, child]);
    const content = host.querySelector('[data-test-container-content]')!;
    expect(content.getAttribute('data-expanded')).toBe('true');
    act(() => root.unmount());
  });

  it('collapses on one toggle (the default flips from startExpanded, not undefined)', () => {
    const { container, child } = containerFixtures(true);
    const { host, root } = renderFreeform([container], [container, child]);
    const collapse = host.querySelector('button[aria-label="Collapse"]') as HTMLButtonElement;
    expect(collapse).not.toBeNull();
    act(() => collapse.click());
    expect(host.querySelector('[data-test-container-content]')!.getAttribute('data-expanded')).toBe('false');
    expect(host.querySelector('button[aria-label="Expand"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it('leaves a container without the flag collapsed as before', () => {
    const { container, child } = containerFixtures(false);
    const { host, root } = renderFreeform([container], [container, child]);
    expect(host.querySelector('[data-test-container-content]')!.getAttribute('data-expanded')).toBe('false');
    act(() => root.unmount());
  });
});
