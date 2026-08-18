// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getFallbackMinimapItem } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import { sanitizeClonedPostMetadata } from '@/lib/infra/collabboard/clonedPostMetadata';
import type { Padlet } from '@/types/collabboard';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** Source with comments stripped (repo convention -- see sectionHeading tests). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const handleSrc = read('components/collabboard/canvas/ui/PostResizeHandle.tsx');
const policySrc = read('lib/domain/canvas/postResizePolicy.ts');
const drawingSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const sectionHeadingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const aiRendererSrc = read('components/collabboard/AIComponentRenderer.tsx');
const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts');

describe('PATCH POST-RESIZE-B1 shared handle wiring', () => {
  it('14. the shared handle performs NO canvasZoom arithmetic and imports no host internals', () => {
    expect(code(handleSrc)).not.toMatch(/canvasZoom/);
    expect(code(handleSrc)).not.toMatch(/\/\s*canvasZoom|\/\s*zoom/);
    expect(code(handleSrc)).not.toMatch(/CanvasClient|DrawingLayout|excalidraw|supabase|createPostsRepository/);
  });

  it('13. the handle requires the host clientToWorld converter', () => {
    expect(code(handleSrc)).toContain('clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };');
  });

  it('20/21/22. the handle owns pointer capture, the right-button guard and data-no-drag', () => {
    expect(code(handleSrc)).toContain('setPointerCapture?.(event.pointerId)');
    expect(code(handleSrc)).toContain('event.button === 2');
    expect(code(handleSrc)).toContain('data-no-drag="true"');
  });

  it('24/25. previews never persist; ONE commit call on release', () => {
    expect(code(handleSrc)).toContain('onResizePreview(next.width, next.height)');
    expect(code(handleSrc)).toContain('isMeaningfulPostResize(gesture.startWidth, gesture.startHeight, next)');
    expect(code(handleSrc)).toContain('onResizeCommit(next.width, next.height, gesture.startWidth, gesture.startHeight, mode);');
  });
});

describe('PATCH POST-RESIZE-B1 Freeform wiring', () => {
  it('B1/B2/B3.1 handle mount sites: Image + AI + Container + generic B2 + Document/Clipart', () => {
    const occurrences = code(cardsSrc).split('<PostResizeHandle').length - 1;
    expect(occurrences).toBe(5);
  });

  it('40. the AI grip condition still gates on edit permission and lock', () => {
    expect(code(cardsSrc)).toContain("padlet.type === 'ai-component' && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked");
  });

  it('33/34. the Image grip is selected-only, editable, unlocked', () => {
    expect(code(cardsSrc)).toContain("padlet.type === 'image' && isPadletSelected(padlet.id) && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked");
  });

  it('43. the old duplicate AI handle plumbing is gone (no aiResizeRef, no onResize inside legacyHtmlProps)', () => {
    expect(code(cardsSrc)).not.toContain('aiResizeRef');
    expect(code(cardsSrc)).not.toContain('onResizeEnd');
    expect(code(cardsSrc)).not.toMatch(/onResize: \(w: number, h: number\)/);
    expect(code(cardsSrc)).not.toContain('persistPostFieldsBestEffort');
  });

  it('48. AI commit goes through the honest updatePostFieldsOrThrow with rollback + toast', () => {
    const commit = code(cardsSrc);
    expect(commit).toContain('commitPostResize(padlet.id, w, h, ow, oh)');
    expect(commit).toContain('await updatePostFieldsOrThrow(padletId, {');
    expect(commit).toContain('width: originWidth');
    expect(commit).toContain('height: originHeight');
    expect(commit).toContain("toast.error('Failed to resize post')");
  });

  it('28/31/32. Image rendering switches to canonical geometry only when explicitly resized (PATCH POST-RESIZE-B1.1)', () => {
    // B1.1: finite-positive width/height alone is no longer sufficient --
    // see isImageManuallySized in postResizePolicy.ts.
    expect(code(cardsSrc)).toContain('isImageManuallySized(padlet)');
    expect(code(cardsSrc)).not.toContain('hasValidPostResizeGeometry(padlet.width, padlet.height)');
    expect(code(cardsSrc)).toContain("${Math.max(Number(padlet.width), IMAGE_RESIZE_MIN_WIDTH)}px`");
    expect(code(cardsSrc)).toContain("${Math.max(Number(padlet.height), IMAGE_RESIZE_MIN_HEIGHT)}px`");
    // Legacy fallback stays exactly 360px.
    expect(code(cardsSrc)).toContain(": '360px',");
  });

  it('20. children are frozen: Container child cards carry no resize handle', () => {
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
    expect(code(rowColumnSrc)).not.toContain('data-post-resize-handle');
  });

  it('37. the gesture origin is the ACTUAL rendered rectangle via getStartSize', () => {
    expect(code(cardsSrc)).toContain('imageCardRefs.current[padlet.id]');
    expect(code(cardsSrc)).toContain('el.offsetWidth || 360');
    expect(code(cardsSrc)).toContain('el.offsetHeight || 100');
  });
});

describe('PATCH POST-RESIZE-B1 freezes', () => {
  it('58. PATCH POST-RESIZE-B3.2: Drawing now imports PostResizeHandle, exclusively for its own dedicated, selection-gated Container path -- never the generic B1/B2 one', () => {
    expect(code(drawingSrc)).toContain("import PostResizeHandle from '@/components/collabboard/canvas/ui/PostResizeHandle';");
    expect(code(drawingSrc)).toContain("const isResizableContainer = padlet.type === 'container';");
  });

  it('66. Section Heading keeps its own horizontal-only handles', () => {
    expect(code(sectionHeadingSrc)).not.toContain('PostResizeHandle');
    expect(code(sectionHeadingSrc)).not.toContain('data-post-resize-handle');
    expect(policySrc).toContain("case 'section_heading':");
    expect(policySrc).toContain("return 'horizontal-only';");
  });

  it('65. Container orientation code untouched by B1 (no new shrink/expand behavior in the file)', () => {
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
  });

  it('42/43. AIComponentRenderer retains its opt-in internal handle for other hosts', () => {
    expect(code(aiRendererSrc)).toContain('onResize');
    expect(code(aiRendererSrc)).toContain('onResizeEnd');
  });
});

describe('PATCH POST-RESIZE-B1.1 minimap canonical preference', () => {
  it('36. an explicitly-resized Image (manualSize=true) uses canonical geometry in the fallback', () => {
    const resized: Padlet = {
      id: 'img-1',
      board_id: 'b',
      title: '',
      content: '',
      type: 'image',
      position_x: 0,
      position_y: 0,
      width: 640,
      height: 480,
      created_at: '',
      updated_at: '',
      metadata: { manualSize: true },
    };
    expect(getFallbackMinimapItem(resized)).toMatchObject({ width: 640, height: 480 });
  });

  it('28b. a legacy Image (no stored geometry) keeps the 360 fallback width', () => {
    const legacy: Padlet = {
      id: 'img-2',
      board_id: 'b',
      title: '',
      content: '',
      type: 'image',
      position_x: 0,
      position_y: 0,
      width: 0,
      height: 0,
      created_at: '',
      updated_at: '',
    };
    expect(getFallbackMinimapItem(legacy)).toMatchObject({ width: 360 });
  });

  it('B1.1: a legacy Image with valid generic stored geometry but no manualSize STILL keeps the 360 fallback (minimap/renderer parity)', () => {
    const generic: Padlet = {
      id: 'img-3',
      board_id: 'b',
      title: '',
      content: '',
      type: 'image',
      position_x: 0,
      position_y: 0,
      width: 300,
      height: 200,
      created_at: '',
      updated_at: '',
    };
    expect(getFallbackMinimapItem(generic)).toMatchObject({ width: 360, height: 100 });
  });

  it('B1.1: valid geometry + manualSize=false stays legacy in the fallback', () => {
    const explicitlyFalse: Padlet = {
      id: 'img-4',
      board_id: 'b',
      title: '',
      content: '',
      type: 'image',
      position_x: 0,
      position_y: 0,
      width: 300,
      height: 400,
      created_at: '',
      updated_at: '',
      metadata: { manualSize: false },
    };
    expect(getFallbackMinimapItem(explicitlyFalse)).toMatchObject({ width: 360, height: 100 });
  });

  it('36b. the minimap fallback module imports the shared policy resolver (no separate image condition)', () => {
    expect(code(minimapSrc)).toContain('postResizePolicy');
    expect(code(minimapSrc)).toContain('isImageManuallySized');
  });
});

describe('PATCH POST-RESIZE-B1.1 Image explicit-resize commit + rollback', () => {
  it('no load-time migration: nothing in the render path calls setPadlets/updatePostFieldsOrThrow merely from computing isImageManuallySized', () => {
    // The compatibility check is a pure read (imported into a `style={{...}}`
    // expression); it must never appear inside a mount-time effect that
    // writes geometry/metadata back.
    expect(code(cardsSrc)).not.toMatch(/useEffect\([^)]*isImageManuallySized/);
  });

  it('9. first resize origin uses measured rendered geometry, not stored width/height', () => {
    expect(code(cardsSrc)).toContain('imageCardRefs.current[padlet.id]');
    expect(code(cardsSrc)).toContain('el.offsetWidth || 360');
    expect(code(cardsSrc)).toContain('el.offsetHeight || 100');
    expect(code(cardsSrc)).toContain('getStartSize={() => {');
  });

  it('10. a successful Image resize commit writes metadata.manualSize = true', () => {
    expect(code(cardsSrc)).toContain('void commitPostResize(padlet.id, w, h, ow, oh, { manualSize: true }, padlet.metadata);');
  });

  it('11. the commit preserves every other metadata field via a spread merge, both locally and in the persisted write', () => {
    expect(code(cardsSrc)).toContain('metadata: { ...p.metadata, ...metadataPatch }');
    expect(code(cardsSrc)).toContain('metadata: { ...(originMetadata ?? {}), ...metadataPatch }');
  });

  it('12/13. a failed resize rolls back geometry AND metadata together -- no state where manualSize=true but the resize failed', () => {
    const rollback = code(cardsSrc).match(/catch \(err\) \{[\s\S]*?toast\.error\('Failed to resize post'\);/)?.[0] ?? '';
    expect(rollback).toContain('width: originWidth');
    expect(rollback).toContain('height: originHeight');
    expect(rollback).toContain('metadata: originMetadata');
  });

  it('single write per successful resize: ONE updatePostFieldsOrThrow call site in commitPostResize', () => {
    const commitFn = code(cardsSrc).match(/const commitPostResize = React\.useCallback\(async \([\s\S]*?\}, \[setPadlets, updatePostFieldsOrThrow\]\);/)?.[0] ?? '';
    expect(commitFn.match(/updatePostFieldsOrThrow\(/g)?.length).toBe(1);
  });

  it('20. AI remains independent from the marker -- its commit call site passes no metadataPatch/originMetadata', () => {
    expect(code(cardsSrc)).toContain('onResizeCommit={(w, h, ow, oh) => { void commitPostResize(padlet.id, w, h, ow, oh); }}');
  });
});

describe('PATCH POST-RESIZE-B1.1 Copy / Paste / Duplicate preserve the marker', () => {
  it('14/15/16. sanitizeClonedPostMetadata never strips manualSize', () => {
    const explicit = { manualSize: true, imageUrl: 'x' };
    expect(sanitizeClonedPostMetadata(explicit)).toMatchObject({ manualSize: true });
  });

  it('17. a legacy Image (no manualSize) stays legacy through the sanitizer even with generic width/height on the source padlet', () => {
    const legacy = { imageUrl: 'x' }; // no manualSize -- width/height live on the Padlet itself, copied verbatim by the caller
    const sanitized = sanitizeClonedPostMetadata(legacy);
    expect((sanitized as { manualSize?: boolean }).manualSize).toBeUndefined();
  });

  it('duplicate/paste copy width/height verbatim from the source padlet (the field that carries geometry across a clone)', () => {
    expect(code(cardsSrc) || '').toBeDefined();
    const actionsSrc = read('components/collabboard/canvas/hooks/useCanvasActions.ts');
    expect(code(actionsSrc)).toContain('width: padlet.width');
    expect(code(actionsSrc)).toContain('height: padlet.height');
    expect(code(actionsSrc)).toContain('width: clipboard.width');
    expect(code(actionsSrc)).toContain('height: clipboard.height');
    expect(code(actionsSrc)).toContain('sanitizeClonedPostMetadata(padlet.metadata)');
    expect(code(actionsSrc)).toContain('sanitizeClonedPostMetadata(clipboard.metadata)');
  });
});

// PATCH FREEFORM-IMAGE-R3: bg-gray-50 on the Image media wrapper was already
// present pre-B1, but had never been visible until B1 let users manually
// resize Image to a non-native aspect ratio -- object-contain then
// letterboxes, exposing the gray as visible bars. Removed (not switched to
// object-cover) so the image is never cropped/stretched; geometry, the
// resize handle, and the pointermove-preview/release-commit contract are
// otherwise untouched.
describe('PATCH FREEFORM-IMAGE-R3 Image media wrapper no longer letterboxes gray', () => {
  it('the Image media wrapper no longer carries bg-gray-50', () => {
    const imageMediaWrapperClass = code(cardsSrc).match(
      /"relative overflow-hidden(?: bg-gray-50)? flex items-center justify-center flex-1 min-h-\[100px\]"/,
    );
    expect(imageMediaWrapperClass).not.toBeNull();
    expect(imageMediaWrapperClass![0]).not.toContain('bg-gray-50');
  });

  it('the <img> itself is untouched: still object-contain, never object-cover, never cropped/stretched', () => {
    expect(code(cardsSrc)).toContain('"w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"');
    // The ONLY object-cover on an Image post remains the pre-existing,
    // separate cropToGrid opt-in -- not something this patch introduced or
    // widened.
    expect(code(cardsSrc)).toContain('"w-full object-cover pointer-events-none select-none"');
  });

  it('Image geometry/sizing logic is untouched: same manual-size gate, same minimums, same handle wiring', () => {
    expect(code(cardsSrc)).toContain('width: isImageManuallySized(padlet)');
    expect(code(cardsSrc)).toContain('height: isImageManuallySized(padlet)');
    expect(code(cardsSrc)).toContain('Math.max(Number(padlet.width), IMAGE_RESIZE_MIN_WIDTH)');
    expect(code(cardsSrc)).toContain('Math.max(Number(padlet.height), IMAGE_RESIZE_MIN_HEIGHT)');
  });

  it('persistence contract is untouched: preview is local-only, exactly one commit call on release', () => {
    const imageResizeHandle = code(cardsSrc).slice(
      code(cardsSrc).indexOf("padlet.type === 'image' && isPadletSelected(padlet.id)"),
      code(cardsSrc).indexOf("padlet.type === 'image' && isPadletSelected(padlet.id)") + 900,
    );
    expect(imageResizeHandle).toContain('onResizePreview={(w, h) => previewPostResize(padlet.id, w, h)}');
    expect(imageResizeHandle).toContain('void commitPostResize(padlet.id, w, h, ow, oh, { manualSize: true }, padlet.metadata);');
    // previewPostResize itself must still only touch local React state.
    const previewFn = code(cardsSrc).slice(
      code(cardsSrc).indexOf('const previewPostResize = React.useCallback'),
    );
    const previewFnBody = previewFn.slice(0, previewFn.indexOf('}, [setPadlets]);'));
    expect(previewFnBody).toContain('setPadlets(prev =>');
    expect(previewFnBody).not.toMatch(/await |updatePostFields|createPostsRepository/);
  });
});
