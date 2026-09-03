// @vitest-environment jsdom
//
// R6D Part D -- the measured cause of tool-switch lag, and its fix.
//
// MEASUREMENT (not a guess). Switching main -> Draw / main -> Edit called
// setImageToolbarPadletId(null), which unmounts the whole image overlay and
// with it the <img> holding the decoded image. The subtool then mounts its own
// <img>, and returning remounts the overlay's again. For an R6B private image
// the serve route answers `Cache-Control: private, no-store`, so the browser is
// FORBIDDEN from reusing the stored response: every one of those mounts is a
// fresh authenticated GET plus a full decode. Classification:
// COMPONENT_REMOUNT causing REPEATED_IMAGE_REFETCH.
//
// The fix keeps the overlay mounted underneath the subtool. No cache of any
// kind is introduced -- the already-decoded <img> simply is not destroyed.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const drawingLayer = read('components/collabboard/editors/ImageDrawingLayer.tsx');
const cropLayer = read('components/collabboard/editors/ImageCropLayer.tsx');
const serveRoute = read('lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts');

function after(source: string, anchor: string, count = 1400): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

/**
 * The LIVE image overlay only.
 *
 * FreeformPadletCards also contains an older per-card image toolbar behind a
 * `{false && ...}` guard, with its own onDrawOnTop and its own close buttons.
 * Anchoring on the first match in the file would test dead code, so every
 * overlay assertion is scoped to the portalled subtree.
 */
function overlaySubtree(): string {
  const start = freeform.indexOf('{imageToolbarPadletId && createPortal(');
  expect(start, 'portal anchor not found').toBeGreaterThan(-1);
  const end = freeform.indexOf('document.body,', start);
  expect(end, 'portal target not found').toBeGreaterThan(start);
  return freeform.slice(start, end);
}

describe('P20-P26: the overlay is no longer destroyed to open a subtool', () => {
  it('P20: the measured precondition -- the private route forbids reuse', () => {
    // This is WHY a remount costs a network round-trip rather than a cache hit,
    // and it is deliberately left alone: no-store is the revocation contract.
    expect(serveRoute).toContain("'Cache-Control': 'private, no-store'");
  });

  it('P21,P23: entering a subtool keeps the image overlay mounted', () => {
    const subtree = overlaySubtree();
    const draw = after(subtree, 'onDrawOnTop={() => {', 300);
    const edit = after(subtree, 'onEditImage={() => {', 300);
    // The teardown that caused the refetch is gone from both paths.
    expect(draw).not.toContain('setImageToolbarPadletId(null)');
    expect(edit).not.toContain('setImageToolbarPadletId(null)');
    // ...and closeAllToolbars() must not clear it through the back door.
    expect(draw).toContain('closeAllToolbars({ imageToolbar: true })');
    // The bare call (which clears imageToolbarPadletId) must not be invoked.
    // Matched with the semicolon so the explanatory comment above it does not
    // count as a call site.
    expect(draw).not.toContain('closeAllToolbars();');
  });

  it('P22,P24,P26: returning therefore re-uses the live <img>, with no reload or blank flash', () => {
    // The overlay is rendered from imageToolbarPadletId, which never went null,
    // so returning is a pure visibility change -- there is nothing to re-fetch
    // and nothing to re-decode.
    expect(freeform).toContain('{imageToolbarPadletId && createPortal(');
    expect(freeform).toContain('const activeImageToolbarSrc = resolveImagePostDisplaySrc(activeImageToolbarPadlet);');
  });

  it('P25: the subtools paint ABOVE the retained overlay, so it is covered and inert', () => {
    // Both are body-level now, so their z-indexes are genuinely comparable.
    expect(drawingLayer).toContain('z-[60100]');
    expect(cropLayer).toContain('z-[60100]');
    expect(freeform).toContain('className="fixed inset-0 z-[60000]');
  });

  it('P27: no cache, no storage, and the authenticated route is untouched', () => {
    // The optimisation is "do not destroy the element", not "remember bytes".
    for (const source of [freeform, drawingLayer, cropLayer]) {
      for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'caches.open',
        'createObjectURL', 'getPublicUrl', 'createSignedUrl']) {
        expect(source, forbidden).not.toContain(forbidden);
      }
    }
    // Editing still reads the base image from the same authenticated URL.
    expect(canvasClient).toContain("imageUrl={drawingPadlet.metadata?.imageUrl || ''}");
  });

  it('P28: a normal public Image goes through the identical path -- nothing is type-specific', () => {
    // No branch anywhere on "is this a private/knowledge image".
    for (const source of [freeform, drawingLayer, cropLayer]) {
      expect(source).not.toContain('knowledge-pdf-area');
      expect(source).not.toContain('/api/boards/');
    }
  });
});

describe('the subtools are blocking editors, and can actually paint above the reader', () => {
  it('both are registered, so the Knowledge reader yields for them too', () => {
    /**
     * They are a SEPARATE flag on purpose. isBlockingEditorModalOpen also
     * hides the canvas toolbar, and an accepted contract (knowledgePdfCard 49)
     * requires that bare `isDrawingMode`/`isCropMode` never do that -- on their
     * own they are canvas MODES that leave the canvas usable. A subtool MODAL
     * is the narrower thing: the mode PLUS a padlet to edit, which is exactly
     * the condition each layer renders on.
     */
    const subtool = after(canvasClient, 'const isImageSubtoolModalOpen = useMemo(', 400);
    expect(subtool).toContain('(isDrawingMode && drawingPadlet !== null)');
    expect(subtool).toContain('(isCropMode && cropPadlet !== null)');
    expect(canvasClient).toContain(
      'const isBlockingOverlayOpen = isBlockingEditorModalOpen || isImageSubtoolModalOpen;',
    );

    // The toolbar contract stays intact: neither mode leaks into that flag.
    const toolbarFlag = canvasClient.slice(
      canvasClient.indexOf('const isBlockingEditorModalOpen = useMemo('),
      canvasClient.indexOf('// Guard flag to check if any editor or modal is open'),
    );
    for (const excluded of ['isDrawingMode', 'isCropMode']) {
      expect(toolbarFlag, excluded).not.toContain(excluded);
    }
  });

  it('both escape CanvasViewport\'s isolation boundary by portalling to <body>', () => {
    // They render inside the isolated canvas subtree, so before R6D no z-index
    // could raise them above the root-level reader -- the same defect R6C
    // fixed for the image overlay, still open for the subtools.
    for (const [name, source] of [['drawing', drawingLayer], ['crop', cropLayer]] as const) {
      expect(source, name).toContain("import { createPortal } from 'react-dom';");
      expect(source, name).toContain('return createPortal(');
      expect(source, name).toContain('document.body,');
      // The old contained z-index is gone.
      expect(source, name).not.toContain('inset-0 bg-black flex overflow-hidden');
      expect(source, name).not.toMatch(/fixed inset-0[^"]*z-\[200\]/);
    }
  });

  it('PATCH 9M\'s isolation guarantee itself is still expressed where it belongs', () => {
    expect(after(canvasClient, '<CanvasViewport', 2000)).toContain("isolation: 'isolate',");
  });

  it('R6C\'s shared backdrop dismissal is untouched -- no naive onClick returned', () => {
    expect(freeform).toContain('useBackdropDismiss(');
    const subtree = overlaySubtree();
    expect(subtree).toContain('{...imageOverlayBackdropDismiss}');
    // Scoped to the live overlay: unrelated close BUTTONS elsewhere legitimately
    // call setImageToolbarPadletId(null) on a direct click.
    expect(subtree.slice(0, subtree.indexOf('gridTemplateColumns')))
      .not.toContain('onClick={() => setImageToolbarPadletId(null)}');
  });
});
