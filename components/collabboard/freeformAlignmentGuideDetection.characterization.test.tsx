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
    const detectionCall = slice(singlePostBlock, 'const verticalMatch = detectVerticalAlignmentMatch(', ');');
    expect(detectionCall).toContain('{ x: previewX, width: dragSize.width }');
  });

  it('horizontal detection reads previewY/dragSize.height (the SAME values Snap-to-Grid already produced) -- it does not recompute position', () => {
    const detectionCall = slice(singlePostBlock, 'const horizontalMatch = detectHorizontalAlignmentMatch(', ');');
    expect(detectionCall).toContain('{ y: previewY, height: dragSize.height }');
  });

  it('both detection calls sit AFTER previewX/previewY are computed and BEFORE the setPadlets commit -- ordering guarantees Snap-to-Grid output is untouched', () => {
    const previewIdx = singlePostBlock.indexOf('const previewX = effectiveSnapToGrid ? snapWorldValueToGrid(clampedX) : clampedX;');
    const verticalDetectIdx = singlePostBlock.indexOf('const verticalMatch = detectVerticalAlignmentMatch(');
    const horizontalDetectIdx = singlePostBlock.indexOf('const horizontalMatch = detectHorizontalAlignmentMatch(');
    const setGuidesIdx = singlePostBlock.indexOf('setAlignmentGuides({ verticalX: verticalMatch?.value ?? null, horizontalY: horizontalMatch?.value ?? null });');
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
    expect(singlePostBlock).toContain('setAlignmentGuides({ verticalX: verticalMatch?.value ?? null, horizontalY: horizontalMatch?.value ?? null });');
    // Exactly one `horizontalY:` occurrence in this branch -- the live value
    // above -- there is no stray second write hiding elsewhere in the block.
    expect((singlePostBlock.match(/horizontalY:/g) ?? []).length).toBe(1);
  });

  it('detectVerticalAlignmentMatch and detectHorizontalAlignmentMatch are both imported from the shared geometry module, not reimplemented locally', () => {
    expect(code(hookSrc)).toContain(
      "detectVerticalAlignmentMatch,",
    );
    expect(code(hookSrc)).toContain(
      "detectHorizontalAlignmentMatch,",
    );
    expect(code(hookSrc)).toMatch(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/);
  });
});

describe('PATCH ALIGN-E1 candidate geometry: live DOM measurement, stored value as fallback only', () => {
  const singlePostBlock = slice(
    code(hookSrc),
    'const draggedPadlet = padlets.find((p) => p.id === draggingPadletId);',
    'const handleCanvasMouseUp = async',
  );

  it('measureLiveCandidateSize is defined as a standalone helper (same shape as resolveDragRectSize), not inlined into the candidate map', () => {
    expect(code(hookSrc)).toContain('function measureLiveCandidateSize(padletId: string, canvasZoom: number): DragRectSize | null {');
  });

  it('the helper queries the live DOM by [data-padlet-id] and measures via getBoundingClientRect, guarding against a zero/negative zoom the same way the tolerance conversion does', () => {
    const fn = slice(code(hookSrc), 'function measureLiveCandidateSize(', '\n}');
    expect(fn).toContain('document.querySelector<HTMLElement>(`[data-padlet-id="${padletId}"]`)');
    expect(fn).toContain('el.getBoundingClientRect()');
    expect(fn).toContain('canvasZoom > 0 ? canvasZoom : 1');
  });

  it('each OTHER candidate prefers the live measurement and falls back to stored width/height only when it is null (no DOM node, or a degenerate zero-size box)', () => {
    const candidateBlock = slice(singlePostBlock, 'const alignmentCandidates = padlets', '});');
    expect(candidateBlock).toContain('const liveSize = measureLiveCandidateSize(p.id, canvasZoom);');
    expect(candidateBlock).toContain('liveSize?.width ?? (Number(p.width) || DEFAULT_DRAG_RECT_WIDTH)');
    expect(candidateBlock).toContain('liveSize?.height ?? (Number(p.height) || DEFAULT_DRAG_RECT_HEIGHT)');
  });

  it('candidate x/y still come straight from position_x/position_y -- only width/height gained a live-measurement path', () => {
    const candidateBlock = slice(singlePostBlock, 'const alignmentCandidates = padlets', '});');
    expect(candidateBlock).toContain('x: p.position_x || 0,');
    expect(candidateBlock).toContain('y: p.position_y || 0,');
    expect(candidateBlock).not.toMatch(/measureLiveCandidateSize\([^)]*\)\.x/);
    expect(candidateBlock).not.toMatch(/measureLiveCandidateSize\([^)]*\)\.y/);
  });

  it('the DRAGGED post keeps its existing dragSize (resolveDragRectSize/dragRectSizeRef) untouched -- ALIGN-E1 only changed how OTHER posts are measured', () => {
    expect(singlePostBlock).toContain('{ x: previewX, width: dragSize.width }');
    expect(singlePostBlock).toContain('{ y: previewY, height: dragSize.height }');
    expect(singlePostBlock).not.toContain('measureLiveCandidateSize(draggingPadletId');
  });

  it('stored width/height are never mutated -- the live measurement only feeds the transient candidate rect, not padlets state', () => {
    const fn = slice(code(hookSrc), 'function measureLiveCandidateSize(', '\n}');
    expect(fn).not.toMatch(/setPadlets|position_x|position_y/);
  });
});

describe('PATCH ALIGN-E2 adjacency marker wiring: presentation-only, no detector/geometry change', () => {
  const singlePostBlock = slice(
    code(hookSrc),
    'const draggedPadlet = padlets.find((p) => p.id === draggingPadletId);',
    'const handleCanvasMouseUp = async',
  );

  it('alignmentGuideKinds is declared with all four fields, defaulting to no adjacency anywhere', () => {
    expect(code(hookSrc)).toContain(
      'const [alignmentGuideKinds, setAlignmentGuideKinds] = useState<FreeformAlignmentGuideKindState>({',
    );
    const decl = slice(code(hookSrc), 'const [alignmentGuideKinds, setAlignmentGuideKinds] = useState<FreeformAlignmentGuideKindState>({', '});');
    expect(decl).toContain('verticalIsAdjacency: false,');
    expect(decl).toContain('horizontalIsAdjacency: false,');
    expect(decl).toContain('verticalMarkerY: null,');
    expect(decl).toContain('horizontalMarkerX: null,');
  });

  it('setAlignmentGuideKinds derives isAdjacency straight from the Match objects, and the marker position from the DRAGGED post\'s own preview center -- never from a candidate\'s rect', () => {
    const kindsCall = slice(singlePostBlock, 'setAlignmentGuideKinds({', '});');
    expect(kindsCall).toContain('verticalIsAdjacency: verticalMatch?.isAdjacency ?? false,');
    expect(kindsCall).toContain('horizontalIsAdjacency: horizontalMatch?.isAdjacency ?? false,');
    expect(kindsCall).toContain('verticalMarkerY: verticalMatch?.isAdjacency ? previewY + dragSize.height / 2 : null,');
    expect(kindsCall).toContain('horizontalMarkerX: horizontalMatch?.isAdjacency ? previewX + dragSize.width / 2 : null,');
  });

  it('setAlignmentGuideKinds is called AFTER setAlignmentGuides in the same branch -- geometry commits first, presentation metadata follows', () => {
    const guidesIdx = singlePostBlock.indexOf('setAlignmentGuides({ verticalX: verticalMatch?.value ?? null, horizontalY: horizontalMatch?.value ?? null });');
    const kindsIdx = singlePostBlock.indexOf('setAlignmentGuideKinds({');
    expect(guidesIdx).toBeGreaterThan(-1);
    expect(kindsIdx).toBeGreaterThan(guidesIdx);
  });

  it('the ALIGN-D toggle-off effect and the drag-end cleanup both reset alignmentGuideKinds to the same no-adjacency shape as alignmentGuides', () => {
    expect((code(hookSrc).match(/setAlignmentGuideKinds\(\{ verticalIsAdjacency: false, horizontalIsAdjacency: false, verticalMarkerY: null, horizontalMarkerX: null \}\);/g) ?? []).length).toBe(2);
  });

  it('the drag-end cleanup resets alignmentGuideKinds exactly once, alongside (not instead of) alignmentGuides', () => {
    const cleanupBlock = slice(code(hookSrc), 'dragEndInFlightRef.current = false;', 'unlockBodySelection();');
    const guidesCalls = cleanupBlock.match(/setAlignmentGuides\(/g) ?? [];
    const kindsCalls = cleanupBlock.match(/setAlignmentGuideKinds\(/g) ?? [];
    expect(guidesCalls.length).toBe(1);
    expect(kindsCalls.length).toBe(1);
  });

  it('the hook exposes alignmentGuideKinds and its setter from its return object', () => {
    const returnBlock = slice(code(hookSrc), 'return {\n    isDragging,', '\n  };\n}');
    expect(returnBlock).toContain('alignmentGuideKinds,');
    expect(returnBlock).toContain('setAlignmentGuideKinds,');
  });

  it('the group-drag branch never touches alignmentGuideKinds', () => {
    const groupBlock = slice(
      code(hookSrc),
      'if (draggedPadletIds.length > 1) {',
      '\n      return;\n    }',
    );
    expect(groupBlock).not.toMatch(/setAlignmentGuideKinds/);
  });

  it('the underlying detector/geometry call sites are completely untouched by ALIGN-E2 -- same candidates, same tolerance, same *Match functions ALIGN-E1 already used', () => {
    expect(singlePostBlock).toContain('const alignmentCandidates = padlets');
    expect(singlePostBlock).toContain('const liveSize = measureLiveCandidateSize(p.id, canvasZoom);');
    expect(singlePostBlock).toContain(
      'FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX / (canvasZoom > 0 ? canvasZoom : 1)',
    );
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
