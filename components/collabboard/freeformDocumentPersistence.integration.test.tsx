// @vitest-environment jsdom
//
// PATCH-152 targeted correction: a REAL runtime/integration test (not a
// source-level characterization test) proving a Document created directly on
// Freeform survives its full create->save->close->render path:
//
//   DocumentEditor onSave -> CanvasModals -> saveCard (usePadletSave) ->
//   Freeform padlets state -> Freeform rendering (CardPreview, the actual
//   leaf renderer FreeformPadletCards.tsx delegates 'card'-type padlets to).
//
// The harness below mounts the REAL usePadletSave hook and the REAL
// CanvasModals component (which mounts the REAL DocumentEditor), wired the
// same way CanvasClient.tsx wires them for Freeform. It fakes only the
// Supabase client (network boundary) -- everything else is production code.
//
// FreeformPadletCards.tsx itself is not mounted directly: it is a 300KB+
// monolith requiring CanvasEditorContext/CanvasConfigContext and dozens of
// unrelated action-map callbacks that have nothing to do with this bug. Its
// two responsibilities relevant here -- (1) filtering padlets to roots via
// `!p.metadata?.parentId`, (2) positioning a card at
// `{ left: position_x, top: position_y }` and delegating 'card'-type padlets
// to CardPreview -- are reproduced verbatim from its source below, then wired
// to the REAL CardPreview component (its actual leaf renderer for Documents).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { usePadletSave, type SaveCardData, type SaveCardResult } from '@/hooks/canvas/usePadletSave';
import CanvasModals from './canvas/ui/CanvasModals';
import CardPreview from './CardPreview';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
// CanvasModals unconditionally imports ImageEditor, which imports
// react-image-crop's CSS -- this repo's vitest/PostCSS pipeline cannot
// process that CSS ("Invalid PostCSS Plugin"), independent of any Document
// logic (already documented/ruled on in documentShellIntegration.behavior.
// test.tsx). ImageEditor has nothing to do with the Document flow under
// test, so it's stubbed out purely to make CanvasModals importable here.
vi.mock('@/components/collabboard/editors/ImageEditor', () => ({ default: () => null }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { container, root };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.clearAllMocks();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function closeBtn(c: HTMLElement) {
  return c.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
}
function titleInput(c: HTMLElement) {
  return c.querySelector('input[placeholder="Untitled document"]') as HTMLInputElement;
}
function descriptionInput(c: HTMLElement) {
  return c.querySelector('input[placeholder="Add a description..."]') as HTMLInputElement;
}
function setValue(el: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** A single-use, manually-resolvable insert -- lets tests observe state
 * strictly *before* vs strictly *after* the persisted row lands, proving
 * ordering rather than assuming it from a same-tick resolution. */
function installFakeSupabase() {
  const insertedRows: any[] = [];
  let nextId = 1;
  let releaseInsert: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { releaseInsert = resolve; });

  const client = {
    from(_table: string) {
      return {
        insert(row: any) {
          return {
            select() {
              return {
                async single() {
                  await gate;
                  const id = `persisted-${nextId++}`;
                  const created = {
                    ...row,
                    id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  insertedRows.push(created);
                  return { data: created, error: null };
                },
              };
            },
          };
        },
        update(_fields: any) {
          return { eq: async () => ({ error: null }) };
        },
        select(_cols: string) {
          return { eq: (_c: string, _v: string) => ({ single: async () => ({ data: null, error: null }) }) };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as any);
  return { insertedRows, releaseInsert: () => act(() => releaseInsert!()) };
}

/** Insert resolves on the same microtask turn it's awaited -- used by tests
 * that don't care about ordering, only about the end state. */
function installImmediateFakeSupabase() {
  const insertedRows: any[] = [];
  let nextId = 1;
  const client = {
    from(_table: string) {
      return {
        insert(row: any) {
          return {
            select() {
              return {
                async single() {
                  const id = `persisted-${nextId++}`;
                  const created = {
                    ...row,
                    id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  insertedRows.push(created);
                  return { data: created, error: null };
                },
              };
            },
          };
        },
        update(_fields: any) {
          return { eq: async () => ({ error: null }) };
        },
        select(_cols: string) {
          return { eq: (_c: string, _v: string) => ({ single: async () => ({ data: null, error: null }) }) };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as any);
  return { insertedRows };
}

const NEW_DOCUMENT_DRAFT = (): Padlet => ({
  id: 'new',
  board_id: 'canvas-1',
  title: '',
  content: '',
  type: 'card',
  position_x: 0,
  position_y: 0,
  width: 180,
  height: 220,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: {},
});

function Harness() {
  const [padlets, setPadlets] = React.useState<Padlet[]>([]);
  const [padletToEdit, setPadletToEditState] = React.useState<Padlet | null>(null);
  const [documentModalDestination, setDocumentModalDestination] = React.useState<'document-editor' | 'document-viewer' | null>(null);
  const [rerenderTick, setRerenderTick] = React.useState(0);

  const { saveCard } = usePadletSave({
    canvasId: 'canvas-1',
    padletToEdit,
    isWallLayout: false,
    isColumnsLayout: false,
    isGridLayout: false,
    isDrawingLayout: false,
    isTimelineLayout: false,
    isSchedulerLayout: false,
    isFreeformLayout: true,
    isMapLayout: false,
    setPadletToEdit: setPadletToEditState,
    fetchData: async () => {},
    setIsNoteEditorOpen: () => {},
    setIsLinkEditorOpen: () => {},
    setIsTodoEditorOpen: () => {},
    setIsTableEditorOpen: () => {},
    setIsContainerEditorOpen: () => {},
    setIsCommentEditorOpen: () => {},
    setIsCardEditorOpen: () => {},
    setIsImageEditorOpen: () => {},
    setIsDrawingEditorOpen: () => {},
    setIsAIComponentEditorOpen: () => {},
    setPendingPostDraft: () => {},
    setIsPlacementPromptOpen: () => {},
    setWallPendingPostDraft: () => {},
    setWallPlacementPromptOpen: () => {},
    padlets,
    setPadlets,
    getNewPostPosition: () => ({ x: 321, y: 654 }),
  });

  // Reproduced verbatim from CanvasClient.tsx's rootPadlets memo.
  const rootPadlets = React.useMemo(() => padlets.filter(p => !p.metadata?.parentId), [padlets]);

  return (
    <div>
      <button
        data-testid="create-document"
        onClick={() => {
          setPadletToEditState(NEW_DOCUMENT_DRAFT());
          setDocumentModalDestination('document-editor');
        }}
      >
        Create Document
      </button>
      {/* Body content can't be reliably keystroke-simulated into a TipTap/
          ProseMirror contenteditable under jsdom (no real text-input
          reconciliation there); DocumentEditor.test.tsx's own body-editing
          proofs already cover typing/formatting mechanics in isolation. This
          seeds the draft's content the same way CanvasModals feeds any
          existing post into the editor (initialContent prop), so this test
          can focus on what it's actually responsible for: whether body
          content present at save time survives the create/persist/render/
          reopen cycle. */}
      <button
        data-testid="create-document-with-body"
        onClick={() => {
          setPadletToEditState({ ...NEW_DOCUMENT_DRAFT(), content: '<p>Body text</p>' });
          setDocumentModalDestination('document-editor');
        }}
      >
        Create Document With Body
      </button>
      <button data-testid="force-rerender" onClick={() => setRerenderTick((t) => t + 1)}>
        rerender {rerenderTick}
      </button>
      <button
        data-testid="reopen-first-card"
        onClick={() => {
          const card = padlets.find((p) => p.type === 'card');
          if (card) {
            setPadletToEditState(card);
            setDocumentModalDestination('document-editor');
          }
        }}
      >
        Reopen
      </button>

      <CanvasModals
        isNoteEditorOpen={false} setIsNoteEditorOpen={() => {}}
        isLinkEditorOpen={false} setIsLinkEditorOpen={() => {}}
        isTableEditorOpen={false} setIsTableEditorOpen={() => {}}
        isTodoEditorOpen={false} setIsTodoEditorOpen={() => {}}
        isContainerEditorOpen={false} setIsContainerEditorOpen={() => {}}
        isCommentEditorOpen={false} setIsCommentEditorOpen={() => {}}
        isImageEditorOpen={false} setIsImageEditorOpen={() => {}}
        isDrawingEditorOpen={false} setIsDrawingEditorOpen={() => {}}
        isAIComponentEditorOpen={false} setIsAIComponentEditorOpen={() => {}}
        isAIContentEditModalOpen={false} setIsAIContentEditModalOpen={() => {}}
        isAIContentConvertModalOpen={false} setIsAIContentConvertModalOpen={() => {}}
        documentModalDestination={documentModalDestination}
        setDocumentModalDestination={setDocumentModalDestination}
        padletToEdit={padletToEdit}
        setPadletToEdit={setPadletToEditState}
        padlets={padlets}
        setPadlets={setPadlets}
        selectedPadletId={null}
        viewDrawingPadlet={null}
        setViewDrawingPadlet={() => {}}
        imageEditorTab=""
        user={null}
        canvasLayout="freeform"
        canvasId="canvas-1"
        saveNote={() => {}}
        saveLink={() => {}}
        saveTable={() => {}}
        saveTodo={() => {}}
        saveContainer={() => {}}
        saveComment={() => {}}
        saveImage={() => {}}
        saveDrawing={() => {}}
        saveAIComponent={() => {}}
        saveCard={saveCard}
        closeAllToolbars={() => {}}
        openPadletInTypeEditor={() => {}}
        handleDetachChildFromFreeformContainer={() => {}}
        handleDeleteChildFromContainer={() => {}}
        fetchData={() => {}}
        updatePadletById={async () => ({})}
      />

      {/* Reproduced verbatim from FreeformPadletCards.tsx: root-padlet map,
          position styling, and the 'card'-type -> CardPreview delegation. */}
      <div data-testid="freeform-canvas">
        {rootPadlets.map((padlet) => (
          <div
            key={padlet.id}
            data-testid={`freeform-card-${padlet.id}`}
            data-padlet-id={padlet.id}
            data-title={padlet.title}
            data-x={padlet.position_x}
            data-y={padlet.position_y}
            data-parent={(padlet.metadata as any)?.parentId ?? ''}
            className="absolute"
            style={{ left: padlet.position_x || 0, top: padlet.position_y || 0 }}
          >
            {padlet.type === 'card' && (
              <CardPreview padlet={padlet} isSelected={false} onClick={() => {}} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

describe('PATCH-152 runtime: Freeform Document create -> autosave-on-close -> render', () => {
  it('save resolves before the editor closes: the editor is still open while persistence is pending, and only closes after the gate releases', async () => {
    const { insertedRows, releaseInsert } = installFakeSupabase();
    const { container } = mount(<Harness />);

    click(container.querySelector('[data-testid="create-document"]')!);
    setValue(titleInput(container), 'My Freeform Doc');

    // Fire the close click but do not await settling yet -- attemptClose is
    // now in-flight, blocked on the deferred insert.
    act(() => { closeBtn(container).dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // Still open, nothing persisted yet, no card on the canvas.
    expect(titleInput(container)).not.toBeNull();
    expect(insertedRows.length).toBe(0);
    expect(container.querySelectorAll('[data-testid^="freeform-card-"]').length).toBe(0);

    await act(async () => { releaseInsert(); await Promise.resolve(); await Promise.resolve(); });

    expect(insertedRows.length).toBe(1);
    expect(titleInput(container)).toBeNull(); // editor closed only after persistence
  });

  it('exactly one Document is inserted and appears directly on the Freeform canvas with no container', async () => {
    installImmediateFakeSupabase();
    const { container } = mount(<Harness />);

    click(container.querySelector('[data-testid="create-document"]')!);
    setValue(titleInput(container), 'Trip Notes');
    setValue(descriptionInput(container), 'Packing list');

    await act(async () => { closeBtn(container).click(); });

    const cards = container.querySelectorAll('[data-testid^="freeform-card-"]');
    expect(cards.length).toBe(1);
    const card = cards[0] as HTMLElement;
    expect(card.dataset.title).toBe('Trip Notes');
    expect(card.dataset.parent).toBe('');
    expect(card.dataset.id).toBeUndefined(); // sanity: no stray attr leakage
  });

  it('the persisted ID replaces the draft "new" ID -- the rendered card key is never "new"', async () => {
    installImmediateFakeSupabase();
    const { container } = mount(<Harness />);

    click(container.querySelector('[data-testid="create-document"]')!);
    setValue(titleInput(container), 'Has A Real Id');
    await act(async () => { closeBtn(container).click(); });

    expect(container.querySelector('[data-testid="freeform-card-new"]')).toBeNull();
    const card = container.querySelector('[data-testid^="freeform-card-persisted-"]');
    expect(card).not.toBeNull();
  });

  it('x/y position from creation time is preserved on the rendered card', async () => {
    installImmediateFakeSupabase();
    const { container } = mount(<Harness />);

    click(container.querySelector('[data-testid="create-document"]')!);
    setValue(titleInput(container), 'Positioned');
    await act(async () => { closeBtn(container).click(); });

    const card = container.querySelector('[data-testid^="freeform-card-persisted-"]') as HTMLElement;
    expect(card.dataset.x).toBe('321');
    expect(card.dataset.y).toBe('654');
    expect(card.style.left).toBe('321px');
    expect(card.style.top).toBe('654px');
  });

  it('the card remains after an unrelated rerender, and reopening it shows the saved title/body/description', async () => {
    installImmediateFakeSupabase();
    const { container } = mount(<Harness />);

    click(container.querySelector('[data-testid="create-document-with-body"]')!);
    setValue(titleInput(container), 'Reopen Me');
    setValue(descriptionInput(container), 'A description');
    await act(async () => { closeBtn(container).click(); });

    expect(container.querySelectorAll('[data-testid^="freeform-card-"]').length).toBe(1);

    click(container.querySelector('[data-testid="force-rerender"]')!);
    expect(container.querySelectorAll('[data-testid^="freeform-card-"]').length).toBe(1);

    click(container.querySelector('[data-testid="reopen-first-card"]')!);
    expect(titleInput(container).value).toBe('Reopen Me');
    expect(descriptionInput(container).value).toBe('A description');
    expect(container.textContent).toContain('Body text');
  });

  it('no duplicate Document is created from a single create->close action', async () => {
    const { insertedRows } = installImmediateFakeSupabase();
    const { container } = mount(<Harness />);

    click(container.querySelector('[data-testid="create-document"]')!);
    setValue(titleInput(container), 'Once Only');
    await act(async () => { closeBtn(container).click(); });

    expect(insertedRows.length).toBe(1);
    expect(container.querySelectorAll('[data-testid^="freeform-card-"]').length).toBe(1);
  });
});
