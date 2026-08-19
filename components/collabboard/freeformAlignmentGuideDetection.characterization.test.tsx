// @vitest-environment jsdom
// PATCH ALIGN-B: source-string characterization of vertical alignment guide
// detection's wiring inside useCanvasInteractions.ts -- following this
// repo's established convention (see freeformDotGridSettings.characterization
// .test.tsx) for verifying logic embedded in a large file without mounting
// the entire component tree. Behavioral proof (real drag, real guide values)
// lives in freeformAlignmentGuideDetection.test.tsx and the pure-function
// unit tests in freeformStageGeometry.test.ts.
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

const hookSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
const geometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');

describe('PATCH ALIGN-B detection call site: single-post branch only, after snap, before commit', () => {
  const singlePostBlock = slice(
    code(hookSrc),
    'const draggedPadlet = padlets.find((p) => p.id === draggingPadletId);',
    'const handleCanvasMouseUp = async',
  );

  it('vertical detection reads previewX/dragSize.width (the SAME values Snap-to-Grid already produced) -- it does not recompute position', () => {
    const detectionCall = slice(singlePostBlock, 'const verticalGuideX = detectVerticalAlignmentGuide(', ');');
    expect(detectionCall).toContain('{ x: previewX, width: dragSize.width }');
  });

  it('horizontal detection reads previewY/dragSize.height (the SAME values Snap-to-Grid already produced) -- it does not recompute position', () => {
    const detectionCall = slice(singlePostBlock, 'const horizontalGuideY = detectHorizontalAlignmentGuide(', ');');
    expect(detectionCall).toContain('{ y: previewY, height: dragSize.height }');
  });

  it('both detection calls sit AFTER previewX/previewY are computed and BEFORE the setPadlets commit -- ordering guarantees Snap-to-Grid output is untouched', () => {
    const previewIdx = singlePostBlock.indexOf('const previewX = effectiveSnapToGrid ? snapWorldValueToGrid(clampedX) : clampedX;');
    const verticalDetectIdx = singlePostBlock.indexOf('const verticalGuideX = detectVerticalAlignmentGuide(');
    const horizontalDetectIdx = singlePostBlock.indexOf('const horizontalGuideY = detectHorizontalAlignmentGuide(');
    const setGuidesIdx = singlePostBlock.indexOf('setAlignmentGuides({ verticalX: verticalGuideX, horizontalY: horizontalGuideY });');
    const setPadletsIdx = singlePostBlock.indexOf('setPadlets(prev => prev.map(p =>');
    expect(previewIdx).toBeGreaterThan(-1);
    expect(verticalDetectIdx).toBeGreaterThan(previewIdx);
    expect(horizontalDetectIdx).toBeGreaterThan(verticalDetectIdx);
    expect(setGuidesIdx).toBeGreaterThan(horizontalDetectIdx);
    expect(setPadletsIdx).toBeGreaterThan(setGuidesIdx);
  });

  it('candidates are root posts only (mirrors CanvasClient rootPadlets predicate exactly) and exclude the dragged post by id', () => {
    expect(singlePostBlock).toContain("!p.metadata?.parentId && p.id !== draggingPadletId");
  });

  it('the tolerance is converted from screen px through canvasZoom, guarded against zero/negative zoom, and shared by both axes (computed once)', () => {
    expect(singlePostBlock).toContain(
      'FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX / (canvasZoom > 0 ? canvasZoom : 1)',
    );
    expect((singlePostBlock.match(/FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX \/ \(canvasZoom > 0 \? canvasZoom : 1\)/g) ?? []).length).toBe(1);
  });

  it('both axes are computed independently from the same candidate list and committed together in one setAlignmentGuides call', () => {
    expect(singlePostBlock).toContain('setAlignmentGuides({ verticalX: verticalGuideX, horizontalY: horizontalGuideY });');
    // Exactly one `horizontalY:` occurrence in this branch -- the live value
    // above -- there is no stray second write hiding elsewhere in the block.
    expect((singlePostBlock.match(/horizontalY:/g) ?? []).length).toBe(1);
  });

  it('detectVerticalAlignmentGuide and detectHorizontalAlignmentGuide are both imported from the shared geometry module, not reimplemented locally', () => {
    expect(code(hookSrc)).toContain(
      "detectVerticalAlignmentGuide,",
    );
    expect(code(hookSrc)).toContain(
      "detectHorizontalAlignmentGuide,",
    );
    expect(code(hookSrc)).toMatch(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/);
  });
});

describe('PATCH ALIGN-B scope: group drag, Snap-to-Grid, resize, Drawing untouched', () => {
  it('the group-drag branch (multi-select) never calls detectVerticalAlignmentGuide or setAlignmentGuides with a real value', () => {
    const groupBlock = slice(
      code(hookSrc),
      'if (draggedPadletIds.length > 1) {',
      '\n      return;\n    }',
    );
    expect(groupBlock).not.toMatch(/detectVerticalAlignmentGuide/);
    expect(groupBlock).not.toMatch(/detectHorizontalAlignmentGuide/);
    expect(groupBlock).not.toMatch(/setAlignmentGuides/);
  });

  it('Snap-to-Grid math (previewX/Y derivation) is byte-identical to pre-ALIGN-B: same 8 snapWorldValueToGrid call sites', () => {
    expect((code(hookSrc).match(/snapWorldValueToGrid\(/g) ?? []).length).toBe(8);
    expect(code(hookSrc)).toContain('const effectiveSnapToGrid = snapToGrid && !altKeyRef.current;');
  });

  it('the drag-end cleanup still resets alignmentGuides to null unconditionally, exactly once', () => {
    const cleanupBlock = slice(code(hookSrc), 'dragEndInFlightRef.current = false;', 'unlockBodySelection();');
    const calls = cleanupBlock.match(/setAlignmentGuides\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(cleanupBlock).toContain('setAlignmentGuides({ verticalX: null, horizontalY: null });');
  });

  it('no Drawing/Excalidraw or resize-handle reference exists in either detection function or the call site', () => {
    const verticalFn = slice(geometrySrc, 'export function detectVerticalAlignmentGuide(', '\n}');
    const horizontalFn = slice(geometrySrc, 'export function detectHorizontalAlignmentGuide(', '\n}');
    expect(verticalFn).not.toMatch(/[Ee]xcalidraw|DrawingLayout|PostResizeHandle|commitPostResize/);
    expect(horizontalFn).not.toMatch(/[Ee]xcalidraw|DrawingLayout|PostResizeHandle|commitPostResize/);
    const singlePostBlock = slice(
      code(hookSrc),
      'const draggedPadlet = padlets.find((p) => p.id === draggingPadletId);',
      'const handleCanvasMouseUp = async',
    );
    expect(singlePostBlock).not.toMatch(/[Ee]xcalidraw|DrawingLayout/);
  });

  it('neither detection function has a persistence/network call -- pure geometry only', () => {
    const verticalFn = slice(geometrySrc, 'export function detectVerticalAlignmentGuide(', '\n}');
    const horizontalFn = slice(geometrySrc, 'export function detectHorizontalAlignmentGuide(', '\n}');
    expect(verticalFn).not.toMatch(/updatePostPosition|supabase|await |createPostsRepository/);
    expect(horizontalFn).not.toMatch(/updatePostPosition|supabase|await |createPostsRepository/);
  });
});
