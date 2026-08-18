// @vitest-environment jsdom
// PATCH FREEFORM-PRIVILEGE-BATCH: mounts the REAL, exported FreeformPadletCards
// with local/mocked data only -- 0 Supabase/PostgREST, 0 live-data changes.
// Proves the shared "Generic Post" branch's blue edit-selection ring
// (FreeformPadletCards.tsx, the `content` div rendered for every type not
// in ['image', 'card', 'comment', 'Comment']) is gated on
// canUseFreeformEditButton, not selection state alone -- exactly like the
// PATCH FREEFORM-IMAGE-PERMISSIONS fix already proven for Image. Table and
// Container are mounted as representatives of the SAME shared branch/ring
// condition also used by Note, Todo, Link and AI-component (all read the
// identical `isPadletSelected(padlet.id) && canUseFreeformEditButton`
// condition at the same source line), plus Container's own distinct
// resize-handle branch.
import React, { act } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';
import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';
import { CanvasConfigProvider } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';
import { CanvasEditorProvider, type CanvasEditorState } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { useStableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';

vi.mock('@/lib/infra/canvas/postsRepository', () => ({
  createPostsRepository: () => ({
    updateFieldsById: vi.fn(async () => ({ ok: true, value: undefined })),
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
    get(this: HTMLElement) { const w = parseFloat(this.style.width); return Number.isFinite(w) ? w : 200; },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) { const h = parseFloat(this.style.height); return Number.isFinite(h) ? h : 150; },
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

function buildPadlets(targetType: Padlet['type'], metadata: Padlet['metadata'] = {}): Padlet[] {
  return [
    padlet('target-1', targetType, 200, 150, metadata),
  ];
}

function Harness({ targetType, canUseFreeformEditButton, metadata }: {
  targetType: Padlet['type'];
  canUseFreeformEditButton: boolean;
  metadata?: Padlet['metadata'];
}) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(() => buildPadlets(targetType, metadata));
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
            selectedPadletId="target-1"
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

async function mount(targetType: Padlet['type'], canUseFreeformEditButton: boolean, metadata?: Padlet['metadata']) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => {
    root = createRoot(host);
    root.render(<Harness targetType={targetType} canUseFreeformEditButton={canUseFreeformEditButton} metadata={metadata} />);
  });
  return { host, root: root! };
}

async function unmount(host: HTMLElement, root: Root) {
  await act(async () => { root.unmount(); });
  document.body.removeChild(host);
}

describe.each([
  ['table', 'horizontal-only shared branch (also covers Note/Todo/Link, same source condition)'],
  ['container', 'own resize-handle branch, same shared ring condition'],
] as const)('PATCH FREEFORM-PRIVILEGE-BATCH shared generic ring permission (%s: %s)', (targetType: Padlet['type'], _description: string) => {
  it('edit-capable, selected: blue ring present', async () => {
    const { host, root } = await mount(targetType, true);
    const card = host.querySelector<HTMLElement>('.group\\/image-container');
    expect(card, 'target card should render').not.toBeNull();
    expect(card!.className).toContain('ring-2 ring-blue-500');
    await unmount(host, root);
  });

  it('read-only, selected: blue ring absent, resize grip count = 0', async () => {
    const { host, root } = await mount(targetType, false);
    const card = host.querySelector<HTMLElement>('.group\\/image-container');
    expect(card, 'target card should still render (read-only viewing not weakened)').not.toBeNull();
    expect(card!.className).not.toContain('ring-2 ring-blue-500');
    const handles = host.querySelectorAll('[data-post-resize-handle="true"]');
    expect(handles.length).toBe(0);
    await unmount(host, root);
  });
});

describe('PATCH FREEFORM-PRIVILEGE-BATCH Clipart/Document (card type) ring permission', () => {
  it('edit-capable, selected: blue ring present', async () => {
    const { host, root } = await mount('card', true);
    const card = host.querySelector<HTMLElement>('[data-radix-context-menu-trigger], .absolute.group.cursor-pointer');
    // Fall back: locate by inline width/height style unique to the Card branch.
    const target = card ?? Array.from(host.querySelectorAll<HTMLElement>('div')).find((el) => el.style.width === '200px' && el.style.height === '150px');
    expect(target, 'Card/Clipart target should render').toBeTruthy();
    expect(target!.className).toContain('ring-2 ring-blue-500');
    await unmount(host, root);
  });

  it('read-only, selected: blue ring absent, resize grip count = 0', async () => {
    const { host, root } = await mount('card', false);
    const target = Array.from(host.querySelectorAll<HTMLElement>('div')).find((el) => el.style.width === '200px' && el.style.height === '150px');
    expect(target, 'Card/Clipart target should still render').toBeTruthy();
    expect(target!.className).not.toContain('ring-2 ring-blue-500');
    const handles = host.querySelectorAll('[data-post-resize-handle="true"]');
    expect(handles.length).toBe(0);
    await unmount(host, root);
  });
});

describe('PATCH FREEFORM-COMMENT-PRIVILEGE collapsed standalone Comment marker ring permission', () => {
  // The collapsed marker (padlet.metadata.isCollapsed) has no resize handle
  // at all -- only the blue ring itself is privileged edit UI here.
  function collapsedMarker(host: HTMLElement): HTMLElement | undefined {
    return Array.from(host.querySelectorAll<HTMLElement>('.hover\\:scale-110'))
      .find((el) => el.className.includes('flex-col items-center'));
  }

  it('edit-capable Comment selected: blue ring visible', async () => {
    const { host, root } = await mount('comment', true, { isCollapsed: true });
    const marker = collapsedMarker(host);
    expect(marker, 'collapsed Comment marker should render').toBeTruthy();
    expect(marker!.className).toContain('ring-2 ring-blue-500');
    await unmount(host, root);
  });

  it('read-only Comment selected: blue ring absent', async () => {
    const { host, root } = await mount('comment', false, { isCollapsed: true });
    const marker = collapsedMarker(host);
    expect(marker, 'collapsed Comment marker should still render (viewing not weakened)').toBeTruthy();
    expect(marker!.className).not.toContain('ring-2 ring-blue-500');
    await unmount(host, root);
  });

  it('normal Comment viewing/expansion unchanged: marker renders and remains clickable in both permission states', async () => {
    for (const canUseFreeformEditButton of [true, false]) {
      const { host, root } = await mount('comment', canUseFreeformEditButton, { isCollapsed: true });
      const marker = collapsedMarker(host);
      expect(marker).toBeTruthy();
      // onClick is untouched by this patch -- it must not throw regardless
      // of permission (selection/expansion behavior is out of scope here).
      expect(() => marker!.click()).not.toThrow();
      await unmount(host, root);
    }
  });
});
