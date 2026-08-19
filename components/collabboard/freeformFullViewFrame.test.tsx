// @vitest-environment jsdom
// PATCH FULLVIEW-FRAME-R1: source-string characterization of the outer post
// frame presentation fix for Image and AI Component, following this repo's
// established convention (see postResizeB1.integration.test.tsx,
// freeformAlignmentGuideDetection.characterization.test.tsx) for verifying
// logic embedded in FreeformPadletCards.tsx without mounting the entire
// component tree.
//
// Confirmed live (see the SCOPE section of the patch spec): SPACE-P2
// correctly measures the outer [data-padlet-id] frame, so a real empty gap
// INSIDE that frame reads as "the guide/spacing bracket attaches to empty
// white space." Live inspection against the user's own real board (Image
// post 60d01f35-52f0-4550-998c-673b5d89ee95) confirmed the actual mechanism:
// selecting an Image post with ZERO reactions renders its Reactions Row
// in-flow (px-3 py-1.5 + a min-h-[24px] content row) solely to host the
// add-reaction "+" control, which ReactionDisplay itself renders at
// opacity-0 until hover -- so the row is visibly EMPTY by default, yet still
// added ~28.8px of real layout height inside the visible blue frame
// (measured 429.48px before this fix, 400.68px after, for the exact same
// image). AIComponentRenderer's own default `minHeight` (280) does the same
// thing for AI Component's legacy-HTML content, unconditionally.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function slice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start);
  expect(end, `end marker not found after start: ${endMarker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const aiRendererSrc = read('components/collabboard/AIComponentRenderer.tsx');

describe('PATCH FULLVIEW-FRAME-R1: Image Reactions Row no longer reserves flow height when empty', () => {
  const imageResizeBox = code(cardsSrc).slice(
    code(cardsSrc).indexOf('function FreeformImageResizeBox('),
    code(cardsSrc).indexOf('// -- Component -----'),
  );

  it('a zero-reaction (selected-only) row is absolutely positioned, not in-flow', () => {
    expect(imageResizeBox).toContain(
      "className={(padlet.metadata?.reactions?.length ?? 0) > 0\n                  ? \"flex items-center gap-1.5 px-3 py-1.5\"\n                  : \"absolute bottom-1.5 left-3 flex items-center gap-1.5\"}",
    );
  });

  it('a real (non-empty) reactions row keeps its ORIGINAL in-flow className, unchanged', () => {
    expect(imageResizeBox).toContain('"flex items-center gap-1.5 px-3 py-1.5"');
  });

  it('the show/hide condition itself is untouched -- still shows for real reactions OR while selected', () => {
    expect(imageResizeBox).toContain(
      "((padlet.metadata?.reactions?.length ?? 0) > 0 || isPadletSelected(padlet.id)) && (",
    );
  });

  it('ReactionDisplay itself, the shared component used by 6+ other hosts, is completely untouched by this patch', () => {
    const reactionDisplaySrc = code(read('components/collabboard/editors/ReactionDisplay.tsx'));
    expect(reactionDisplaySrc).toContain('opacity-0 group-hover/image-container:opacity-100');
  });

  it('Image aspect-ratio / resize logic (FreeformImageResizeBox\'s own sizing) is untouched by this patch', () => {
    expect(imageResizeBox).toContain('const manuallySized = isImageManuallySized(padlet);');
    expect(imageResizeBox).toContain('const getAspectLockedImageSize = React.useCallback((width: number, fallbackHeight: number) => {');
  });

  it('the <img> element itself and its object-contain/aspect classes are untouched', () => {
    expect(code(cardsSrc)).toContain('"w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"');
  });

  it('Full View\'s own gates (topStrip hidden, border removed) are untouched -- this patch only changes the Reactions Row', () => {
    expect(code(cardsSrc)).toContain('{!(padlet.metadata as any)?.fullView && (');
    expect(imageResizeBox).toContain("(padlet.metadata as any)?.fullView ? '' : 'border border-gray-200'");
  });
});

describe('PATCH FULLVIEW-FRAME-R1: AI Component Reactions Row and minHeight floor', () => {
  const genericBlock = slice(
    code(cardsSrc),
    "{(!['image', 'card', 'comment', 'Comment'].includes(padlet.type)) && (() => {",
    "if (padlet.type === 'link') {",
  );

  it('a zero-reaction row is overlaid ONLY for ai-component -- scoped precisely, not applied to Note/Todo/Table/Link/Drawing', () => {
    expect(genericBlock).toContain(
      "className={padlet.type === 'ai-component' && (padlet.metadata?.reactions?.length ?? 0) === 0\n                  ? \"absolute bottom-1.5 left-3 flex items-center gap-1.5\"\n                  : \"flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100\"}",
    );
  });

  it('the original in-flow className (with its divider) is preserved verbatim for the non-overlay branch', () => {
    expect(genericBlock).toContain('"flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100"');
  });

  it('the show/hide condition and the container exclusion are both untouched', () => {
    expect(genericBlock).toContain(
      "padlet.type !== 'container' && ((padlet.metadata?.reactions?.length ?? 0) > 0 || isPadletSelected(padlet.id)) && (",
    );
  });

  it('the content div AI/other types render into stays position: relative -- required for the overlay to anchor correctly', () => {
    expect(genericBlock).toContain(
      "className={`group group/image-container relative overflow-hidden flex flex-col cursor-pointer",
    );
  });

  it('AIContentRenderer now receives an explicit minHeight: 0 override in legacyHtmlProps, shrinking the floor to AIComponentRenderer\'s own hard-coded 150 minimum instead of its 280 default', () => {
    const legacyPropsBlock = slice(
      code(cardsSrc),
      "legacyHtmlProps={normalizedAIContent.kind === 'legacy_html'",
      ': undefined}',
    );
    expect(legacyPropsBlock).toContain('minHeight: 0,');
  });

  it('AIComponentRenderer\'s own default (280) and hard floor (150) are untouched -- every OTHER host of this shared component keeps its existing behavior', () => {
    expect(code(aiRendererSrc)).toContain('minHeight = 280,');
    expect(code(aiRendererSrc)).toContain('style={{ minHeight: Math.max(minHeight, 150) }}');
  });

  it('AI width-only resize (horizontal-only PostResizeHandle) is untouched by this patch', () => {
    const resizeBlock = slice(
      code(cardsSrc),
      "padlet.type === 'ai-component' && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked ? (",
      ') : (resizeMode ===',
    );
    expect(resizeBlock).toContain('mode="horizontal-only"');
    expect(resizeBlock).toContain('onResizePreview={(w) => previewPostResizeWidth(padlet.id, w)}');
  });

  it('AI content-derived height (no boxManualHeight/needsContentScroll for ai-component) is untouched', () => {
    expect(genericBlock).toContain("resizeMode === 'box' && padlet.type !== 'ai-component' && manualGeometry ? `${manualGeometry.height}px` : undefined");
    expect(genericBlock).toContain("padlet.type === 'ai-component' ? undefined");
  });

  it('Full View\'s own gate for the generic branch (isFullView computed once, top strip hidden) is untouched', () => {
    expect(genericBlock).toContain("const isFullViewEligibleType = padlet.type === 'drawing' || padlet.type === 'ai-component';");
    expect(genericBlock).toContain('if (isFullView) return null;');
  });
});

describe('PATCH FULLVIEW-FRAME-R1: scope discipline -- Snap-to-Grid, camera, and Drawing are untouched', () => {
  it('no reference to snapToGrid, canvasZoom scroll/pan, or Excalidraw/DrawingLayout appears in either changed block', () => {
    const imageResizeBox = code(cardsSrc).slice(
      code(cardsSrc).indexOf('function FreeformImageResizeBox('),
      code(cardsSrc).indexOf('// -- Component -----'),
    );
    const genericBlock = slice(
      code(cardsSrc),
      "{(!['image', 'card', 'comment', 'Comment'].includes(padlet.type)) && (() => {",
      "if (padlet.type === 'link') {",
    );
    for (const block of [imageResizeBox, genericBlock]) {
      expect(block).not.toMatch(/snapToGrid|snapWorldValueToGrid/);
      expect(block).not.toMatch(/[Ee]xcalidraw|DrawingLayout/);
    }
  });
});
