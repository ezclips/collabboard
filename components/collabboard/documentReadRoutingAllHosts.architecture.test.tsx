import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// PATCH 9D.1 -- completes PATCH 9D's Document-child Read routing across
// every live host that can render a Container. WallCanvas.tsx, RowLane.tsx,
// ColumnsCanvasRow.tsx, and PostPopup.tsx (Map) each had a "RENDERED BUT
// DEAD" bug: their own onOpenDocument closure discarded the child argument
// RowColumnContainerCard actually passes and substituted the CONTAINER post
// instead (`() => onOpenDocument(post)` where `post` is the container in
// that scope) -- since a Container is never itself a Document,
// selectDocumentModalDestination always returned null for it, so Read
// rendered but silently did nothing. ChronoTimelineCanvas.tsx and the
// Scheduler popover (inline in CanvasClient.tsx) had no onOpenDocument prop
// at all -- Read never rendered there. DrawingLayout.tsx and
// FreeformPadletCards.tsx (PATCH 9D) were already correct and are asserted
// here only as a regression guard.
//
// These hosts (WallCanvas, RowLane, ColumnsCanvasRow, DnD-heavy) are not
// mounted directly here -- Map's equivalent fix is proven with a real mount
// in PostPopup.documentReadRouting.test.tsx; these are proven at the source
// level, the established convention this whole patch series uses for large,
// DnD-heavy production components (see documentSwitchGuard.source.test.ts).

const wallSrc = read('components/canvas/WallCanvas.tsx');
const rowLaneSrc = read('components/collabboard/row/RowLane.tsx');
const columnsCanvasRowSrc = read('components/canvas/layouts/ColumnsCanvasRow.tsx');
const drawingLayoutSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
const chronoSrc = read('components/canvas/ChronoTimelineCanvas.tsx');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

describe('PATCH 9D.1: the wrong-target bug is fixed in every host that had it', () => {
  it('WallCanvas.tsx no longer discards the child argument for its RowColumnContainerCard onOpenDocument', () => {
    expect(wallSrc).not.toMatch(/onOpenDocument=\{onOpenDocument \? \(\) => onOpenDocument\(padlet\) : undefined\}/);
    expect(wallSrc).toContain('onOpenDocument={onOpenDocument}');
  });

  it('RowLane.tsx no longer discards the child argument for its RowColumnContainerCard onOpenDocument', () => {
    // The correct, unrelated PostCardContent usage (root-level Document card,
    // where `post` genuinely IS the document) must remain untouched.
    expect(rowLaneSrc).toContain("onOpenDocument={onOpenDocument ? () => onOpenDocument(post) : undefined} hideOwnTitle={hasTitle} />");
    const containerBlockStart = rowLaneSrc.indexOf('<RowColumnContainerCard');
    const containerBlockEnd = rowLaneSrc.indexOf('/>', containerBlockStart);
    expect(rowLaneSrc.slice(containerBlockStart, containerBlockEnd)).toContain('onOpenDocument={onOpenDocument}');
    expect(rowLaneSrc.slice(containerBlockStart, containerBlockEnd)).not.toContain('() => onOpenDocument(post)');
  });

  it('ColumnsCanvasRow.tsx no longer discards the child argument for its RowColumnContainerCard onOpenDocument', () => {
    // The correct, unrelated PostCardContent usage (root-level Document card,
    // where `post` genuinely IS the document) must remain untouched.
    const postCardStart = columnsCanvasRowSrc.indexOf('<PostCardContent');
    const postCardEnd = columnsCanvasRowSrc.indexOf('/>', postCardStart);
    expect(columnsCanvasRowSrc.slice(postCardStart, postCardEnd)).toContain('onOpenDocument={onOpenDocument ? () => onOpenDocument(post) : undefined}');

    const containerBlockStart = columnsCanvasRowSrc.indexOf('<RowColumnContainerCard');
    const containerBlockEnd = columnsCanvasRowSrc.indexOf('/>', containerBlockStart);
    expect(columnsCanvasRowSrc.slice(containerBlockStart, containerBlockEnd)).toContain('onOpenDocument={onOpenDocument}');
    expect(columnsCanvasRowSrc.slice(containerBlockStart, containerBlockEnd)).not.toContain('() => onOpenDocument(post)');
  });

  it('PostPopup.tsx (Map) no longer discards the child argument for its RowColumnContainerCard onOpenDocument', () => {
    const src = read('components/map/PostPopup.tsx');
    const containerBlockStart = src.indexOf('<RowColumnContainerCard');
    const containerBlockEnd = src.indexOf('/>', containerBlockStart);
    expect(src.slice(containerBlockStart, containerBlockEnd)).toContain('onOpenDocument={onOpenDocument}');
    expect(src.slice(containerBlockStart, containerBlockEnd)).not.toContain('() => onOpenDocument(post)');
    // The correct, unrelated PostCardContent usage (root-level Document card) is untouched.
    expect(src).toContain('onOpenDocument={onOpenDocument ? () => onOpenDocument(post) : undefined} accessMode={accessMode} />');
  });
});

describe('PATCH 9D.1: previously-missing hosts now receive onOpenDocument end-to-end', () => {
  it('ChronoTimelineCanvas.tsx accepts onOpenDocument and forwards it to RowColumnContainerCard', () => {
    expect(chronoSrc).toContain('onOpenDocument?: (padlet: Padlet) => void;');
    const containerBlockStart = chronoSrc.indexOf('<RowColumnContainerCard');
    const containerBlockEnd = chronoSrc.indexOf('/>', containerBlockStart);
    expect(chronoSrc.slice(containerBlockStart, containerBlockEnd)).toContain('onOpenDocument={onOpenDocument}');
  });

  it('CanvasClient.tsx wires ChronoTimelineCanvas with the canonical openDocumentFromPreview callback', () => {
    const chronoCallStart = canvasClientSrc.indexOf('<ChronoTimelineCanvas');
    const chronoCallEnd = canvasClientSrc.indexOf('/>', canvasClientSrc.indexOf('onOpenTarget={canUseFreeformEditButton ? openPadletTargetFromContextMenu : undefined}', chronoCallStart));
    const block = canvasClientSrc.slice(chronoCallStart, chronoCallEnd);
    expect(block).toContain('onOpenDocument={openDocumentFromPreview}');
  });

  it('the Scheduler popover\'s RowColumnContainerCard now receives the canonical onOpenDocument callback', () => {
    const popoverStart = canvasClientSrc.indexOf('{isSchedulerLayout && schedulerPopoverPadletId && (');
    const popoverEnd = canvasClientSrc.indexOf('className="w-full bg-white p-4"', popoverStart);
    const block = canvasClientSrc.slice(popoverStart, popoverEnd);
    expect(block).toContain('onOpenDocument={openDocumentFromPreview}');
  });
});

describe('PATCH 9D.1: previously-working hosts are unchanged (regression guard)', () => {
  it('DrawingLayout.tsx already correctly passed onOpenDocument through -- untouched by this patch', () => {
    const matches = drawingLayoutSrc.match(/onOpenDocument=\{onOpenDocument\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    // Read must never trigger Excalidraw drag/pan: the content wrapper's
    // existing pointerdown-stop guard is untouched.
    expect(drawingLayoutSrc).toContain("onPointerDown={(e) => e.stopPropagation()}");
  });

  it('FreeformPadletCards.tsx (PATCH 9D) still wires the canonical callback, untouched', () => {
    const containerStart = freeformSrc.indexOf("{padlet.type === 'container' && (");
    const containerEnd = freeformSrc.indexOf('/>', freeformSrc.indexOf('onOpenDocument={(child)', containerStart));
    const block = freeformSrc.slice(containerStart, containerEnd);
    expect(block).toContain('selectDocumentModalDestination(child, canUseFreeformEditButton)');
    expect(block).toContain('requestOpenDocument(child, destination)');
  });
});

describe('PATCH 9D.1: architecture guards', () => {
  it('every newly-wired host ultimately reuses selectDocumentModalDestination + requestOpenDocument -- no new modal', () => {
    for (const src of [wallSrc, rowLaneSrc, columnsCanvasRowSrc, chronoSrc]) {
      expect(src).not.toContain('ContainerDocumentModal');
      expect(src).not.toContain('EmbeddedDocumentViewer');
      expect(src).not.toContain('openEmbeddedDocument');
      expect(src).not.toContain('openMapDocument');
      expect(src).not.toContain('openDrawingDocument');
      expect(src).not.toContain('openRowDocument');
    }
  });

  it('CanvasClient.tsx openDocumentFromPreview remains the single canonical function every layout host is wired to', () => {
    const start = canvasClientSrc.indexOf('const openDocumentFromPreview = (post: Padlet) => {');
    const body = canvasClientSrc.slice(start, canvasClientSrc.indexOf('};', start));
    expect(body).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    expect(body).toContain('requestOpenDocument(post, destination)');
    // Every layout host below CanvasClient.tsx (Wall/Row-Grid/Columns/
    // Drawing/Map/Timeline) plus the Scheduler popover receives this exact
    // same function reference.
    const wiredCount = (canvasClientSrc.match(/onOpenDocument=\{openDocumentFromPreview\}/g) ?? []).length;
    expect(wiredCount).toBe(7); // Columns, RowCanvasDnD/Grid, Wall, Drawing, Map, Timeline, Scheduler popover
  });

  it('readonly permission is never confused with Read availability: destination choice (editor vs viewer) is the only thing canUseFreeformEditButton affects', () => {
    const start = canvasClientSrc.indexOf('const openDocumentFromPreview = (post: Padlet) => {');
    const body = canvasClientSrc.slice(start, canvasClientSrc.indexOf('};', start));
    expect(body).not.toMatch(/if \(!canUseFreeformEditButton\) return;/);
  });
});

describe('PATCH 9D.1: chrome, title, content, and comment freezes hold', () => {
  it('resolveChildCardChrome (PATCH 9D) is untouched', () => {
    const src = read('lib/domain/canvas/documentPost.ts');
    expect(src).toContain('export function resolveChildCardChrome');
    expect(src).toContain("backgroundColor: (child.metadata as any)?.backgroundColor || '#ffffff'");
  });

  it('per-child title visibility (PATCH 9C.1) is untouched', () => {
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    expect(helper).toContain('export function getEffectiveVisibleChildTitleIds');
    expect(helper).toContain('export function resolveVisibleChildTitle');
  });

  it('Group into Column (PATCH 9A) is untouched', () => {
    const src = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(src).toContain('const newMetadata = { ...post.metadata, parentId: containerId };');
  });
});
