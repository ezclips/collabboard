// @vitest-environment jsdom
//
// PATCH-198. The "Add a transcript" dialog reports its open state up, so the
// board's ONE blocking-modal flag can cover it and the docked surfaces step
// aside. Mounts the REAL FreeformPadletCards through the same harness the ring
// permission tests use.
import React, { act } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';
import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';
import { CanvasConfigProvider } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';
import { CanvasEditorProvider, type CanvasEditorState } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { useStableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';

vi.mock('@/lib/infra/canvas/postsRepository', () => ({
  createPostsRepository: () => ({ updateFieldsById: vi.fn(async () => ({ ok: true, value: undefined })) }),
}));
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
// The menu item only appears once the transcript index is LOADED; load it empty.
vi.mock('@/components/collabboard/useBoardTranscriptIndex', () => ({
  useBoardTranscriptIndex: () => ({ loaded: true, entries: [], refresh: () => {} }),
}));
// A media link post mounts a video player, and `react-player`'s dynamic import
// of its YouTube player fails under jsdom. A stub keeps the card rendering so
// the context menu (and thus "Add transcript") is reachable.
vi.mock('react-player', () => ({ default: () => null }));
// A stable, portal-free stand-in for the Radix context menu, so the test can
// reach the SAME `onAddTranscript` the real menu wires (FreeformPadletCards
// ~4608). The product path under test -- startTranscriptForPost -> the dialog's
// open state -> the callback -- is unchanged; only the menu chrome is faked.
vi.mock('@/components/collabboard/menus/LinkPostContextMenu', () => ({
  LinkPostContextMenu: ({ children, onAddTranscript }: { children: React.ReactNode; onAddTranscript?: () => void }) => (
    <div>
      {children}
      {onAddTranscript ? (
        <button type="button" data-test-add-transcript="true" onClick={onAddTranscript}>
          Add transcript
        </button>
      ) : null}
    </div>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let restoreOffsetSize: (() => void) | undefined;
beforeAll(() => {
  const originalW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const originalH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true, get(this: HTMLElement) { const w = parseFloat(this.style.width); return Number.isFinite(w) ? w : 200; },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true, get(this: HTMLElement) { const h = parseFloat(this.style.height); return Number.isFinite(h) ? h : 150; },
  });
  restoreOffsetSize = () => {
    if (originalW) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalW);
    if (originalH) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalH);
  };
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.getBoundingClientRect = function () {
    const w = parseFloat((this as HTMLElement).style?.width) || 100;
    const h = parseFloat((this as HTMLElement).style?.height) || 30;
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON() {} } as DOMRect;
  };
});
afterAll(() => restoreOffsetSize?.());

function padlet(id: string, type: Padlet['type'], metadata: Padlet['metadata'] = {}): Padlet {
  return { id, board_id: 'board-1', title: id, content: '{}', type, position_x: 100, position_y: 100, width: 200, height: 150, created_at: '', updated_at: '', metadata };
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

function Harness({ onTranscriptDialogOpenChange }: { onTranscriptDialogOpenChange: (open: boolean) => void }) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(() => [
    padlet('media-1', 'link', { linkUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', linkTitle: 'A video' }),
  ]);
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
  return (
    <CanvasConfigProvider value={{
      canvasZoom: 1, canvasId: 'board-1', isFreeformGraphMode: false,
      canUseFreeformEditButton: true, isColumnsLayout: false, worldOriginLeft: 0, worldOriginTop: 0,
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
            selectedPadletId="media-1"
            selectedPadletIds={[]}
            setSelectedPadletId={() => {}}
            setGraphConnectSelection={() => {}}
            graphRefreshToken={0}
            closeAllToolbars={() => {}}
            handlePadletMouseDown={() => {}}
            getClickedSide={() => 'right'}
            stableActions={stableActions}
            requestOpenDocument={() => {}}
            onTranscriptDialogOpenChange={onTranscriptDialogOpenChange}
          />
        </div>
      </CanvasEditorProvider>
    </CanvasConfigProvider>
  );
}

async function mount(onTranscriptDialogOpenChange: (open: boolean) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<Harness onTranscriptDialogOpenChange={onTranscriptDialogOpenChange} />);
  });
  return { host, root: root! };
}

/** Opens the media post's context menu and clicks "Add transcript". */
async function openTranscriptDialog(host: HTMLElement) {
  // The stubbed menu renders this button only when FreeformPadletCards supplied
  // onAddTranscript, which is the REAL wiring that opens the dialog.
  const item = host.querySelector<HTMLElement>('[data-test-add-transcript="true"]');
  expect(item, 'the "Add transcript" action should be offered').toBeTruthy();
  await act(async () => {
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

describe('PATCH-198 the transcript dialog reports its open state', () => {
  it('opening the dialog calls the callback with true', async () => {
    const onChange = vi.fn();
    const { host, root } = await mount(onChange);

    await openTranscriptDialog(host);
    await act(async () => { await Promise.resolve(); });

    // The dialog is mounted, and the board was told.
    expect(host.querySelector('[role="dialog"][aria-label="Add a transcript"]')).not.toBeNull();
    expect(onChange).toHaveBeenCalledWith(true);

    await act(async () => { root.unmount(); });
    host.remove();
  });

  it('closing the dialog calls the callback with false', async () => {
    const onChange = vi.fn();
    const { host, root } = await mount(onChange);
    await openTranscriptDialog(host);
    await act(async () => { await Promise.resolve(); });
    expect(onChange).toHaveBeenLastCalledWith(true);

    // Close it: the dialog's own close control.
    const close = host.querySelector<HTMLElement>('button[aria-label="Close"]');
    expect(close, 'the dialog should offer a close control').toBeTruthy();
    await act(async () => { close!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => { root.unmount(); });
    host.remove();
  });

  it('unmounting while open calls the callback with false', async () => {
    const onChange = vi.fn();
    const { host, root } = await mount(onChange);
    await openTranscriptDialog(host);
    await act(async () => { await Promise.resolve(); });
    expect(onChange).toHaveBeenLastCalledWith(true);

    await act(async () => { root.unmount(); });
    // The release: a layout switch must not leave the board stuck "blocked".
    expect(onChange).toHaveBeenLastCalledWith(false);

    host.remove();
  });
});
