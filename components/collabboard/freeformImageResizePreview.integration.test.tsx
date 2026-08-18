// @vitest-environment jsdom
// PATCH FREEFORM-IMAGE-R4: mounts the REAL, exported FreeformPadletCards
// (and, transitively, the real Image resize path) with local/mocked data
// only -- 0 Supabase/PostgREST, 0 live-data changes. Genuine pointer-event-
// driven coverage proving the actual defect this patch fixes: before R4,
// every Image pointermove called the parent's previewPostResize -> setPadlets,
// re-rendering the ENTIRE Freeform padlet list (measured directly in the
// PATCH FREEFORM-IMAGE-R3 diagnostic: 40 pointermoves -> 40 parent updates ->
// whole-list rerender each time). This suite proves the fix: pointermove
// updates ONLY the Image's own local preview state -- zero parent setPadlets
// calls, zero FreeformPadletCards re-renders -- until the single commit on
// release.
import React, { act } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';
import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';
import { CanvasConfigProvider } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';
import { CanvasEditorProvider, type CanvasEditorState } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { useStableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';

let mockPersistShouldFail = false;
vi.mock('@/lib/infra/canvas/postsRepository', () => ({
  createPostsRepository: () => ({
    updateFieldsById: vi.fn(async () => (
      mockPersistShouldFail
        ? { ok: false, error: { code: 'unknown', message: 'mocked persistence failure' } }
        : { ok: true, value: undefined }
    )),
  }),
}));
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let restoreOffsetSize: (() => void) | undefined;
beforeAll(() => {
  const originalW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const originalH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) { const w = parseFloat(this.style.width); return Number.isFinite(w) ? w : 360; },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) { const h = parseFloat(this.style.height); return Number.isFinite(h) ? h : 240; },
  });
  restoreOffsetSize = () => {
    if (originalW) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalW);
    if (originalH) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalH);
  };
  (globalThis as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
  Element.prototype.getBoundingClientRect = function () {
    const w = parseFloat((this as HTMLElement).style?.width) || 100;
    const h = parseFloat((this as HTMLElement).style?.height) || 30;
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON() {} } as DOMRect;
  };
});
afterAll(() => restoreOffsetSize?.());

function padlet(id: string, type: Padlet['type'], width: number, height: number, metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id, board_id: 'board-1', title: id, content: '{}', type,
    position_x: 100, position_y: 100,
    width, height, created_at: '', updated_at: '', metadata,
  };
}

const IMAGE_ID = 'image-1';
// A representative small board -- the Image being resized plus a few other
// post types -- so a per-pointermove whole-list rerender (the pre-R4 defect)
// would be observable via the parent Harness's own render count, not just
// theoretically inferred from the Image's own DOM.
function buildInitialPadlets(): Padlet[] {
  return [
    padlet(IMAGE_ID, 'image', 360, 240, { imageUrl: 'https://example.com/x.png', manualSize: true }),
    padlet('note-1', 'text', 200, 120),
    padlet('todo-1', 'todo', 200, 140),
    padlet('table-1', 'table', 240, 160),
  ];
}

const canvasEditorValue: CanvasEditorState = {
  padletToEdit: null, setPadletToEdit: () => {},
  setIsNoteEditorOpen: () => {}, setIsTableEditorOpen: () => {}, setIsLinkEditorOpen: () => {},
  setIsTodoEditorOpen: () => {}, setIsContainerEditorOpen: () => {}, setIsCommentEditorOpen: () => {},
  setIsImageEditorOpen: () => {}, setIsDrawingEditorOpen: () => {}, setIsCardEditorOpen: () => {},
  setIsCardViewerOpen: () => {}, setIsClipartDraftModalOpen: () => {}, setIsAIComponentEditorOpen: () => {},
  setIsAIContentEditModalOpen: () => {}, setIsAIContentConvertModalOpen: () => {},
  imageToolbarPadletId: null, setImageToolbarPadletId: () => {},
  isImageColorPickerOpen: false, setIsImageColorPickerOpen: () => {},
  isImageEmojiOpen: false, setIsImageEmojiOpen: () => {},
  imageColorTab: 'background', setImageColorTab: () => {},
  setCropPadlet: () => {}, setIsCropMode: () => {}, setDrawingPadlet: () => {}, setIsDrawingMode: () => {},
  editingCaption: '', setEditingCaption: () => {},
  captionPopupPadletId: null, setCaptionPopupPadletId: () => {},
  textStylePadletId: null, setTextStylePadletId: () => {},
  cardToolbarPadletId: null, setCardToolbarPadletId: () => {},
  isCardColorPickerOpen: false, setIsCardColorPickerOpen: () => {},
  cardColorTab: 'background', setCardColorTab: () => {},
  captionEditorPadletId: null, setCaptionEditorPadletId: () => {},
  setIsLibraryOpen: () => {}, setIconReplaceTargetPadlet: () => {},
  editingNoteTitleId: null, setEditingNoteTitleId: () => {},
  noteTitleDraft: '', setNoteTitleDraft: () => {},
  cardCommentPopupPadletId: null, setCardCommentPopupPadletId: () => {},
  cardCommentList: [], setCardCommentList: () => {},
  activeCardCommentId: null, setActiveCardCommentId: () => {},
  editingCardCommentId: null, setEditingCardCommentId: () => {},
  editingCardCommentText: '', setEditingCardCommentText: () => {},
  commentColorPopupId: null, setCommentColorPopupId: () => {},
  activeCardComment: null,
  noteBadgeColorPadletId: null, setNoteBadgeColorPadletId: () => {},
  internalBadgeColorPopupId: null, setInternalBadgeColorPopupId: () => {},
  internalBadgePopupPosition: null, setInternalBadgePopupPosition: () => {},
  setDetachedPopupPosition: () => {}, setDetachedPopupPadletId: () => {},
  setDetachedBadgeColorOpen: () => {}, setDetachedPopupComments: () => {}, setDetachedPopupOpen: () => {},
  collapsedPopupPadletId: null, setCollapsedPopupPadletId: () => {},
  collapsedBadgeColorOpen: false, setCollapsedBadgeColorOpen: () => {},
  collapsedActiveCommentId: null, setCollapsedActiveCommentId: () => {},
  collapsedEditingCommentId: null, setCollapsedEditingCommentId: () => {},
  collapsedEditingText: '', setCollapsedEditingText: () => {},
  collapsedCommentColorPopupId: null, setCollapsedCommentColorPopupId: () => {},
  setReminderPopupPosition: () => {}, setReminderPopupTasks: () => {},
  setReminderPopupPadletId: () => {}, setReminderPopupOpen: () => {},
  setShowDeleteConfirm: () => {}, setViewDrawingPadlet: () => {},
  setCommentPopupPosition: () => {}, setCommentPopupComments: () => {},
  setCommentPopupPadletId: () => {}, setCommentPopupCommentId: () => {}, setCommentPopupOpen: () => {},
  setCommentPopupHighlightColor: () => {},
  setTextLinkColorPickerPosition: () => {}, setTextLinkColorPickerOpen: () => {},
  commentPopupPosition: null, commentPopupHighlightColor: undefined,
};

function Harness({ onSetPadletsCall, onListRender, canUseFreeformEditButton = true }: {
  onSetPadletsCall: () => void;
  onListRender: () => void;
  canUseFreeformEditButton?: boolean;
}) {
  const [padlets, setPadletsRaw] = React.useState<Padlet[]>(buildInitialPadlets);
  const setPadlets = React.useCallback((updater: React.SetStateAction<Padlet[]>) => {
    onSetPadletsCall();
    setPadletsRaw(updater);
  }, [onSetPadletsCall]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stableActions = useStableCanvasActions({
    duplicatePadlet: () => {}, addPadletToLibrary: () => {}, requestDeletePadlet: () => {},
    cutPadlet: () => {}, copyPadlet: () => {}, lockPadlet: () => {}, movePadletLayer: () => {},
    groupIntoColumn: () => {}, replaceImage: () => {}, downloadImage: () => {}, toggleCropToGrid: () => {},
    handlePaste: () => {}, renameComment: () => {}, renameColumn: () => {}, renameTodo: () => {},
    createSyncedCopy: () => {}, addImageToLink: () => {}, copyLinkAddress: () => {}, deletePadletById: () => {},
    fetchData: () => {}, updatePadletMetadata: () => {}, updatePadletTitle: async () => {}, updatePadletContent: async () => {},
    commitPadletMeta: () => {},
  });
  React.useEffect(() => { onListRender(); });
  return (
    <CanvasConfigProvider value={{
      canvasZoom: 1, canvasId: 'board-1', isFreeformGraphMode: false,
      canUseFreeformEditButton, isColumnsLayout: false,
      worldOriginLeft: 0, worldOriginTop: 0,
    }}>
      <CanvasEditorProvider value={canvasEditorValue}>
        <div ref={containerRef}>
          <FreeformPadletCards
            rootPadlets={padlets}
            padlets={padlets}
            setPadlets={setPadlets}
            user={null}
            containerRef={containerRef}
            getWorldPointFromClient={(clientX, clientY) => ({ x: clientX, y: clientY })}
            isDragging={false}
            draggingPadletId={null}
            dragOverContainerId={null}
            isGraphConnectMode={false}
            isLineMode={false}
            isDrawingMode={false}
            selectedPadletId={IMAGE_ID}
            selectedPadletIds={[]}
            setSelectedPadletId={() => {}}
            setGraphConnectSelection={() => {}}
            graphRefreshToken={0}
            closeAllToolbars={() => {}}
            handlePadletMouseDown={() => {}}
            getClickedSide={() => 'right'}
            stableActions={stableActions}
            requestOpenDocument={() => {}}
          />
        </div>
      </CanvasEditorProvider>
    </CanvasConfigProvider>
  );
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
}

async function mountAndDrag(moveCount: number) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  let setPadletsCalls = 0;
  let listRenders = 0;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <Harness
        onSetPadletsCall={() => { setPadletsCalls++; }}
        onListRender={() => { listRenders++; }}
      />,
    );
  });
  // The initial mount itself is one "render" -- reset counters to isolate
  // exactly what the pointer sequence below causes.
  setPadletsCalls = 0;
  listRenders = 0;

  const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]');
  expect(handle, 'Image resize handle should be present when selected').not.toBeNull();
  const imageCard = handle!.previousElementSibling as HTMLElement;
  expect(imageCard, 'Image card should be the resize handle\'s preceding sibling').not.toBeNull();
  const widthsSeen: string[] = [];

  await act(async () => { handle!.dispatchEvent(pointerEvent('pointerdown', 300, 250)); });
  for (let i = 1; i <= moveCount; i++) {
    await act(async () => { handle!.dispatchEvent(pointerEvent('pointermove', 300 + i * 3, 250 + i)); });
    widthsSeen.push(imageCard.style.width);
  }
  const duringMoves = { setPadletsCalls, listRenders, widthsSeen };

  await act(async () => { handle!.dispatchEvent(pointerEvent('pointerup', 300 + moveCount * 3, 250 + moveCount)); });
  const afterCommit = { setPadletsCalls, listRenders, finalWidth: imageCard.style.width };

  return { host, root: root!, imageCard, duringMoves, afterCommit };
}

describe('PATCH FREEFORM-IMAGE-R4 Image resize preview is local, not whole-list', () => {
  it('40 pointermoves: zero parent setPadlets calls, zero FreeformPadletCards list rerenders, width visibly changes anyway', async () => {
    const { host, root, duringMoves, afterCommit } = await mountAndDrag(40);

    expect(duringMoves.setPadletsCalls, 'no parent setPadlets call during any pointermove').toBe(0);
    expect(duringMoves.listRenders, 'FreeformPadletCards (the whole padlet list) must not rerender during pointermove').toBe(0);
    // The DOM still visibly tracks the drag -- proving something IS
    // rendering the live preview, just not the parent list.
    expect(new Set(duringMoves.widthsSeen).size).toBeGreaterThan(1);
    expect(duringMoves.widthsSeen[duringMoves.widthsSeen.length - 1]).not.toBe(duringMoves.widthsSeen[0]);

    // Exactly one commit on release: commitPostResize's own optimistic
    // setPadlets fires once (the parent's padlets array now holds the
    // committed width/height) -- the mocked repository resolves successfully
    // so there is no rollback's second call.
    expect(afterCommit.setPadletsCalls, 'exactly one parent setPadlets call from the release commit').toBe(1);

    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });

  it('width AND height both change through the gesture (box mode, unchanged)', async () => {
    const { host, root, imageCard, afterCommit } = await mountAndDrag(10);
    expect(imageCard.style.height).not.toBe('');
    expect(afterCommit.finalWidth).not.toBe('360px');
    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });

  it('a zero-delta gesture (no-op) writes nothing: setPadlets is never called', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let root: Root;
    let setPadletsCalls = 0;
    await act(async () => {
      root = createRoot(host);
      root.render(<Harness onSetPadletsCall={() => { setPadletsCalls++; }} onListRender={() => {}} />);
    });
    setPadletsCalls = 0;
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;
    await act(async () => { handle.dispatchEvent(pointerEvent('pointerdown', 300, 250)); });
    await act(async () => { handle.dispatchEvent(pointerEvent('pointerup', 300, 250)); });
    expect(setPadletsCalls, 'a gesture that ends at its origin must write nothing').toBe(0);
    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });

  it('a failed commit rolls back the local preview to the original size', async () => {
    mockPersistShouldFail = true;
    try {
      const { host, root, imageCard, afterCommit } = await mountAndDrag(10);
      // Two setPadlets calls: commitPostResize's own optimistic write, then
      // its catch-block rollback -- both pre-existing, unchanged behavior.
      expect(afterCommit.setPadletsCalls).toBe(2);
      // The DOM ends up back at the pre-gesture size: the parent's rolled-
      // back padlets.width flows back down, and since the local preview was
      // already cleared to null (deferring to padlet.width/height) at
      // commit time, it automatically reflects the rollback -- no separate
      // local-rollback logic was needed.
      expect(imageCard.style.width).toBe('360px');
      await act(async () => { root.unmount(); });
      document.body.removeChild(host);
    } finally {
      mockPersistShouldFail = false;
    }
  });
});

describe('PATCH FREEFORM-IMAGE-PERMISSIONS the blue edit-selection ring and resize grip are gated on canUseFreeformEditButton, not selection state alone', () => {
  async function mountSelected(canUseFreeformEditButton: boolean) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let root: Root;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <Harness
          onSetPadletsCall={() => {}}
          onListRender={() => {}}
          canUseFreeformEditButton={canUseFreeformEditButton}
        />,
      );
    });
    return { host, root: root! };
  }

  it('edit-capable Image (selected): blue ring allowed and resize grip present', async () => {
    const { host, root } = await mountSelected(true);
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]');
    expect(handle, 'edit-capable + selected: resize handle must be present').not.toBeNull();
    const imageCard = handle!.previousElementSibling as HTMLElement;
    expect(imageCard.className).toContain('ring-2 ring-blue-500');
    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });

  it('read-only Image (selected): blue edit-selection ring does NOT activate', async () => {
    const { host, root } = await mountSelected(false);
    // No resize handle to anchor on when read-only, so locate the Image
    // card directly: it is the sole element carrying the manually-sized
    // image's background color/zIndex styling from FreeformImageResizeBox.
    const imageCard = host.querySelector<HTMLElement>('[data-post-resize-handle]')?.previousElementSibling
      ?? Array.from(host.querySelectorAll<HTMLElement>('div')).find((el) => el.style.width === '360px');
    expect(imageCard, 'Image card should still render (read-only viewing is not weakened)').toBeTruthy();
    expect(
      imageCard!.className,
      'read-only + selected must NOT render the blue edit-selection ring',
    ).not.toContain('ring-2 ring-blue-500');
    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });

  it('read-only Image (selected): resize handle count is 0', async () => {
    const { host, root } = await mountSelected(false);
    const handles = host.querySelectorAll('[data-post-resize-handle="true"]');
    expect(handles.length, 'read-only: zero resize handles regardless of selection').toBe(0);
    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });

  it('edit-capable Image resize gesture still works (permission gate did not weaken edit-capable behavior)', async () => {
    const { host, root, duringMoves, afterCommit } = await mountAndDrag(5);
    expect(new Set(duringMoves.widthsSeen).size).toBeGreaterThan(1);
    expect(afterCommit.finalWidth).not.toBe('360px');
    await act(async () => { root.unmount(); });
    document.body.removeChild(host);
  });
});
