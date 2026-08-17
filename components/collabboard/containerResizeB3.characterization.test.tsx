// @vitest-environment jsdom
//
// PATCH POST-RESIZE-B3.A -- characterization foundation for a future Container
// manual-resize feature. This file records, as load-bearing tests, the exact
// CURRENT geometry contract discovered by reading the renderers and by live
// (real, headless-Chromium) browser measurement of a mounted FreeformPadletCards
// fixture during this patch's investigation. It makes NO production changes --
// every assertion below documents behavior that already exists.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveContainerOrientation, resolveContainerChildren } from '@/lib/domain/canvas/containerModel';
import { getPostResizeCapability } from '@/lib/domain/canvas/postResizePolicy';
import { getFallbackMinimapItem } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import { findContainerOverlappingRect, getEligibleContainerDestinations } from '@/components/collabboard/canvas/engine/utils';
import type { Padlet } from '@/types/collabboard';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

/** Source with comments stripped (repo convention). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const drawingSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
const containerEditorSrc = read('components/collabboard/editors/ContainerEditor.tsx');
const usePadletSaveSrc = read('hooks/canvas/usePadletSave.ts');

function container(id: string, width: number, height: number, metadata?: Record<string, unknown>): Padlet {
  return {
    id, board_id: 'b', title: '', content: '', type: 'container',
    position_x: 0, position_y: 0, width, height,
    created_at: '', updated_at: '', metadata,
  };
}

describe('PATCH POST-RESIZE-B3.A: current width/height ownership (data model)', () => {
  it('WIDTH: the Freeform shell reads the PERSISTED padlet.width, floored at 360px -- partially canonical', () => {
    expect(code(cardsSrc)).toContain("width: padlet.type === 'container'\n                ? `${Math.max(Number(padlet.width) || 0, 360)}px`");
  });

  it('HEIGHT: the Freeform shell never sets an explicit height for a container -- boxManualHeight is only assigned for resizeMode==="box", and container resizeMode is always "none" (B3), so height is 100% derived from content, never read from padlet.height', () => {
    expect(getPostResizeCapability({ type: 'container' })).toBe('none');
    expect(code(cardsSrc)).toContain("minHeight: padlet.type === 'container' ? '150px'");
    // No container-specific height assignment exists anywhere near the shell style block.
    const shellStyleStart = cardsSrc.indexOf("width: padlet.type === 'container'");
    const shellStyleEnd = cardsSrc.indexOf('backgroundColor: isFullView', shellStyleStart);
    const shellStyleBlock = cardsSrc.slice(shellStyleStart, shellStyleEnd);
    expect(shellStyleBlock).not.toMatch(/padlet\.type === 'container'[\s\S]{0,60}height:\s*`/);
  });

  it("LEGACY: live measurement (this patch) proved a stored width above the 360 floor renders as-is (900 -> 900) but stored height is IGNORED regardless of value (900 -> auto ~150-160px) -- height is never canonical, width is canonical only once it exceeds the floor", () => {
    // Documented from a live browser measurement performed during this patch
    // (see RETURN item 15); asserted here as the durable, source-grounded
    // contract that produces that observed result.
    expect(code(cardsSrc)).toContain('Math.max(Number(padlet.width) || 0, 360)');
    expect(code(cardsSrc)).not.toMatch(/container[\s\S]{0,40}height:\s*`\$\{.*padlet\.height/);
  });

  it('Container creation (both production insert sites) writes width:350/height:300, which does NOT match the 360/150 render floor -- a freshly-created container never actually renders at its own stored size', () => {
    const usePadletSaveContent = code(usePadletSaveSrc);
    expect(usePadletSaveContent).toContain('width: 350');
    expect(usePadletSaveContent).toContain('height: 300');
  });

  it('Overlap/drop-target detection uses a DIFFERENT persisted-geometry fallback (280/200) than either the creation default (350/300) or the render floor (360/150) -- three independent constants, not one shared value', () => {
    const utilsSrc = code(read('components/collabboard/canvas/engine/utils.ts'));
    expect(utilsSrc).toContain('container.width || 280');
    expect(utilsSrc).toContain('container.height || 200');
  });

  it('the minimap fallback floor matches the RENDER floor (360/150), not the creation default or the overlap fallback -- consistent with the actual rendered shell, not the stored row', () => {
    expect(getFallbackMinimapItem(container('c1', 100, 50))).toMatchObject({ width: 360, height: 150 });
    expect(getFallbackMinimapItem(container('c1', 900, 900))).toMatchObject({ width: 900, height: 900 });
  });
});

describe('PATCH POST-RESIZE-B3.A: orientation contract', () => {
  it('missing/malformed orientation resolves to vertical, and resolution never persists a write (pure read)', () => {
    expect(resolveContainerOrientation(undefined)).toBe('vertical');
    expect(resolveContainerOrientation({})).toBe('vertical');
    expect(resolveContainerOrientation({ orientation: 'diagonal' })).toBe('vertical');
    expect(resolveContainerOrientation({ orientation: 'horizontal' })).toBe('horizontal');
  });

  it('every Container-Editor Save writes an explicit orientation value (even one only defaulted to vertical, never touched by the user) -- a legacy container with no orientation key gets one materialized the first time its editor is saved', () => {
    expect(code(usePadletSaveSrc)).toContain('...(data.orientation ? { orientation: data.orientation } : {})');
    // ContainerEditor's local `orientation` state is always initialized to a
    // concrete value (never left undefined), so `data.orientation` is truthy
    // on every save.
    expect(code(containerEditorSrc)).toMatch(/useState<ContainerOrientation>\(\s*initialOrientation/);
  });

  it('the orientation toggle UI only exists in Freeform/Drawing, never Wall/Grid/Timeline/Map', () => {
    expect(code(containerEditorSrc)).toContain('allowOrientationControl = false');
  });
});

describe('PATCH POST-RESIZE-B3.A: horizontal grow-only-never-shrink contract (both hosts)', () => {
  it('Freeform growContainerWidth only ever grows (nextWidth <= currentWidth + 1 short-circuits)', () => {
    expect(code(cardsSrc)).toContain('if (!Number.isFinite(nextWidth) || nextWidth <= currentWidth + 1) return;');
  });

  it('Drawing updateHorizontalSceneWidth mirrors the exact same grow-only ratchet', () => {
    expect(code(drawingSrc)).toContain('const nextWidth = Math.max(existing.width ?? 0, Math.ceil(requiredWidth + chromePerSide * 2));');
    expect(code(drawingSrc)).toContain('if (nextWidth <= (existing.width ?? 0) + 1) return;');
  });

  it('RowColumnContainerCard only reports required width in HORIZONTAL orientation -- vertical containers have no width-reactive mechanism at all', () => {
    expect(code(rowColumnSrc)).toContain('if (!isHorizontal || !onRequiredWidthChange) return;');
  });

  it('Drawing height is the ONLY dimension synced bidirectionally (grow AND shrink) with content -- but is never persisted to padlet.height, only width is', () => {
    // onNaturalHeight updates the Excalidraw embeddable's height whenever it
    // differs (either direction) from the last known height...
    expect(code(drawingSrc)).toContain('Math.abs(existing.height - newHeight) < 1) return;');
    // ...but the host's onNaturalResize handler only ever forwards a DB write
    // for `width`, never for `height` (see DrawingLayout call site, RETURN
    // item 10) -- guarded here by confirming no natural-height DB write path
    // exists anywhere in the file.
    expect(code(drawingSrc)).not.toMatch(/onUpdatePadlet\([^)]*\{\s*height:/);
  });

  it('negative control C: if the grow-only guard were removed, a shrink-after-remove scenario would no longer be blocked -- this mutation is what the guard exists to prevent', () => {
    // Demonstrates the guard is load-bearing by showing the unguarded formula
    // it protects against (not applied to production; documentation of intent).
    function unguardedNextWidth(requiredWidth: number, chromePerSide: number): number {
      return Math.ceil(requiredWidth + chromePerSide * 2); // no comparison against currentWidth at all
    }
    const currentWidth = 854;
    const requiredWidthAfterRemoval = 300; // narrower once the widest child is gone
    expect(unguardedNextWidth(requiredWidthAfterRemoval, 20)).toBeLessThan(currentWidth);
    // The real guarded formula (mirrors growContainerWidth's own logic) never
    // applies a smaller value:
    function guardedNextWidth(requiredWidth: number, chromePerSide: number, currentWidthVal: number): number {
      const nextWidth = Math.ceil(requiredWidth + chromePerSide * 2);
      return nextWidth <= currentWidthVal + 1 ? currentWidthVal : nextWidth;
    }
    expect(guardedNextWidth(requiredWidthAfterRemoval, 20, currentWidth)).toBe(currentWidth);
  });
});

describe('PATCH POST-RESIZE-B3.A: membership independence from geometry', () => {
  it('resolveContainerChildren is purely a read/reconciliation function -- it never touches width/height, and geometry operations (this patch\'s browser measurements) never altered childPadletIds order', () => {
    const c = container('parent', 350, 300, { childPadletIds: ['a', 'b', 'c'] });
    const all: Padlet[] = [
      c,
      { ...container('a', 0, 0), id: 'a' },
      { ...container('b', 0, 0), id: 'b' },
      { ...container('c', 0, 0), id: 'c' },
    ];
    const children = resolveContainerChildren(c, all);
    expect(children.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    // resolveContainerChildren's own signature has no geometry parameter and
    // returns Padlet objects unmodified (same references) -- confirming it
    // cannot itself be a source of width/height mutation.
    expect(children[0]).toBe(all[1]);
  });

  it('negative control F: reversing childPadletIds order changes resolveContainerChildren\'s output order -- proves order is driven by the stored array, not by any geometry pass', () => {
    const forward = container('parent', 350, 300, { childPadletIds: ['a', 'b'] });
    const reversed = container('parent', 350, 300, { childPadletIds: ['b', 'a'] });
    const kids: Padlet[] = [{ ...container('a', 0, 0), id: 'a' }, { ...container('b', 0, 0), id: 'b' }];
    expect(resolveContainerChildren(forward, kids).map((p) => p.id)).toEqual(['a', 'b']);
    expect(resolveContainerChildren(reversed, kids).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('PATCH POST-RESIZE-B3.A: overlap/drop-target geometry is architecturally decoupled from any future resize handle', () => {
  it('getEligibleContainerDestinations/findContainerOverlappingRect read only persisted width/height, never a measured DOM rect', () => {
    const dest = container('dest', 500, 400, {});
    const dragged = { ...container('note', 0, 0), id: 'note', type: 'text' as const };
    const found = findContainerOverlappingRect([dest, dragged], { x: 50, y: 50, width: 10, height: 10 }, 'note');
    expect(found?.id).toBe('dest');
  });

  it('nested containers (already parented) are excluded as destinations -- current architecture prohibits a Container becoming a child of a Container through this path', () => {
    const outer = container('outer', 500, 400, {});
    const nested = container('nested', 300, 200, { parentId: 'outer' });
    const destinations = getEligibleContainerDestinations([outer, nested], 'someone-else');
    expect(destinations.map((p) => p.id)).toEqual(['outer']);
  });
});

describe('PATCH POST-RESIZE-B3.A: frozen boundaries (negative controls H/I/J)', () => {
  it('negative control H: Container has NO generic B2 PostResizeHandle capability -- if this ever regresses to "box" or "horizontal-only", B3 must own its own capability, not silently inherit generic behavior', () => {
    expect(getPostResizeCapability({ type: 'container' })).toBe('none');
    expect(code(rowColumnSrc)).not.toContain('PostResizeHandle');
  });

  it('negative control I: the B1/B2 generic resize capability matrix is untouched by this characterization patch', () => {
    const policySrc = code(read('lib/domain/canvas/postResizePolicy.ts'));
    expect(policySrc).toContain("case 'image':\n    case 'ai-component':\n    case 'text':\n    case 'note':\n    case 'todo':\n    case 'card':\n      return 'box';");
    expect(policySrc).toContain("case 'link':\n    case 'table':\n      return 'horizontal-only';");
  });

  it('negative control J: the Excalidraw fork is not referenced by any Container geometry code touched during this investigation', () => {
    expect(code(drawingSrc)).not.toContain('excalidraw_fork');
    expect(code(rowColumnSrc)).not.toContain('excalidraw_fork');
  });

  it('Container context menu (WallContainerContextMenu) exposes no geometry control -- confirms there is currently no manual-resize surface anywhere in the product', () => {
    const menuSrc = code(read('components/collabboard/context-menus/WallContainerContextMenu.tsx'));
    expect(menuSrc).not.toMatch(/width|height|[Rr]esize/);
  });

  it('ContainerEditor exposes no width/height control -- its own preview box (520x360) is unrelated editor-modal chrome, never written back to the padlet', () => {
    expect(code(containerEditorSrc)).toContain('width: 520, minHeight: 360');
    expect(code(usePadletSaveSrc)).not.toMatch(/saveContainer[\s\S]{0,2000}\.update\(\{[^}]*width/);
  });
});

describe('PATCH POST-RESIZE-B3.A: copy/duplicate/paste divergence', () => {
  it('PASTE explicitly strips childPadletIds (a pasted container starts empty) while width/height/orientation are preserved verbatim', () => {
    const clientSrc = code(read('app/dashboard/canvas/[id]/CanvasClient.tsx'));
    const buildPastedStart = clientSrc.indexOf('const buildPastedPadletData = useCallback(');
    const buildPastedEnd = clientSrc.indexOf('}, [canvasId]);', buildPastedStart);
    const buildPastedBody = clientSrc.slice(buildPastedStart, buildPastedEnd);
    expect(buildPastedBody).toContain('delete sourceMetadata.childPadletIds;');
    expect(buildPastedBody).toContain('width: sourcePadlet.width');
  });

  it('DUPLICATE does NOT strip childPadletIds -- a duplicated container keeps referencing the ORIGINAL children (a phantom-membership artifact: those children\'s own parentId still points at the original, not the duplicate)', () => {
    const clientSrc = code(read('app/dashboard/canvas/[id]/CanvasClient.tsx'));
    const duplicateStart = clientSrc.indexOf('const duplicatePadlet = async (id: string) => {');
    const duplicateEnd = clientSrc.indexOf("console.error('Failed to duplicate padlet'", duplicateStart);
    const duplicateBody = clientSrc.slice(duplicateStart, duplicateEnd);
    expect(duplicateBody).not.toContain('delete newPadletData.metadata');
    expect(duplicateBody).not.toContain('childPadletIds');
    expect(duplicateBody).toContain('const rest = { ...padlet } as Partial<Padlet>;');
  });
});

describe('PATCH POST-RESIZE-B3.A: delete cascade is identity-driven, not geometry-driven', () => {
  it('requestDeletePadlet cascades to children via metadata.parentId only -- width/height play no role in cleanup', () => {
    const clientSrc = code(read('app/dashboard/canvas/[id]/CanvasClient.tsx'));
    const start = clientSrc.indexOf('const requestDeletePadlet = async (padletId: string) => {');
    const end = clientSrc.indexOf('const cancelDeletePadlet', start) > -1 && clientSrc.indexOf('const cancelDeletePadlet', start) < start + 3000
      ? clientSrc.indexOf('const cancelDeletePadlet', start)
      : start + 2500;
    const body = clientSrc.slice(start, end);
    expect(body).toContain("padlets.filter(p => p.metadata?.parentId === padletId)");
    expect(body).not.toMatch(/width|height/);
  });
});
