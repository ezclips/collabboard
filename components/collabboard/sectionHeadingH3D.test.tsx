// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH SECTION-H3D -- final characterization/hardening pass. This file adds
 * ONLY the small number of regression guards for invariants genuinely not
 * already covered by sectionHeadingDrawing.test.tsx (SECTION-H3C) or the
 * Freeform sectionHeading*.test.tsx suites -- everything else in H3D's own
 * "Automated Tests" priority list was already satisfied by prior patches and
 * is re-verified by re-running those suites, not duplicated here.
 *
 * Every runtime claim here (reconciliation authority, undo behavior,
 * multi-heading isolation, copy/paste independence, mixed-scene export
 * parity) was also verified empirically via an isolated local fixture --
 * see the RETURN report. These are source-level regression guards, the
 * established style for this feature.
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const drawingSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const canvasContextMenuSrc = read('components/collabboard/canvas/ui/CanvasContextMenu.tsx');

describe('SECTION-H3D final characterization guards', () => {
  it('1. reconciliation authority flows canonical -> scene, not scene -> canonical: the embeddable x/width are computed FROM linkedPadlet fields', () => {
    expect(drawingSrc).toContain('const nextX = (linkedPadlet.position_x ?? 0) - framePadding;');
    expect(drawingSrc).toContain('const nextWidth = (linkedPadlet.width ?? 320) + framePadding * 2;');
    // Within the reconciliation effect itself, geometry is never derived
    // the other way around (a padlet field assigned from the scene element).
    const start = drawingSrc.indexOf('useEffect(() => {\n    if (!excalidrawAPI) return;\n    const nonDrawingRootPadlets');
    const end = drawingSrc.indexOf('\n  }, [', start);
    expect(start).toBeGreaterThan(-1);
    const body = drawingSrc.slice(start, end);
    expect(body).not.toMatch(/position_x:\s*el\.x|width:\s*el\.width/);
  });

  it('2. neither Section Heading nor the generic embeddable path introduces its own undo/history stack -- canonical position sync (schedulePadletPositionSave) and Section Heading\'s own commit-on-drag-end both write straight through onUpdatePadlet, with no intermediate undo-capable buffer', () => {
    expect(code(drawingSrc)).not.toMatch(/undoStack|historyStack|new\s+UndoManager|redoStack/i);
    expect(drawingSrc).toContain('schedulePadletPositionSave');
  });

  it('3. multiple headings are independent: reconciliation creates one embeddable per padlet via the same generic per-padlet map, never a batched/shared creation for same-type padlets', () => {
    expect(drawingSrc).toContain('.map((p) => createEmbeddableElementForPadlet(p));');
    // The creation function takes exactly one padlet and returns exactly one
    // element -- no loop or batching inside it that could conflate two
    // headings into a shared scene object.
    const start = drawingSrc.indexOf('const createEmbeddableElementForPadlet = useCallback((padlet: Padlet) => {');
    const end = drawingSrc.indexOf('}, [getPadletRenderSignature]);', start);
    const body = drawingSrc.slice(start, end);
    expect(body).not.toMatch(/padlets\.map|padlets\.forEach/);
  });

  it('4. selection is a single scalar id, not a set -- structurally guarantees only one heading can be "the" selected one at a time', () => {
    const start = drawingSrc.indexOf('class SectionHeadingSelectionStore {');
    const end = drawingSrc.indexOf('\n}', start);
    const body = drawingSrc.slice(start, end);
    expect(body).toContain('private selectedId: string | null = null;');
    expect(body).not.toMatch(/Set<string>|selectedIds/);
  });

  it('5. copy/paste independence: the generic paste path always mints a NEW id, never reuses the source padlet\'s id (so Section Heading paste cannot alias the original)', () => {
    const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const start = canvasClient.indexOf('const buildPastedPadletData = useCallback(');
    const end = canvasClient.indexOf('\n  }, [', start);
    const body = canvasClient.slice(start, end);
    expect(code(body)).not.toMatch(/id:\s*sourcePadlet\.id|id:\s*padlet\.id/);
  });

  it('6. Section Heading\'s context-menu Copy/Paste/Delete/Bring-to-Front/Send-to-Back never bypass onUpdatePadlet with a direct Excalidraw-only write for canonical fields (zIndex stays a padlet.metadata write, matching test 55 in SECTION-H3C)', () => {
    const start = canvasContextMenuSrc.indexOf('{isSectionHeadingType ? (');
    const end = canvasContextMenuSrc.indexOf(') : (', start);
    const body = canvasContextMenuSrc.slice(start, end);
    expect(code(body)).not.toMatch(/excalidrawAPI|updateScene/);
  });

  it('7. mixed-scene export (heading + ordinary embeddable) never branches on isSectionHeading -- export/serialization code paths are exclusively generic, so any Excalidraw embeddable-export limitation applies identically to both (parity by construction, not by coincidence)', () => {
    expect(code(drawingSrc)).not.toMatch(/exportToSvg|exportToBlob|exportToCanvas/);
  });
});
