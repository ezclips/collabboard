// @vitest-environment jsdom
//
// R6I -- a dropped PDF area is confirmed before it becomes a card.
//
// The privacy consequence is the reason this matters more than it looks. The
// server crop is keyed by padlet id and is created in the SAME call as the row,
// so the old flow persisted a private crop the instant anyone dragged a region
// onto the board -- whether or not they wanted the card. Deferring that one
// call to Save defers both, which is why Cancel can now leave no orphan.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  areaPreviewCropRect,
  clearKnowledgeAreaDraftPreview,
  renderAreaPreviewFromImage,
  stashKnowledgeAreaDraftPreview,
  takeKnowledgeAreaDraftPreview,
} from './knowledgeAreaDraftPreview';
import {
  knowledgePdfAreaImageEndpoint,
  requestKnowledgePdfAreaImage,
} from './knowledgePdfAreaImageClient';
import type { KnowledgeSourceAreaClipPayload } from '../../domain/knowledge/knowledgeSourceClipPayload';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const selector = read('components/collabboard/KnowledgeDocumentPageRegionSelector.tsx');
const previewModule = read('lib/infra/knowledge/knowledgeAreaDraftPreview.ts');
const serveRoute = read('lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts');

/** Source with comments stripped: prose names what the contract forbids. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

function after(source: string, anchor: string, count: number): string {
  const at = source.indexOf(anchor);
  expect(at, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(at, at + count);
}

const dropHandler = () => after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2600);
// PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1 widened this window (2400 -> 3200):
// the synchronous double-click ref guard and the inline error message it now
// also sets pushed the tail of this function (the deps array) past the old
// boundary, which is a window-size fact about this helper, not a claim about
// the function's own length being pinned.
const savePath = () => after(canvasClient, 'const savePdfAreaDraft = useCallback(', 3200);
const discardPath = () => after(canvasClient, 'const discardPdfAreaDraft = useCallback(', 700);
const draftModal = () => after(canvasClient, '<PdfAreaImageDraftModal', 700);

const PAYLOAD: KnowledgeSourceAreaClipPayload = {
  kind: 'area',
  sourceDocumentId: '11111111-1111-4111-8111-111111111111',
  originalFilename: 'paper.pdf',
  pageNumber: 3,
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
} as KnowledgeSourceAreaClipPayload;

// --- Drop / draft ----------------------------------------------------------

describe('R6I-1..4: the drop stages a draft instead of creating a card', () => {
  it('R6I-1: nothing is created on drop -- not even through the transport helper', () => {
    const handler = dropHandler();
    expect(handler).not.toContain('requestKnowledgePdfAreaImage(');
    for (const forbidden of ['.insert(', '.upload(', 'getPublicUrl', 'fetch(']) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
  });

  it('R6I-2: the drop opens the REAL Image post editor, not a generic card modal', () => {
    // R6I-C1: reusing the clipart draft modal gave the user the wrong editor.
    // The draft is now its own state, and the Image editor opens off it.
    const handler = dropHandler();
    expect(handler).toContain('setPendingPdfAreaDraft({ payload, placement, preview })');
    expect(handler).not.toContain('setIsClipartDraftModalOpen');
    // The modal is the Image post editor in creation mode...
    expect(draftModal()).toContain('isOpen={pendingPdfAreaDraft !== null}');
    expect(canvasClient).toContain("import PdfAreaImageDraftModal from '@/components/collabboard/editors/PdfAreaImageDraftModal';");
    // ...and it renders the SAME card the persisted overlay does.
    const modal = read('components/collabboard/editors/PdfAreaImageDraftModal.tsx');
    expect(modal).toContain('<ImagePostEditorCard');
    expect(read('components/collabboard/canvas/ui/FreeformPadletCards.tsx')).toContain('<ImagePostEditorCard');
  });

  it('R6I-3: the modal is given the region preview to show', () => {
    const handler = dropHandler();
    expect(handler).toContain('takeKnowledgeAreaDraftPreview()');
    // R6I-C1: the draft owns the preview from the handoff onwards -- it is not
    // smuggled through a stand-in padlet's metadata, where a generic save could
    // have written it to a row.
    expect(handler).toContain('setPendingPdfAreaDraft({ payload, placement, preview })');
    expect(handler).not.toContain('metadata:');
    expect(draftModal()).toContain('previewSrc={pendingPdfAreaDraft?.preview ?? null}');
  });

  it('R6I-4: the draft remembers document, page, rectangle AND the drop position', () => {
    const handler = dropHandler();
    expect(handler).toContain('setPendingPdfAreaDraft({ payload, placement, preview })');
    // The placement is read from the live event, not recomputed later.
    expect(handler).toContain('getCanvasPointFromClient(event.clientX, event.clientY)');
    expect(handler).toContain('positionX: Math.round(dropPoint.x)');
    expect(handler).toContain('positionY: Math.round(dropPoint.y)');
    // ...and the payload carries the identity/page/rect unaltered.
    expect(savePath()).toContain('pendingPdfAreaDraft.payload');
  });
});

// --- Stacking --------------------------------------------------------------

describe('R6I-6,7: the creation modal is above the PDF side panel', () => {
  it('R6I-6: it registers through the SHARED blocking-editor authority', () => {
    // Not a one-off z-index: the modal this flow reuses is already part of the
    // one flag every docked surface (the Reader included) yields to.
    const memo = after(canvasClient, 'const isBlockingEditorModalOpen = useMemo(', 1600);
    expect(memo).toContain('isClipartDraftModalOpen');
    expect(canvasClient).toContain('blockingEditorOpen={isBlockingOverlayOpen}');
    expect(canvasClient).toContain(
      'const isBlockingOverlayOpen = isBlockingEditorModalOpen || isImageSubtoolModalOpen;',
    );
  });

  it('R6I-5,7: the Reader stays mounted and yields rather than being torn down', () => {
    const reader = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
    expect(reader).toContain('const sidePanelBelowEditor = !isWorkspace && blockingEditorOpen;');
    expect(reader).toContain('style={sidePanelBelowEditor ? { zIndex: 900 } : undefined}');
    // No unmount-on-editor path: it restacks, so nothing is re-fetched.
    expect(reader).not.toContain('if (blockingEditorOpen) return null');
  });
});

// --- Save ------------------------------------------------------------------

describe('R6I-8..17: Save is the only thing that writes', () => {
  it('R6I-8,14: the crop is requested through the existing authenticated authority, on Save', () => {
    const save = savePath();
    expect(save).toContain('requestKnowledgePdfAreaImage(');
    expect(save).toContain('pendingPdfAreaDraft.payload');
    expect(save).toContain('pendingPdfAreaDraft.placement');
  });

  it('R6I-12: the card is placed at the ORIGINAL drop position, not a fresh viewport read', () => {
    const save = savePath();
    expect(save).toContain('...pendingPdfAreaDraft.placement');
    // The save path must never re-derive a position.
    expect(save).not.toContain('getCanvasPointFromClient');
    expect(save).not.toContain('viewport');
  });

  it('R6I-11,17: a second Save cannot create a second card', () => {
    const save = savePath();
    // The in-flight guard is checked before anything is sent...
    expect(save).toContain(
      'if (!canvasId || !pendingPdfAreaDraft || isPdfAreaDraftSaving || isPdfAreaDraftSavingRef.current) return;',
    );
    expect(save.indexOf('setIsPdfAreaDraftSaving(true)'))
      .toBeLessThan(save.indexOf('await requestKnowledgePdfAreaImage'));
    // ...and the draft is cleared on success, so a late second press finds none.
    expect(save).toContain('setPendingPdfAreaDraft(null)');
  });

  it('PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1: the in-flight guard is ALSO a synchronous ref, immune to render timing', () => {
    const save = savePath();
    // The ref is set inside THIS call, strictly before the async gap (the
    // await), so a second invocation reaches the guard with the ref already
    // true even when both were dispatched before React re-rendered.
    const setRef = save.indexOf('isPdfAreaDraftSavingRef.current = true;');
    const guardCheck = save.indexOf('isPdfAreaDraftSavingRef.current) return;');
    const awaitCall = save.indexOf('await requestKnowledgePdfAreaImage');
    expect(guardCheck).toBeGreaterThan(-1);
    expect(setRef).toBeGreaterThan(guardCheck);
    expect(setRef).toBeLessThan(awaitCall);
    // Released on both settlement paths -- success (implicitly, via the
    // unconditional reset right after the await) and failure (same line,
    // strictly before the failure branch's `return`).
    const releaseRef = save.indexOf('isPdfAreaDraftSavingRef.current = false;');
    const refusal = save.indexOf('if (!created.ok)');
    expect(releaseRef).toBeGreaterThan(awaitCall);
    expect(releaseRef).toBeLessThan(refusal);
  });

  it('R6I-16: a successful Save closes the modal and shows the created card', () => {
    const save = savePath();
    // The placement write reconciles by id rather than appending blindly, so a
    // repeated Done for one draft converges on the row the idempotent RPC
    // returns instead of listing the same id twice.
    const place = save.indexOf('const createdPadlet = created.padlet');
    // Clearing the draft IS closing the modal: it renders off that state.
    const close = save.indexOf('setPendingPdfAreaDraft(null)');
    expect(place).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(place);
  });

  it('R6I-13: the created card is whatever the server returned -- no client-built row', () => {
    const save = savePath();
    expect(save).toContain('created.padlet as unknown as Padlet');
    expect(save).not.toContain("type: 'image'");
  });

  it('the confirmed title reaches the server as display text only', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ padlet: { id: 'p1' } }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await requestKnowledgePdfAreaImage('b1', PAYLOAD, { positionX: 5, positionY: 6, title: '  My area  ' }, fetchImpl);
    expect(calls[0].title).toBe('My area');
    // Identity, page and rectangle are unchanged by the title.
    expect(calls[0].knowledgeDocumentId).toBe(PAYLOAD.sourceDocumentId);
    expect(calls[0].pageNumber).toBe(3);
    expect(calls[0].positionX).toBe(5);
    expect(calls[0].positionY).toBe(6);
    // No crop bytes are ever uploaded.
    expect(Object.keys(calls[0])).not.toContain('preview');
    expect(JSON.stringify(calls[0])).not.toContain('data:image');
  });

  it('an absent title falls back to the source filename, as the drop flow always did', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ padlet: { id: 'p1' } }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await requestKnowledgePdfAreaImage('b1', PAYLOAD, { positionX: 1, positionY: 2 }, fetchImpl);
    expect(calls[0].title).toBe('paper.pdf');
    await requestKnowledgePdfAreaImage('b1', PAYLOAD, { positionX: 1, positionY: 2, title: '   ' }, fetchImpl);
    expect(calls[1].title).toBe('paper.pdf');
  });
});

// --- Cancel ----------------------------------------------------------------

describe('R6I-18..21: Cancel writes nothing at all', () => {
  it('R6I-18,19: the discard path creates no card and requests no crop', () => {
    const discard = discardPath();
    expect(discard).not.toContain('requestKnowledgePdfAreaImage');
    expect(discard).not.toContain('setPadlets');
    expect(discard).not.toContain('saveCard');
  });

  it('R6I-20: the temporary preview is released', () => {
    const discard = discardPath();
    expect(discard).toContain('clearKnowledgeAreaDraftPreview()');
    expect(discard).toContain('setPendingPdfAreaDraft(null)');
    expect(discard).toContain("setPdfAreaDraftTitle('')");
  });

  it('R6I-21: dropping the draft closes the modal, and the Reader restacks', () => {
    // The modal renders off the draft, so clearing it is the close.
    expect(discardPath()).toContain('setPendingPdfAreaDraft(null)');
    expect(draftModal()).toContain('onCancel={discardPdfAreaDraft}');
  });

  it('PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1: a backdrop click is wired to SAVE, and never to a discard', () => {
    // The history of this one line, because it has now been three things:
    //   1. onCancel() directly -- a "safe discard" that silently lost captures;
    //   2. nothing at all -- the draft stayed open, and a footer carried save;
    //   3. submit -- clicking outside keeps the work, matching every other
    //      post editor in the app.
    // Only (1) could lose work, and this assertion is what keeps it gone: the
    // backdrop must reach submit, and must not reach any close path.
    // code(), not the raw read: this file's own comments necessarily use these
    // identifiers in prose.
    const modal = code(read('components/collabboard/editors/PdfAreaImageDraftModal.tsx'));
    expect(modal).toContain('useBackdropDismiss(submit)');
    expect(modal).toContain('backdropProps={backdropSaves}');
    expect(modal).not.toContain('useBackdropDismiss(requestClose)');
    expect(modal).not.toContain('useBackdropDismiss(onCancel)');
    expect(modal).not.toContain('backdropProps={{ onClick: onCancel }}');
  });

  it('PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1: publishing still has exactly ONE call site, now reached by clicking outside or Enter', () => {
    // The property that has held across all three exit models: there is
    // exactly one place onSave is called, and no CLOSE control reaches it.
    // What changed is only which gestures route into `submit`.
    const modal = read('components/collabboard/editors/PdfAreaImageDraftModal.tsx');
    expect(modal).toContain('onSave();');
    // The prop declaration/destructure are the other two mentions of the bare
    // identifier, so this is exactly one call site.
    expect((modal.match(/\bonSave\(\)/g) ?? [])).toHaveLength(1);
    // The two gestures that publish, both routed through the single `submit`.
    expect(modal).toContain('useBackdropDismiss(submit)');
    expect(modal).toContain('submit()');
    // Escape and the toolbar arrow ask first -- neither calls onSave, and the
    // save button that used to be the third publisher no longer exists.
    expect(modal).not.toMatch(/onBack=\{onSave\}/);
    expect(modal).not.toContain('onClick={submit}');
    expect(modal).toMatch(/event\.key === 'Escape'[\s\S]{0,40}requestClose\(\)/);
    expect(modal).toContain('onBack={requestClose}');
  });

  it('PDF_AREA_CAPTURE_SAVE_UX_CORRECTION_1: every close control funnels through the SAME confirmation, and only its own Discard writes nothing', () => {
    const modal = read('components/collabboard/editors/PdfAreaImageDraftModal.tsx');
    expect(modal).toContain('<DiscardChangesDialog');
    expect(modal).toContain('title="Discard this image?"');
    expect(modal).toContain('discardLabel="Discard"');
    // onCancel (the real, writes-nothing discard CanvasClient wires to
    // discardPdfAreaDraft) is reachable ONLY from the dialog's onDiscard.
    expect((modal.match(/onCancel\(\)/g) ?? [])).toHaveLength(1);
    expect(modal).toContain('onDiscard={discard}');
  });
});

// --- Failure ---------------------------------------------------------------

describe('R6I-22..25: a failed Save keeps the work on screen', () => {
  it('R6I-22,23: the modal stays open and the draft is retained', () => {
    const save = savePath();
    const refusal = save.indexOf('if (!created.ok)');
    const place = save.indexOf('setPadlets(prev => [...prev, created.padlet');
    // Everything that tears the draft down happens strictly AFTER the refusal
    // returns, so a failure cannot discard it.
    for (const teardown of ['setPendingPdfAreaDraft(null)', "setPdfAreaDraftTitle('')"]) {
      expect(save.indexOf(teardown), teardown).toBeGreaterThan(place);
    }
    expect(save.slice(refusal, place)).toContain('return;');
  });

  it('R6I-24: no broken card is placed on the way out', () => {
    const save = savePath();
    expect(save.indexOf('const createdPadlet = created.padlet'))
      .toBeGreaterThan(save.indexOf('if (!created.ok)'));
  });

  it('R6I-25: the in-flight guard is released so a retry can proceed', () => {
    const save = savePath();
    const release = save.indexOf('setIsPdfAreaDraftSaving(false)');
    const refusal = save.indexOf('if (!created.ok)');
    expect(release).toBeGreaterThan(-1);
    expect(release).toBeLessThan(refusal);
  });
});

// --- The preview: display only, never an authority -------------------------

describe('R6I: the draft preview is display-only, and costs no request', () => {
  beforeEach(() => { clearKnowledgeAreaDraftPreview(); });
  afterEach(() => { clearKnowledgeAreaDraftPreview(); vi.restoreAllMocks(); });

  it('maps a normalized display region onto source pixels', () => {
    expect(areaPreviewCropRect({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 400, 800))
      .toEqual({ sx: 100, sy: 400, sw: 200, sh: 200 });
  });

  it('refuses rather than reading outside the image', () => {
    expect(areaPreviewCropRect({ x: 0, y: 0, width: 1, height: 1 }, 0, 0)).toBeNull();
    expect(areaPreviewCropRect({ x: 0, y: 0, width: 0.0001, height: 0.0001 }, 10, 10)).toBeNull();
    const edge = areaPreviewCropRect({ x: 0.99, y: 0.99, width: 0.5, height: 0.5 }, 100, 100)!;
    expect(edge.sx + edge.sw).toBeLessThanOrEqual(100);
    expect(edge.sy + edge.sh).toBeLessThanOrEqual(100);
  });

  it('is handed over exactly once, then the slot is empty', () => {
    stashKnowledgeAreaDraftPreview('data:image/webp;base64,AAA');
    expect(takeKnowledgeAreaDraftPreview()).toBe('data:image/webp;base64,AAA');
    expect(takeKnowledgeAreaDraftPreview()).toBeNull();
  });

  it('a drag that never lands leaves nothing retained', () => {
    stashKnowledgeAreaDraftPreview('data:image/webp;base64,AAA');
    clearKnowledgeAreaDraftPreview();
    expect(takeKnowledgeAreaDraftPreview()).toBeNull();
  });

  it('it is cut from the already-loaded page image, with no new request', () => {
    // The one thing that must not happen here is a second fetch of private
    // bytes. It draws from the element the Reader already has on screen.
    expect(code(previewModule)).not.toContain('fetch(');
    expect(code(previewModule)).not.toContain('new Image(');
    expect(code(previewModule)).not.toContain('XMLHttpRequest');
    expect(previewModule).toContain('context.drawImage(image,');
    const drag = after(selector, 'const startAreaClipDrag = (', 2400);
    expect(drag).toContain("wrapperRef.current?.querySelector('img')");
  });

  it('a canvas the browser refuses to export yields no preview, not an exception', () => {
    const image = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;
    vi.spyOn(document, 'createElement').mockImplementation((() => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => { throw new Error('tainted'); },
    })) as unknown as typeof document.createElement);
    expect(renderAreaPreviewFromImage(image, { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });
});

// --- Privacy ---------------------------------------------------------------

describe('R6I-9,10,15: the private serving contract is untouched', () => {
  it('R6I-15: the crop is still served by the same authenticated route', () => {
    expect(serveRoute).toContain('no-store');
    expect(serveRoute).toContain('private');
    expect(knowledgePdfAreaImageEndpoint('b1')).toBe('/api/boards/b1/knowledge/area-image');
  });

  it('R6I-9,10: authorisation still happens server-side, on the same call', () => {
    // R6I moved WHEN this call runs, never who checks it. The route still
    // re-authorises board EDIT and source READ for itself.
    const route = read('lib/server/knowledge/knowledgePdfAreaImageRoute.ts');
    expect(route).toContain('insertPadlet');
    // The client never gained an authorisation decision of its own.
    expect(code(read('lib/infra/knowledge/knowledgePdfAreaImageClient.ts')))
      .not.toContain('serviceRole');
  });

  it('no public URL, signed URL or persistent client cache is introduced', () => {
    for (const source of [previewModule, code(canvasClient)]) {
      for (const forbidden of ['getPublicUrl', 'createSignedUrl', 'padlet-files', 'storage/v1']) {
        expect(source, forbidden).not.toContain(forbidden);
      }
    }
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB']) {
      expect(code(previewModule), forbidden).not.toContain(forbidden);
    }
  });
});


describe('R6I-C1: the creation modal opens ABOVE the PDF side panel', () => {
  const modal = read('components/collabboard/editors/PdfAreaImageDraftModal.tsx');
  const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

  it('it portals to <body>, because no z-index inside the canvas can win', () => {
    // R6C's lesson: this renders inside CanvasViewport's `isolation: isolate`,
    // where the whole canvas subtree paints as ONE layer at z-index:auto. The
    // clipart modal it replaced was `fixed inset-0 z-[160]` with no portal,
    // which is exactly why the reader covered it. R6I-C2 moved the portal into
    // the shared shell, so the draft inherits it rather than re-deciding.
    const shell = read('components/collabboard/editors/ImagePostEditorShell.tsx');
    expect(shell).toContain("import { createPortal } from 'react-dom';");
    expect(shell).toContain('document.body,');
    expect(modal).toContain('<ImagePostEditorShell');
    expect(code(modal)).not.toContain('z-[160]');
    expect(code(modal)).not.toContain('fixed inset-0');
  });

  it('it paints at the SAME tier as the accepted persisted image overlay', () => {
    const shell = read('components/collabboard/editors/ImagePostEditorShell.tsx');
    const tierIn = (source: string) => {
      // Comments are prose -- the shell's own doc names the tier it replaced.
      const match = /z-\[(\d+)\]/.exec(code(source));
      expect(match, 'no tier declared').not.toBeNull();
      return Number(match![1]);
    };
    const overlayAt = freeform.indexOf('data-ui="freeform-image-editor-overlay"');
    const overlayTier = tierIn(freeform.slice(Math.max(0, overlayAt - 400), overlayAt));
    expect(tierIn(shell)).toBe(overlayTier);
    expect(overlayTier).toBe(60000);
  });

  it('the reader yields through the ONE shared authority, not a new z-index', () => {
    const memo = after(canvasClient, 'const isBlockingEditorModalOpen = useMemo(', 1800);
    expect(memo).toContain('pendingPdfAreaDraft !== null');
    const reader = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
    expect(reader).toContain('const sidePanelBelowEditor = !isWorkspace && blockingEditorOpen;');
    // No reader-specific hack was added anywhere for this modal.
    expect(modal).not.toContain('KnowledgeSourceReaderDrawer');
    expect(modal).not.toMatch(/z-\[9{4,}\]/);
  });

  it('it looks like an Image post: the image is the content, with no note chrome', () => {
    expect(modal).toContain('<ImagePostEditorCard');
    // Controls that need a row it does not have yet are absent, not faked.
    for (const absent of ['CommentPopup', 'EmojiReactionPicker', 'ReactionDisplay', 'CardEditor', 'CardPreview']) {
      expect(modal, absent).not.toContain(absent);
    }
  });
});

describe('R6I-C2: the draft IS the real Image post editor, not a preview dialog', () => {
  const modal = read('components/collabboard/editors/PdfAreaImageDraftModal.tsx');
  const shell = read('components/collabboard/editors/ImagePostEditorShell.tsx');
  const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

  it('the shape is Title + large image + the LEFT Image toolbar', () => {
    // The reported failure: a title, a preview and Cancel/Save underneath,
    // with no Image toolbar. That is a confirmation dialog, not the editor.
    expect(modal).toContain('<ImagePostEditorShell');
    expect(modal).toContain('<ImageActionsToolbar');
    expect(modal).toContain('<ImagePostEditorCard');
    // The toolbar goes in the shell's LEFT track.
    expect(modal).toMatch(/toolbar=\{[\s\S]{0,120}<ImageActionsToolbar/);
    expect(shell).toContain('className="flex items-start justify-end"');
  });

  it('it uses the SAME toolbar component the persisted editor does', () => {
    expect(freeform).toContain('<ImageActionsToolbar');
    for (const source of [modal, freeform]) {
      expect(source).toContain('<ImageActionsToolbar');
    }
    // ...and the same card.
    expect(freeform).toContain('<ImagePostEditorCard');
  });

  it('actions that need a persisted row are DISABLED, never wired to no-ops that look live', () => {
    expect(modal).toContain("const DRAFT_DISABLED_TOOLS = ['caption', 'edit', 'draw', 'reaction', 'comment', 'color']");
    expect(modal).toContain('disabledToolIds={DRAFT_DISABLED_TOOLS}');
    const toolbar = read('components/collabboard/editors/ImageActionsToolbar.tsx');
    expect(toolbar).toContain('disabled={isToolDisabled(tool.id)}');
    expect(toolbar).toContain("disabled={isToolDisabled('color')}");
    expect(toolbar).toContain('cursor-not-allowed');
  });

  it('the draft and the persisted overlay declare the SAME shell, so they cannot drift', () => {
    // The persisted overlay was deliberately not restructured -- see the note
    // in the report -- so this pins its declarations to the shared shell's.
    const overlayAt = freeform.indexOf('data-ui="freeform-image-editor-overlay"');
    expect(overlayAt).toBeGreaterThan(-1);
    const overlay = freeform.slice(Math.max(0, overlayAt - 600), overlayAt + 900);

    expect(overlay).toContain('fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm');
    expect(shell).toContain('fixed inset-0 ${IMAGE_POST_EDITOR_OVERLAY_Z_CLASS} flex items-center justify-center bg-black/35 backdrop-blur-sm');
    expect(shell).toContain("export const IMAGE_POST_EDITOR_OVERLAY_Z_CLASS = 'z-[60000]';");

    for (const declaration of [
      "gridTemplateColumns: '1fr auto 1fr'",
      "width: 'calc(100vw - 80px)'",
      "maxHeight: 'calc(100vh - 80px)'",
      'className="relative grid items-start gap-6"',
      'className="flex items-start justify-end"',
      'className="flex items-start justify-start"',
    ]) {
      expect(overlay + freeform, `overlay: ${declaration}`).toContain(declaration);
      expect(shell, `shell: ${declaration}`).toContain(declaration);
    }
  });

  it('there is no intermediate confirmation step between the drop and the editor', () => {
    // The drop stages the draft and the editor renders off it. Nothing else.
    const handler = dropHandler();
    expect(handler).toContain('setPendingPdfAreaDraft({ payload, placement, preview })');
    expect(handler).not.toContain('Confirm');
    expect(draftModal()).toContain('isOpen={pendingPdfAreaDraft !== null}');
  });
});


// PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1 -- the footer is gone again, but NOT
// back to R6I-C3's contract. R6I-C3 had no footer AND a backdrop that discarded
// silently; that combination is what lost captures. This one has no footer and
// a backdrop that SAVES, so the failure mode is closed by construction rather
// than by a control the user had to find. The draft's exit model now matches
// every other post editor: you click away and what you made is kept.
describe('PDF_AREA_CAPTURE_CLICK_OUTSIDE_SAVES_1: no footer, and clicking outside saves', () => {
  const modal = read('components/collabboard/editors/PdfAreaImageDraftModal.tsx');
  const toolbar = read('components/collabboard/editors/ImageActionsToolbar.tsx');

  it('the footer buttons are gone, and the caption carries the in-flight state', () => {
    for (const absent of [
      'data-ui="pdf-area-image-draft-save"',
      'data-ui="pdf-area-image-draft-cancel"',
      'Add image to canvas',
      'saveButtonRef',
    ]) {
      expect(modal, absent).not.toContain(absent);
    }
    // The copy the save button used to own now lives on the caption -- without
    // it an in-flight save would be entirely silent.
    expect(modal).toContain('data-ui="pdf-area-image-draft-caption"');
    expect(modal).toMatch(
      /data-ui="pdf-area-image-draft-caption"[\s\S]{0,300}isSaving \? 'Adding…' : 'Adds this image to the canvas and PDF Library\.'/,
    );
    // The actions region and the error line both survive.
    expect(modal).toContain('data-ui="pdf-area-image-draft-actions"');
    expect(modal).toContain('data-ui="pdf-area-image-draft-error"');
    expect(modal).toContain('role="alert"');
  });

  it('the backdrop is bound to the SAVE path, through the shared dismiss authority', () => {
    // The previous contract omitted backdropProps entirely so a backdrop click
    // did nothing. It is now wired -- and wired to submit, never to a discard,
    // which is the behaviour that lost captures in the first place.
    expect(modal).toContain('backdropProps={backdropSaves}');
    expect(modal).toContain('useBackdropDismiss(submit)');
    expect(modal).not.toContain('useBackdropDismiss(requestClose)');
    expect(modal).not.toContain('useBackdropDismiss(onCancel)');
  });

  it('Enter publishes from the modal wrapper, without changing the shared card', () => {
    const card = read('components/collabboard/editors/ImagePostEditorCard.tsx');
    expect(modal).toContain('onKeyDown={onWrapperKeyDown}');
    expect(modal).toMatch(/event\.key !== 'Enter'/);
    expect(modal).toContain('submit()');
    // IME safety: Enter commits a candidate mid-word in Japanese/Chinese input.
    expect(modal).toContain('isComposing');
    // The shared card's own Enter still means "blur", for the persisted editor.
    expect(card).toContain("if (e.key === 'Enter') e.currentTarget.blur();");
  });

  it('the real Image toolbar and card are still what is rendered', () => {
    expect(modal).toContain('<ImagePostEditorShell');
    expect(modal).toContain('<ImageActionsToolbar');
    expect(modal).toContain('<ImagePostEditorCard');
  });

  it('the toolbar arrow no longer finishes/publishes -- it asks to close, like Escape', () => {
    expect(modal).not.toContain('onBack={onSave}');
    expect(modal).toContain('onBack={requestClose}');
    expect(modal).toContain('backLabel="Cancel"');
    // The toolbar itself is unchanged: still routes onBack to whatever the
    // caller supplies, in draft mode only.
    expect(toolbar).toContain('onClick={onBack ?? handleToggleMode}');
    expect(toolbar).toContain("data-ui={onBack ? 'image-editor-draft-complete' : 'image-editor-mode-toggle'}");
  });

  it('the tooltip on that arrow no longer claims to place the image', () => {
    // ImageActionsToolbar's own default (backTitle) keeps the ORIGINAL
    // wording for any hypothetical other caller; this draft overrides it
    // because its arrow no longer does that.
    expect(toolbar).toContain('backTitle = ');
    expect(toolbar).toContain("'Place this image on the board'");
    expect(modal).not.toMatch(/onBack=\{requestClose\}[\s\S]{0,200}'Place this image on the board'/);
  });

  it('a second submission while one is in flight is refused, with no button left to carry the guard', () => {
    // The save button's `disabled={isSaving}` is gone with the button, and a
    // backdrop cannot be disabled -- so the guards that remain are the only
    // ones there are, and each is asserted here rather than assumed.
    expect(modal).toContain('backDisabled={isSaving}');
    expect(toolbar).toContain('disabled={onBack ? backDisabled : false}');
    // The synchronous ref, now the ONLY lock on the submit path.
    expect(modal).toContain('if (isSaving || submitLockRef.current) return;');
    // The close path carries its own isSaving check -- this is what used to be
    // the Cancel button's `disabled={isSaving}`, and it must not be lost with
    // it, or Escape could discard a capture mid-write.
    expect(modal).toContain('if (isSaving || confirmingDiscard) return;');
    // ...and the save path itself still guards (state AND the synchronous
    // ref), so the modal is not the only thing standing between a double
    // press and two cards.
    expect(savePath()).toContain(
      'if (!canvasId || !pendingPdfAreaDraft || isPdfAreaDraftSaving || isPdfAreaDraftSavingRef.current) return;',
    );
  });

  it('the PERSISTED editor keeps the arrow it always had', () => {
    // Absent onBack means the Image/Text mode toggle, unchanged -- this was
    // never a back or exit control there.
    expect(toolbar).toContain("(mode === 'image' ? 'Switch to Caption Styling' : 'Switch to Image Actions')");
    expect(toolbar).toContain("{onBack ? backLabel : (mode === 'image' ? 'Text' : 'Image')}");
    // FreeformPadletCards renders it without onBack.
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const persisted = after(freeform, '<ImageActionsToolbar', 1200);
    expect(persisted).not.toContain('onBack=');
  });

  it('a failed/denied save is shown inline, sourced from CanvasClient, never invented by the modal', () => {
    expect(modal).toContain('data-ui="pdf-area-image-draft-error"');
    expect(modal).toContain('{error}');
    expect(canvasClient).toContain('setPdfAreaDraftError(message)');
    expect(canvasClient).toContain('error={pdfAreaDraftError}');
    // Cleared at the start of a new attempt and whenever the draft changes,
    // so a stale error can never survive into an unrelated one.
    expect(canvasClient).toContain('setPdfAreaDraftError(null)');
  });
});
