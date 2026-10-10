// @vitest-environment jsdom
//
// PATCH-340 Addendum 2. The note card's drag handler runs in the CAPTURE phase
// (the outer wrapper's onMouseDownCapture), so a bubble-phase stopPropagation
// on the chip cannot stop it. The chip must carry the canvas's own escape hatch
// `data-no-drag="true"`, so ONE mousedown+click opens the card and does not
// select or start dragging the post.
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
    get: (_target, property: string) => (property.startsWith('set') ? vi.fn() : null),
  }),
}));
vi.mock('@/lib/domain/canvas/posts', () => ({
  createUpdatePostFieldsCommand: () => persistence.update,
}));
vi.mock('@/lib/infra/canvas/postsRepository', () => ({ createPostsRepository: () => ({}) }));
vi.mock('@/components/collabboard/menus/NotePostContextMenu', () => ({
  NotePostContextMenu: ({ children }: { children: React.ReactNode }) => <div data-test-note-menu>{children}</div>,
}));
vi.mock('@/components/collabboard/PostCardContent', () => ({
  default: () => <div data-test-post-content />,
  KnowledgeSourceMarker: () => null,
}));

import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = vi.fn();
const stableActions = new Proxy({}, { get: () => vi.fn() }) as any;

function linkedNote(): Padlet {
  return {
    id: 'note-1',
    board_id: 'board-1',
    title: 'My note',
    content: 'body',
    type: 'text',
    position_x: 100,
    position_y: 100,
    width: 350,
    height: 300,
    created_at: '',
    updated_at: '',
    metadata: { kanbanLink: { boardId: 'kb', cardId: 'kc' } },
  } as unknown as Padlet;
}

/** Emulates the real capture-phase handler: it selects UNLESS the target is a
 *  `[data-no-drag="true"]` island (useCanvasInteractions.handlePadletMouseDown). */
function makeMouseDownHandler(onSelect: () => void) {
  return vi.fn((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    onSelect();
  });
}

function render(
  padlet: Padlet,
  props: {
    onOpenKanbanCard?: (link: { boardId: string; cardId: string }) => void;
    kanbanLinkStatus?: Map<string, { boardId: string; boardTitle: string; columnTitle: string; available: boolean }>;
    handlePadletMouseDown?: (e: React.MouseEvent, id: string) => void;
  } = {},
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => root.render(
    <FreeformPadletCards
      rootPadlets={[padlet]}
      padlets={[padlet]}
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
      handlePadletMouseDown={props.handlePadletMouseDown ?? noop}
      getClickedSide={noop}
      stableActions={stableActions}
      requestOpenDocument={noop}
      kanbanLinkStatus={props.kanbanLinkStatus}
      onOpenKanbanCard={props.onOpenKanbanCard}
    />,
  ));
  return { host, root };
}

function mouse(type: string) {
  return new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 });
}

afterEach(() => {
  document.body.replaceChildren();
  persistence.update.mockClear();
});

describe('PATCH-340 Addendum 2 note chip opens the card on one click', () => {
  it('one mousedown + click opens the card once and does not select the post', () => {
    const onSelect = vi.fn();
    const onOpenKanbanCard = vi.fn();
    const { host, root } = render(linkedNote(), {
      onOpenKanbanCard,
      handlePadletMouseDown: makeMouseDownHandler(onSelect),
    });

    const chip = host.querySelector<HTMLElement>('[data-kanban-link-chip="true"]')!;
    expect(chip).toBeTruthy();
    // The canvas's own escape hatch: without it the capture-phase drag handler
    // selects the post and the first click is swallowed.
    expect(chip.getAttribute('data-no-drag')).toBe('true');

    act(() => {
      chip.dispatchEvent(mouse('mousedown'));
      chip.dispatchEvent(mouse('click'));
    });

    expect(onOpenKanbanCard).toHaveBeenCalledTimes(1);
    expect(onOpenKanbanCard).toHaveBeenCalledWith({ boardId: 'kb', cardId: 'kc' });
    expect(onSelect).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('shows the live column title, and "Card not available" when the card is gone', () => {
    const status = new Map([
      ['kc', { boardId: 'kb', boardTitle: 'Roadmap', columnTitle: 'In progress', available: true }],
    ]);
    const live = render(linkedNote(), { onOpenKanbanCard: vi.fn(), kanbanLinkStatus: status });
    expect(live.host.querySelector('[data-kanban-link-chip="true"]')?.textContent).toContain('In progress');
    act(() => live.root.unmount());

    const goneStatus = new Map([
      ['kc', { boardId: 'kb', boardTitle: 'Roadmap', columnTitle: '', available: false }],
    ]);
    const gone = render(linkedNote(), { onOpenKanbanCard: vi.fn(), kanbanLinkStatus: goneStatus });
    const goneChip = gone.host.querySelector<HTMLElement>('[data-kanban-link-chip="true"]')!;
    expect(goneChip.textContent).toContain('Card not available');
    act(() => {
      goneChip.dispatchEvent(mouse('mousedown'));
      goneChip.dispatchEvent(mouse('click'));
    });
    expect(goneChip.getAttribute('title')).toBe('Card not available');
    act(() => gone.root.unmount());
  });
});
