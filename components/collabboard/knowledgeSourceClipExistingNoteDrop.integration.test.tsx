// @vitest-environment jsdom
/**
 * KNI-R2. CanvasClient owns parsing, target-type validation and the write
 * order for a Knowledge clip dropped onto an EXISTING Note (pinned as source
 * invariants in knowledgeSourceNoteWiring.source.test.ts, since that logic
 * sits inside a 9k-line controller no render test can mount). Freeform and
 * Drawing are event adapters only -- this proves their REAL, EXPORTED DOM
 * wiring: an eligible ordinary Note card (text/legacy note) forwards the
 * drop to CanvasClient's handler and, when that handler claims it
 * (stopPropagation), the outer canvas-level drop handler never sees the same
 * gesture -- so one gesture cannot create a second Note. An ineligible card
 * (Todo, standing in for every other post type) never attaches the listener
 * at all and lets the gesture bubble untouched.
 */
import React, { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';
import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';
import { DrawingEmbeddableCard } from '@/components/collabboard/canvas/layouts/DrawingLayout';
import { CanvasConfigProvider } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';
import { CanvasEditorProvider, type CanvasEditorState } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { useStableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';
import { KNOWLEDGE_SOURCE_CLIP_MIME, parseKnowledgeSourceClipPayload } from '@/lib/domain/knowledge/knowledgeSourceClipPayload';

vi.mock('@/lib/infra/canvas/postsRepository', () => ({
  createPostsRepository: () => ({ updateFieldsById: vi.fn(async () => ({ ok: true, value: undefined })) }),
}));
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_CLIP = {
  kind: 'text', sourceDocumentId: 'doc-1', originalFilename: 'a.pdf',
  pageNumber: 1, charStart: 0, charEnd: 5, selectedText: 'alpha',
};

function dataTransferWithClip(payload: object | null) {
  const store = new Map<string, string>([['text/plain', 'plain text rides along every drag']]);
  if (payload) store.set(KNOWLEDGE_SOURCE_CLIP_MIME, JSON.stringify(payload));
  return { getData: (type: string) => store.get(type) ?? '', types: [...store.keys()] };
}

function dispatchDrop(element: Element, dataTransfer: unknown) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  act(() => { element.dispatchEvent(event); });
}

/** Mirrors CanvasClient's real contract: parse -> claim -> validate target type. */
function stubExistingNoteHandler(calls: Padlet[]) {
  return (event: React.DragEvent, targetPadlet: Padlet): boolean => {
    const payload = parseKnowledgeSourceClipPayload(event.dataTransfer.getData(KNOWLEDGE_SOURCE_CLIP_MIME));
    if (!payload) return false;
    event.stopPropagation();
    if (targetPadlet.type !== 'text' && targetPadlet.type !== 'note') return true;
    calls.push(targetPadlet);
    return true;
  };
}

function padlet(id: string, type: Padlet['type']): Padlet {
  return {
    id, board_id: 'board-1', title: id, content: '<p>existing</p>', type,
    position_x: 0, position_y: 0, width: 200, height: 150, created_at: '', updated_at: '', metadata: {},
  };
}

const canvasEditorValue = {
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
} as unknown as CanvasEditorState;

function FreeformHarness({ targetType, onDrop, onOuterDrop }: {
  targetType: Padlet['type']; onDrop: (e: React.DragEvent, p: Padlet) => boolean; onOuterDrop: () => void;
}) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(() => [padlet('target-1', targetType)]);
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
    <CanvasConfigProvider value={{ canvasZoom: 1, canvasId: 'board-1', isFreeformGraphMode: false, canUseFreeformEditButton: true, isColumnsLayout: false, worldOriginLeft: 0, worldOriginTop: 0 }}>
      <CanvasEditorProvider value={canvasEditorValue}>
        <div ref={containerRef} onDrop={onOuterDrop}>
          <FreeformPadletCards
            rootPadlets={padlets} padlets={padlets} setPadlets={setPadlets} user={null} containerRef={containerRef}
            getWorldPointFromClient={(x, y) => ({ x, y })} isDragging={false} draggingPadletId={null}
            dragOverContainerId={null} isGraphConnectMode={false} isLineMode={false} isDrawingMode={false}
            selectedPadletId={null} selectedPadletIds={[]} setSelectedPadletId={() => {}}
            setGraphConnectSelection={() => {}} graphRefreshToken={0} closeAllToolbars={() => {}}
            handlePadletMouseDown={() => {}} getClickedSide={() => 'right'} stableActions={stableActions}
            requestOpenDocument={() => {}} onKnowledgeSourceClipDropOnNote={onDrop}
          />
        </div>
      </CanvasEditorProvider>
    </CanvasConfigProvider>
  );
}

function DrawingHarness({ targetType, onDrop, onOuterDrop }: {
  targetType: Padlet['type']; onDrop: (e: React.DragEvent, p: Padlet) => boolean; onOuterDrop: () => void;
}) {
  const p = padlet('target-1', targetType);
  return (
    <div onDrop={onOuterDrop}>
      <DrawingEmbeddableCard
        padlet={p} allPadlets={[p]} readOnly={false}
        excalidrawAPIRef={{ current: null }} appStateRef={{ current: null }}
        onUpdatePadlet={async () => {}} onUpdatePadletStrict={async () => {}} onAddPadlet={async () => null}
        canvasId="board-1" onUpdateChildComments={() => {}} onContextMenu={() => {}}
        onPadletEditRef={{ current: undefined }} onKnowledgeSourceClipDropOnNote={onDrop}
      />
    </div>
  );
}

async function mount(node: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  await act(async () => { root = createRoot(host); root.render(node); });
  return { host, root: root! };
}

async function unmount(host: HTMLElement, root: Root) {
  await act(async () => { root.unmount(); });
  document.body.removeChild(host);
}

describe.each([
  ['Freeform', (props: Parameters<typeof FreeformHarness>[0]) => <FreeformHarness {...props} />],
  ['Drawing', (props: Parameters<typeof DrawingHarness>[0]) => <DrawingHarness {...props} />],
] as const)('KNI-R2 %s existing-Note source clip drop', (_label, Harness) => {
  it('an eligible text Note claims a valid dedicated clip -- the outer handler never sees it', async () => {
    const calls: Padlet[] = [];
    const outerDrop = vi.fn();
    const { host, root } = await mount(<Harness targetType="text" onDrop={stubExistingNoteHandler(calls)} onOuterDrop={outerDrop} />);
    dispatchDrop(host.querySelector('[data-padlet-id="target-1"]')!, dataTransferWithClip(VALID_CLIP));
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('target-1');
    expect(outerDrop).not.toHaveBeenCalled();
    await unmount(host, root);
  });

  it('a legacy note-type Note also claims the clip', async () => {
    const calls: Padlet[] = [];
    const { host, root } = await mount(<Harness targetType="note" onDrop={stubExistingNoteHandler(calls)} onOuterDrop={() => {}} />);
    dispatchDrop(host.querySelector('[data-padlet-id="target-1"]')!, dataTransferWithClip(VALID_CLIP));
    expect(calls).toHaveLength(1);
    await unmount(host, root);
  });

  it('a foreign/malformed payload (no dedicated MIME) is not claimed -- it bubbles normally', async () => {
    const calls: Padlet[] = [];
    const outerDrop = vi.fn();
    const { host, root } = await mount(<Harness targetType="text" onDrop={stubExistingNoteHandler(calls)} onOuterDrop={outerDrop} />);
    dispatchDrop(host.querySelector('[data-padlet-id="target-1"]')!, dataTransferWithClip(null));
    expect(calls).toHaveLength(0);
    expect(outerDrop).toHaveBeenCalledTimes(1);
    await unmount(host, root);
  });

  it('an ineligible target type (Todo) never attaches the listener -- the gesture bubbles untouched', async () => {
    const calls: Padlet[] = [];
    const outerDrop = vi.fn();
    const { host, root } = await mount(<Harness targetType="todo" onDrop={stubExistingNoteHandler(calls)} onOuterDrop={outerDrop} />);
    dispatchDrop(host.querySelector('[data-padlet-id="target-1"]')!, dataTransferWithClip(VALID_CLIP));
    expect(calls).toHaveLength(0);
    expect(outerDrop).toHaveBeenCalledTimes(1);
    await unmount(host, root);
  });
});
