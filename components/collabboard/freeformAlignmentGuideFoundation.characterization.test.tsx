// @vitest-environment jsdom
// PATCH ALIGN-A: source-string characterization of the Smart Alignment Guide
// FOUNDATION -- following this repo's established convention (see
// freeformDotGridSettings.characterization.test.tsx) for verifying wiring
// inside CanvasClient.tsx / useCanvasInteractions.ts without mounting the
// entire component tree.
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
const clientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const guidesComponentSrc = read('components/collabboard/canvas/ui/FreeformAlignmentGuides.tsx');
const typesSrc = read('types/collabboard.ts');

describe('PATCH ALIGN-A guide state: transient, typed, no persistence', () => {
  it('FreeformAlignmentGuideState is a plain nullable world-coordinate pair, not a Padlet/DB field', () => {
    const block = slice(typesSrc, 'export type FreeformAlignmentGuideState = {', '};');
    expect(block).toContain('verticalX: number | null;');
    expect(block).toContain('horizontalY: number | null;');
  });

  it('the hook owns the state via useState (so it can drive a render) and exposes both the value and its setter', () => {
    expect(code(hookSrc)).toContain(
      'const [alignmentGuides, setAlignmentGuides] = useState<FreeformAlignmentGuideState>({',
    );
    expect(code(hookSrc)).toContain('verticalX: null,');
    expect(code(hookSrc)).toContain('horizontalY: null,');
    const returnBlock = slice(code(hookSrc), 'return {\n    isDragging,', '\n  };\n}');
    expect(returnBlock).toContain('alignmentGuides,');
    expect(returnBlock).toContain('setAlignmentGuides,');
  });

  it('drag-end cleanup resets the guide to { null, null } every time, alongside the other per-gesture refs', () => {
    const cleanupBlock = slice(code(hookSrc), 'dragEndInFlightRef.current = false;', 'unlockBodySelection();');
    expect(cleanupBlock).toContain('setAlignmentGuides({ verticalX: null, horizontalY: null });');
  });

  // PATCH ALIGN-B superseded the two ALIGN-A-scope guards that used to sit
  // here ("nothing calls setAlignmentGuides with a real value" / "the marked
  // region is comment-only") -- ALIGN-B's whole job is to fill that exact
  // spot with real detection. See freeformAlignmentGuideDetection.characterization.test.tsx
  // for ALIGN-B's own contract tests (detection call site, ordering
  // relative to snap math, horizontalY staying null, etc.).
});

describe('PATCH ALIGN-A render layer: world-scaled, pointer-events: none, Freeform-only', () => {
  it('CanvasClient mounts FreeformAlignmentGuides inside the SAME world-origin + scale(canvasZoom) wrapper as the Line planes, gated on isFreeformLayout', () => {
    const layerBlock = slice(
      code(clientSrc),
      'data-freeform-world-layer="alignment-guides"',
      '<FreeformAlignmentGuides guides={alignmentGuides} />',
    );
    expect(layerBlock).toContain('left: freeformWorldOriginLeft,');
    expect(layerBlock).toContain('top: freeformWorldOriginTop,');
    expect(layerBlock).toContain('width: FREEFORM_WORLD_WIDTH_PX,');
    expect(layerBlock).toContain('height: FREEFORM_WORLD_HEIGHT_PX,');
    expect(layerBlock).toContain('transform: `scale(${canvasZoom})`,');
    expect(layerBlock).toContain("pointerEvents: 'none',");
    const gate = slice(code(clientSrc), '{isFreeformLayout && (\n              <div\n                data-freeform-world-layer="alignment-guides"', '</div>\n            )}');
    expect(gate.length).toBeGreaterThan(0);
  });

  it('CanvasClient destructures alignmentGuides straight from useCanvasInteractions -- no separate local state duplicating it', () => {
    const destructure = slice(code(clientSrc), 'const {\n    isDragging,', '} = useCanvasInteractions({');
    expect(destructure).toContain('alignmentGuides,');
    expect(code(clientSrc)).not.toMatch(/useState<FreeformAlignmentGuideState>/);
  });

  it('the guide component itself never touches canvasZoom or pan math -- it only positions in raw world units', () => {
    expect(code(guidesComponentSrc)).not.toMatch(/canvasZoom/);
    expect(code(guidesComponentSrc)).not.toMatch(/getBoundingClientRect/);
  });
});

describe('PATCH ALIGN-A scope: Snap-to-Grid, group drag, Drawing, resize untouched', () => {
  it('snapWorldValueToGrid / FREEFORM_SNAP_GRID_SIZE call sites are unchanged in count and location relative to the new hook-point comment', () => {
    // The snap math itself is byte-identical to pre-patch -- this patch only
    // adds a comment AFTER it, never modifies the snap/clamp lines.
    expect(code(hookSrc)).toContain('const effectiveSnapToGrid = snapToGrid && !altKeyRef.current;');
    // 8 pre-existing call sites (SNAP-GRID-B/C: preview + commit, each for
    // both the single-post and group-drag branches, plus 2 inline in the
    // group branch's dx/dy) -- this patch adds zero more.
    expect((code(hookSrc).match(/snapWorldValueToGrid\(/g) ?? []).length).toBe(8);
  });

  it('no Drawing/Excalidraw reference exists anywhere in the new guide component or its CanvasClient wiring block', () => {
    expect(code(guidesComponentSrc)).not.toMatch(/[Ee]xcalidraw|DrawingLayout/);
    const layerBlock = slice(code(clientSrc), 'data-freeform-world-layer="alignment-guides"', '</div>\n            )}');
    expect(layerBlock).not.toMatch(/[Ee]xcalidraw|DrawingLayout/);
  });

  it('PostResizeHandle / resize commit code is not referenced by the new files', () => {
    expect(code(guidesComponentSrc)).not.toMatch(/PostResizeHandle|commitPostResize|onResizeCommit/);
  });
});
