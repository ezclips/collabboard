// @vitest-environment jsdom
//
// PATCH-279. `handleEditAsDrawing` awaits `createDrawingPost`; on a rejection it
// shows a sonner error and logs with console.error (no data payloads), and the
// AI modal is already closed. Nothing else throws.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CanvasModals from '@/components/collabboard/canvas/ui/CanvasModals';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// All editor children are stubbed; the only one this patch touches is the AI
// generator, which exposes its onEditAsDrawing through a click handler.
vi.mock('@/components/collabboard/editors/AIComponentEditor', () => ({
  default: ({ isOpen, onEditAsDrawing }: any) =>
    isOpen && onEditAsDrawing
      ? React.createElement('button', {
          'data-testid': 'ai-edit-as-drawing',
          onClick: () => onEditAsDrawing({ drawingData: 'D', size: { width: 500, height: 300 } }),
        })
      : null,
}));
vi.mock('@/components/collabboard/editors/NoteEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/DocumentEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/LinkEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/TableEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/TodoEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/ContainerEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/CommentEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/ImageEditor', () => ({ default: () => null }));
vi.mock('@/components/collabboard/editors/DrawingEditor', () => ({ default: () => null }));
vi.mock('@/components/ai/editors/AIContentEditModal', () => ({ default: () => null }));
vi.mock('@/components/ai/editors/AIContentConvertModal', () => ({ default: () => null }));

import { toast } from 'sonner';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.mocked(toast.error).mockClear();
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    isNoteEditorOpen: false, setIsNoteEditorOpen: () => {},
    isLinkEditorOpen: false, setIsLinkEditorOpen: () => {},
    isTableEditorOpen: false, setIsTableEditorOpen: () => {},
    isTodoEditorOpen: false, setIsTodoEditorOpen: () => {},
    isContainerEditorOpen: false, setIsContainerEditorOpen: () => {},
    isCommentEditorOpen: false, setIsCommentEditorOpen: () => {},
    isImageEditorOpen: false, setIsImageEditorOpen: () => {},
    isDrawingEditorOpen: false, setIsDrawingEditorOpen: () => {},
    isAIComponentEditorOpen: true, setIsAIComponentEditorOpen: () => {},
    isAIContentEditModalOpen: false, setIsAIContentEditModalOpen: () => {},
    isAIContentConvertModalOpen: false, setIsAIContentConvertModalOpen: () => {},
    documentModalDestination: null, setDocumentModalDestination: () => {},
    padletToEdit: null, setPadletToEdit: () => {},
    padlets: [], setPadlets: () => {},
    selectedPadletId: null,
    viewDrawingPadlet: null, setViewDrawingPadlet: () => {},
    imageEditorTab: 'image',
    user: null, canvasLayout: undefined, canvasId: 'board-1',
    saveNote: () => {}, saveLink: () => {}, saveTable: () => {}, saveTodo: () => {},
    saveContainer: () => {}, saveComment: () => {}, saveImage: () => {}, saveDrawing: () => {},
    saveAIComponent: () => {}, saveCard: async () => ({ status: 'saved' }),
    createDrawingPost: vi.fn(async () => ({ id: 'd1' })),
    closeAllToolbars: () => {}, openPadletInTypeEditor: () => {},
    handleDetachChildFromFreeformContainer: () => {}, handleDeleteChildFromContainer: () => {},
    fetchData: () => {}, updatePadletById: async () => {},
    ...overrides,
  };
}

describe('PATCH-279 CanvasModals handleEditAsDrawing', () => {
  it('shows a sonner error once when the save rejects, and does not throw', async () => {
    const createDrawingPost = vi.fn(async () => {
      throw new Error('insert failed');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = mount(<CanvasModals {...(baseProps({ createDrawingPost }) as any)} />);

    await act(async () => {
      c.querySelector('[data-testid="ai-edit-as-drawing"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('The drawing could not be saved. Please try again.');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not toast when the save succeeds', async () => {
    const createDrawingPost = vi.fn(async () => ({ id: 'd1' }));
    const c = mount(<CanvasModals {...(baseProps({ createDrawingPost }) as any)} />);

    await act(async () => {
      c.querySelector('[data-testid="ai-edit-as-drawing"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(createDrawingPost).toHaveBeenCalledTimes(1);
    expect(createDrawingPost).toHaveBeenCalledWith(
      { drawingData: 'D', size: { width: 500, height: 300 } },
      { size: { width: 500, height: 300 }, openEditor: true, placement: undefined },
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});
