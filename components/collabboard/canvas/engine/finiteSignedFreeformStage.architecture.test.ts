import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

const canvas = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const cards = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const camera = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const interactions = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
const graph = read('components/graph/FreeformGraphLayer.tsx');
const line = read('components/collabboard/SimpleLineRenderer.tsx');
const data = read('components/collabboard/canvas/hooks/useCanvasData.ts');
const domain = read('lib/domain/canvas/posts.ts');
const repository = read('lib/infra/canvas/postsRepository.ts');

describe('PATCH 9V.2A: finite signed Freeform stage architecture', () => {
  it('uses the signed dimensions only for the physical native-scroll footprint', () => {
    expect(canvas).toContain('gutterX * 2 + FREEFORM_SIGNED_WORLD_WIDTH * canvasZoom');
    expect(canvas).toContain('gutterY * 2 + FREEFORM_SIGNED_WORLD_HEIGHT * canvasZoom');
  });

  it('places logical zero at the one canonical scaled stage offset', () => {
    expect(canvas).toContain('const freeformWorldOriginLeft = gutterX + FREEFORM_WORLD_ORIGIN_OFFSET_X * canvasZoom;');
    expect(canvas).toContain('const freeformWorldOriginTop = gutterY + FREEFORM_WORLD_ORIGIN_OFFSET_Y * canvasZoom;');
    // PATCH ALIGN-A added a third layer (the alignment-guide foundation)
    // anchored at this SAME canonical origin -- still the one shared
    // reference point, just a third consumer of it.
    expect((canvas.match(/left: freeformWorldOriginLeft,/g) || []).length).toBe(3);
    expect((canvas.match(/top: freeformWorldOriginTop,/g) || []).length).toBe(3);
    expect(cards).toContain('left: worldOriginLeft,');
    expect(cards).toContain('top: worldOriginTop,');
    expect(canvas).toContain('ref={freeformWorldOriginRef}');
  });

  it('keeps raw signed and legacy-positive post coordinates as render coordinates', () => {
    expect(cards).toContain('left: padlet.position_x || 0,');
    expect(cards).toContain('top: padlet.position_y || 0,');
    expect(cards).not.toMatch(/left:\s*Math\.(max|min)/);
    expect(cards).not.toMatch(/top:\s*Math\.(max|min)/);
  });

  it('keeps transformOrigin 0 0 on all Freeform coordinate planes', () => {
    expect((canvas.match(/transformOrigin: '0 0',/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(cards).toContain("transformOrigin: '0 0'");
  });

  it('changes only the initial camera seed; anchored zoom and pan stay native-scroll based', () => {
    // PATCH FREEFORM-ZOOM-B/C legitimately updated this exact seed line
    // (world origin now centers on screen instead of landing at top-left,
    // then generalized to an arbitrary focal world point) -- the rest of
    // this test's invariants (anchored zoom/pan formulas) are unaffected and
    // still pinned below.
    expect(camera).toContain('measuredX / 2 + (initialWorldOriginOffsetX + initialFocalWorldX) * zoomRef.current');
    expect(camera).toContain('measuredY / 2 + (initialWorldOriginOffsetY + initialFocalWorldY) * zoomRef.current');
    expect(camera).toContain('const worldX = (oldScrollLeft + anchorX - gx) / oldZoom;');
    expect(camera).toContain('left: worldX * newZoom + gx - anchorX,');
    expect(camera).toContain('left: (pending?.left ?? container.scrollLeft) + dxWorld * zoom,');
    expect(camera).not.toMatch(/const \[camera[XY]/);
  });

  it('keeps Manual Line pointer conversion byte-equivalent', () => {
    expect(line).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(line).toContain('y: (e.clientY - rect.top) / canvasZoom,');
  });

  it('allows signed Graph presentation without changing its label formula', () => {
    expect(graph).toContain('className="absolute inset-0 h-full w-full overflow-visible"');
    expect(graph).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(graph).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
  });
});

// PATCH 9V.2B replaces 9V.2A's "user placement remains zero-clamped"
// characterization: the signed world is now not just reachable but usable.
// The behavioural proofs live in signedFreeformPostDrag.test.tsx and
// signedFreeformCreation.integration.test.tsx; the assertions below are the
// structural half -- that no entry path was left behind on the old contract,
// and that the bound comes from the canonical geometry module rather than
// literals sprinkled through interaction code.
describe('PATCH 9V.2B: every root placement path uses the signed rect contract', () => {
  const geometryModule = "from '@/components/collabboard/canvas/engine/freeformStageGeometry'";

  it('removes the zero clamp from single-root and multi-root drag [matrix 12-14, 24-25]', () => {
    expect(interactions).not.toContain('Math.max(0, newX)');
    expect(interactions).not.toContain('Math.max(0, newY)');
    expect(interactions).not.toContain('Math.max(0, start.x + dx)');
    expect(interactions).not.toContain('Math.max(0, start.y + dy)');
    expect(interactions).not.toContain('Math.max(0, Math.round(start.x + dragDelta.dx))');
    expect(interactions).not.toContain('Math.max(0, Math.round(start.y + dragDelta.dy))');
    expect(interactions).toContain('clampRectPositionToFreeformBounds({');
    expect(interactions).toContain('clampGroupDragDeltaToFreeformBounds(groupBounds, {');
  });

  it('keeps pointer->world conversion signed and free of placement policy [matrix 32; control D]', () => {
    expect(canvas).toContain('x: Math.round((clientX - origin.left) / canvasZoom),');
    expect(canvas).toContain('y: Math.round((clientY - origin.top) / canvasZoom),');
    // The conversion answers "which world point is under the cursor", never
    // "may an object be stored here" -- so its executable body must not clamp
    // at all, to zero or to the stage bounds. (Sliced from the `return` so
    // the doc comment above it, which names the placement helper precisely to
    // explain the separation, isn't mistaken for a call to it.)
    const start = canvas.indexOf('const getCanvasPointFromClient = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const end = canvas.indexOf('}, [canvasZoom]);', start);
    expect(end).toBeGreaterThan(start);
    const body = canvas.slice(canvas.lastIndexOf('return {', end), end);
    expect(body).toContain('(clientX - origin.left) / canvasZoom');
    expect(body).not.toContain('Math.max');
    expect(body).not.toContain('Math.min');
    expect(body).not.toContain('clampRectPositionToFreeformBounds');
    expect(body).not.toContain('FREEFORM_WORLD_MIN_X');
  });

  it('routes toolbar/menu creation through the rect contract with real dimensions [matrix 33-41]', () => {
    expect(canvas).not.toContain('x: Math.max(0, Math.round(center.x - cardWidth / 2)),');
    expect(canvas).not.toContain('y: Math.max(0, Math.round(center.y - cardHeight / 2)),');
    const start = canvas.indexOf('const getNewPostPosition = useCallback(');
    const body = canvas.slice(start, canvas.indexOf('}, [getCanvasPointFromClient]);', start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('clampRectPositionToFreeformBounds({');
    expect(body).toContain('width: cardWidth,');
    expect(body).toContain('height: cardHeight,');
  });

  it('routes library drop through the rect contract [matrix 43]', () => {
    expect(canvas).not.toContain('position_x: Math.max(0, x),');
    expect(canvas).not.toContain('position_y: Math.max(0, y),');
    expect(canvas).toContain('x: dropPoint.x - content.width / 2,');
    expect(canvas).toContain('width: content.width,');
  });

  it('routes HTML5 reposition through the rect contract [matrix 44]', () => {
    expect(canvas).not.toContain('const newX = Math.max(0, dropX - offsetX);');
    expect(canvas).not.toContain('const newY = Math.max(0, dropY - offsetY);');
    expect(canvas).toContain('const { x: newX, y: newY } = clampRectPositionToFreeformBounds({');
    expect(canvas).toContain('x: dropX - offsetX,');
  });

  it('gives child->root detach ONE bounded result for both state and DB [matrix 45, 46; control M]', () => {
    expect(canvas).not.toContain('positionX: Math.max(0, x), positionY: Math.max(0, y)');
    expect(canvas).toContain('x: detachPoint.x - 100, // Center offset approx');
    expect(canvas).toContain('{ postId: padletId, positionX: x, positionY: y, metadata: newMetadata },');
    // The optimistic write and the persisted write must reference the very
    // same x/y bindings -- that identity IS the parity guarantee.
    expect(canvas).toContain('? { ...p, position_x: x, position_y: y, metadata: newMetadata }');
  });

  it('bounds paste, duplicate, synced copy and New Column [matrix 47-51]', () => {
    expect(canvas).toContain('const nextPosition = clampRectPositionToFreeformBounds(');
    expect(canvas).toContain('const duplicatePosition = clampRectPositionToFreeformBounds({');
    expect(canvas).toContain('const syncedCopyPosition = clampRectPositionToFreeformBounds({');
    expect(canvas).toContain('const newColumnPosition = clampRectPositionToFreeformBounds({');
    // The +20 duplicate offset and the paste anchor semantics survive.
    expect(canvas).toContain('x: (sourcePadlet.position_x || 0) + 20,');
    expect(canvas).toContain('x: targetPosition.x + ((sourcePadlet.position_x || 0) - anchorPosition.x),');
    expect(canvas).toContain('x: padlet.position_x + 20,');
  });

  it('imports the bounds instead of restating -5000/15000 at call sites [matrix 11; control N]', () => {
    for (const [label, source] of [['CanvasClient', canvas], ['useCanvasInteractions', interactions]] as const) {
      expect(source, label).toContain(geometryModule);
      expect(source, label).not.toMatch(/-\s*5000/);
      expect(source, label).not.toMatch(/\b15000\b/);
      expect(source, label).not.toContain('FREEFORM_WORLD_MIN_X =');
      expect(source, label).not.toContain('FREEFORM_WORLD_MAX_X =');
    }
    // ...and exactly one import statement from it per file, so a second,
    // divergent geometry source cannot creep in.
    expect((canvas.match(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/g) || []).length).toBe(1);
    expect((interactions.match(/from '@\/components\/collabboard\/canvas\/engine\/freeformStageGeometry'/g) || []).length).toBe(1);
  });

  it('leaves container-overlap detection on the post\'s declared dimensions [matrix 50; Phase 22]', () => {
    expect(interactions).toContain('const hoveredContainer = findContainerOverlappingRect(padlets, draggedRect, draggingPadletId);');
    expect(interactions).toContain('width: Number(draggedPadlet?.width) || DEFAULT_DRAG_RECT_WIDTH,');
    expect(interactions).toContain('height: Number(draggedPadlet?.height) || DEFAULT_DRAG_RECT_HEIGHT,');
  });
});

// PATCH 9V.2B Phases 19-20: three other files still floor positions at zero.
// None of them is on the live dashboard Freeform path, so this patch does not
// convert them -- but it does pin down WHY, so the next reader does not have
// to re-derive it (and notices immediately if one of them becomes live).
describe('PATCH 9V.2B: legacy zero-clamping placement code, characterized not converted [Phase 19, 20]', () => {
  const importersOf = (needle: string) => {
    const roots = ['app', 'components', 'hooks', 'lib'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'excalidraw_fork') continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf8').includes(needle)) {
            hits.push(path.relative(process.cwd(), full).replace(/\\/g, '/'));
          }
        }
      }
    };
    for (const root of roots) walk(path.join(process.cwd(), root));
    return hits;
  };

  it('createPadletFromTemplate is dead code -- no production caller exists [Phase 19]', () => {
    const templates = read('lib/PadletTemplates.ts');
    expect(templates).toContain('position_x: Math.round(Math.max(0, position.x)),');
    // Only its own definition site mentions it, so converting it would be
    // scope expansion with no behavioural effect.
    expect(importersOf('createPadletFromTemplate')).toEqual(['lib/PadletTemplates.ts']);
  });

  it('both legacy PadletComponents sit behind an unmounted renderer tree [Phase 20]', () => {
    expect(read('components/collabboard/PadletComponent.tsx')).toContain('position_x: Math.max(0, newX),');
    expect(read('components/collabboard/canvas/PadletComponent.tsx')).toContain('position_x: Math.max(0, newX),');
    // components/collabboard/PadletComponent.tsx has no importer at all.
    expect(importersOf("from './PadletComponent'")).toEqual([]);
    // The canvas/ one is reachable only via LiveCanvas, which nothing mounts;
    // the live dashboard Freeform path is CanvasClient -> FreeformPadletCards.
    expect(importersOf('LiveCanvas').some((file) => file.endsWith('app/dashboard/canvas/[id]/CanvasClient.tsx'))).toBe(false);
    expect(canvas).toContain('<FreeformPadletCards');
  });
});

describe('PATCH 9V.2B: camera, Line, world and data freezes [matrix 59-61, 64-71]', () => {
  it('makes NO change to camera formulas or the signed-stage seed [control F]', () => {
    expect(camera).not.toContain('clampRectPositionToFreeformBounds');
    expect(camera).not.toContain('freeformStageGeometry');
    expect(camera).toContain('const worldX = (oldScrollLeft + anchorX - gx) / oldZoom;');
    expect(camera).toContain('left: worldX * newZoom + gx - anchorX,');
    // PATCH FREEFORM-ZOOM-B/C legitimately updated the seed line itself (see
    // the dedicated centering test above) -- the anchored zoom/pan formulas
    // this control actually guards are unaffected.
    expect(camera).toContain('measuredX / 2 + (initialWorldOriginOffsetX + initialFocalWorldX) * zoomRef.current');
    expect(camera).toContain('left: (pending?.left ?? container.scrollLeft) + dxWorld * zoom,');
  });

  it('makes NO change to Manual Line pointer math [matrix 59; control I]', () => {
    expect(line).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(line).toContain('y: (e.clientY - rect.top) / canvasZoom,');
    expect(line).not.toContain('clampRectPositionToFreeformBounds');
    expect(line).not.toContain('FREEFORM_WORLD_MIN_X');
  });

  it('makes NO change to Graph routing/label math [matrix 52, 53; control H]', () => {
    expect(graph).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(graph).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
    expect(graph).toContain('className="absolute inset-0 h-full w-full overflow-visible"');
    expect(graph).not.toContain('clampRectPositionToFreeformBounds');
  });

  it('renders selection, toolbars and world-space geometry without a world>=0 assumption [matrix 58]', () => {
    // The post stage places cards at their raw signed coordinate, and every
    // overlay (selection ring, card/image/caption toolbars, colour pickers)
    // positions itself from a live getBoundingClientRect() in SCREEN space --
    // which is sign-agnostic by construction. The guard that keeps it that
    // way is simply that no coordinate here is ever floored.
    expect(cards).not.toContain('Math.max(0');
    expect(cards).toContain('left: padlet.position_x || 0,');
    expect(cards).toContain('top: padlet.position_y || 0,');
  });

  it('keeps the signed stage and logical origin exactly where 9V.2A put them [control G, L]', () => {
    expect(canvas).toContain('gutterX * 2 + FREEFORM_SIGNED_WORLD_WIDTH * canvasZoom');
    expect(canvas).toContain('const freeformWorldOriginLeft = gutterX + FREEFORM_WORLD_ORIGIN_OFFSET_X * canvasZoom;');
    expect(cards).toContain('left: padlet.position_x || 0,');
    expect(cards).toContain('top: padlet.position_y || 0,');
  });

  it('never normalizes stored coordinates on load or realtime [matrix 67-71; control J, K]', () => {
    // Placement bounds apply to user mutations only. Legacy rows -- negative
    // historical ones and any beyond 15000 -- must load back byte-for-byte.
    // useCanvasData owns BOTH the initial fetch and the realtime channel.
    expect(data).toContain('postgres_changes');
    expect(data).not.toContain('clampRectPositionToFreeformBounds');
    expect(data).not.toContain('freeformStageGeometry');
    expect(data).not.toMatch(/position_[xy]:\s*Math\.(max|min)/);
    expect(data).not.toMatch(/position_[xy]:\s*Math\.max\(0/);
  });

  it('leaves the schema and the position write path signed-transparent [matrix 66]', () => {
    // z.number() (not z.number().min(0)) and a straight column write: the
    // repository layer neither validates away nor sanitizes a negative.
    expect(domain).toContain('positionX: z.number(),');
    expect(domain).toContain('positionY: z.number(),');
    expect(domain).not.toMatch(/position[XY]:\s*z\.number\(\)\.min\(/);
    expect(repository).toContain('position_x: fields.positionX,');
    expect(repository).toContain('position_y: fields.positionY,');
    expect(repository).not.toContain('Math.max(0,');
  });
});
