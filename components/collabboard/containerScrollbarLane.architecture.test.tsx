import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
const postCardSrc = read('components/collabboard/PostCardContent.tsx');

describe('PATCH 9E: the scrollbar-lane fix is present on the shared scroll viewport, with the pre-fix baseline classes preserved', () => {
  it('RowColumnContainerCard scroll viewport: gutter reservation + width overshoot, existing pr-0.5 and max-height untouched', () => {
    const anchor = rowColumnSrc.indexOf('shouldEnableInternalScroll ? "max-h-[300px]');
    const block = rowColumnSrc.slice(anchor, rowColumnSrc.indexOf('>', rowColumnSrc.indexOf('scrollbarGutter', anchor)) + 1);
    expect(block).toContain('max-h-[300px] overflow-y-auto overflow-x-hidden pr-0.5 space-y-2 scrollbar-ultrathin');
    expect(block).toContain('"space-y-2 pr-0.5"');
    expect(block).toContain('scrollbarGutter: "stable"');
    expect(block).toContain('width: "calc(100% + 6px)"');
    expect(block).toContain('marginRight: "-6px"');
  });

  it('PostCardContent nested-Container branch: same gutter+overshoot technique, existing pr-1 and max-height untouched', () => {
    const anchor = postCardSrc.indexOf('max-h-[260px]');
    const block = postCardSrc.slice(anchor, postCardSrc.indexOf('>', postCardSrc.indexOf('scrollbarGutter', anchor)) + 1);
    expect(block).toContain('max-h-[260px] overflow-y-auto overflow-x-hidden pr-1 space-y-2 scrollbar-ultrathin');
    expect(block).toContain('scrollbarGutter: "stable"');
    expect(block).toContain('width: "calc(100% + 6px)"');
    expect(block).toContain('marginRight: "-6px"');
  });

  it('the overshoot/gutter styling is applied only to the scroll viewport itself -- no per-child-card width/margin/padding override was introduced', () => {
    for (const src of [rowColumnSrc, postCardSrc]) {
      expect(src).not.toMatch(/relative border border-gray-(200|100)[^`]*style=\{\{[^}]*width/);
    }
  });

  it('no horizontal-scroll-inducing class was introduced on the Container child-list viewports (pre-existing, unrelated table overflow-x-auto elsewhere in PostCardContent.tsx is untouched)', () => {
    const rowAnchor = rowColumnSrc.indexOf('shouldEnableInternalScroll ? "max-h-[300px]');
    const rowBlock = rowColumnSrc.slice(rowAnchor, rowColumnSrc.indexOf('>', rowColumnSrc.indexOf('scrollbarGutter', rowAnchor)) + 1);
    expect(rowBlock).not.toMatch(/overflow-x-(auto|scroll)/);

    const postAnchor = postCardSrc.indexOf('max-h-[260px]');
    const postBlock = postCardSrc.slice(postAnchor, postCardSrc.indexOf('>', postCardSrc.indexOf('scrollbarGutter', postAnchor)) + 1);
    expect(postBlock).not.toMatch(/overflow-x-(auto|scroll)/);

    // The pre-existing, unrelated Table-post horizontal scroll remains exactly as before.
    expect(postCardSrc).toContain('overflow-x-auto rounded border border-gray-200 bg-white');
  });
});

describe('PATCH 9E: header, edit pencil, collapse toggle, and footer are outside the scroll viewport and untouched', () => {
  it('RowColumnContainerCard: the header row (title / expand toggle / edit pencil) is rendered before, not inside, the scroll viewport', () => {
    const headerAt = rowColumnSrc.indexOf('{showHeader && !isContentOnly && (');
    const viewportAt = rowColumnSrc.indexOf('ref={contentMeasureRef}');
    expect(headerAt).toBeGreaterThan(-1);
    expect(viewportAt).toBeGreaterThan(headerAt);
    // The expand/collapse button and edit pencil markup is untouched by this patch.
    expect(rowColumnSrc).toContain('aria-label={isExpanded ? "Collapse container" : "Expand container"}');
    expect(rowColumnSrc).toContain('title="Edit Container"');
  });

  it('RowColumnContainerCard: the item-count/comment-count footer sits after the scroll viewport\'s closing content wrapper, unmodified', () => {
    const footerAt = rowColumnSrc.indexOf('{/* Item counter at bottom left - matching wall canvas style */}');
    // `})()}` closes the IIFE that returns the scroll viewport JSX -- the
    // footer must appear textually after this closes, i.e. outside/below the
    // scroll region, not nested as one of its scrollable children.
    const scrollRegionCloseAt = rowColumnSrc.indexOf('})()}');
    expect(scrollRegionCloseAt).toBeGreaterThan(-1);
    expect(footerAt).toBeGreaterThan(scrollRegionCloseAt);
    expect(rowColumnSrc).toContain('{childPadlets.length} {childPadlets.length === 1 ? "item" : "items"}');
  });

  it('PostCardContent nested-Container branch: the item-count footer sits after the scroll viewport, unmodified', () => {
    const footerAt = postCardSrc.indexOf('<div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">');
    const viewportAt = postCardSrc.indexOf('max-h-[260px]');
    expect(footerAt).toBeGreaterThan(viewportAt);
    expect(postCardSrc).toContain('{children.length} {children.length === 1 ? "item" : "items"}');
  });
});

describe('PATCH 9E: shared component -- every live host inherits the fix automatically, no host duplicates its own scroll geometry', () => {
  const HOST_FILES = [
    'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
    'components/canvas/WallCanvas.tsx',
    'components/collabboard/row/RowLane.tsx',
    'components/canvas/layouts/ColumnsCanvasRow.tsx',
    'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    'components/map/PostPopup.tsx',
    'components/canvas/ChronoTimelineCanvas.tsx',
  ];

  it('no host file reimplements its own max-h/overflow-y-auto child-scroll geometry for Container children', () => {
    for (const f of HOST_FILES) {
      const src = read(f);
      // Each host renders RowColumnContainerCard (or wraps it) but does not
      // itself declare a competing scrollbar-ultrathin child-list viewport.
      expect(src, f).not.toContain('max-h-[300px] overflow-y-auto');
    }
  });

  it('CanvasClient.tsx Scheduler popover reuses RowColumnContainerCard directly -- no separate scroll viewport of its own', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const popoverStart = src.indexOf('{isSchedulerLayout && schedulerPopoverPadletId && (');
    const popoverEnd = src.indexOf('className="w-full bg-white p-4"', popoverStart);
    const block = src.slice(popoverStart, popoverEnd);
    expect(block).not.toContain('max-h-[300px] overflow-y-auto');
    expect(block).toContain('<RowColumnContainerCard');
  });
});

describe('PATCH 9E: nested Container geometry is independent of the outer scroll viewport', () => {
  it('the outer (RowColumnContainerCard) and inner (PostCardContent nested-Container) scroll viewports use separate constants scoped to their own element, not a shared/global rule', () => {
    // Each file declares its own literal 6px overshoot inline (not a shared
    // CSS class applied globally) -- so fixing the outer Container's lane
    // cannot accidentally widen or narrow an unrelated overflow region
    // elsewhere on the page.
    expect(rowColumnSrc.match(/width: "calc\(100% \+ 6px\)"/g)?.length).toBe(1);
    expect(postCardSrc.match(/width: "calc\(100% \+ 6px\)"/g)?.length).toBe(1);
  });

  it('PostCardContent nested-Container branch resolves its own children independently of any outer RowColumnContainerCard scroll state', () => {
    const block = postCardSrc.slice(postCardSrc.indexOf('if (type === "container") {'), postCardSrc.indexOf('// --- CONTAINER TYPE ---') + 5000 > postCardSrc.length ? postCardSrc.length : postCardSrc.indexOf('max-h-[260px]') + 400);
    expect(block).toContain('const childIds = padlet.metadata?.childPadletIds || [];');
    expect(block).not.toContain('contentMeasureRef');
  });
});

describe('PATCH 9E: regression freezes hold (9D, 9D.1, 9C.1, 9B, 9A)', () => {
  it('resolveChildCardChrome (PATCH 9D) is untouched', () => {
    const src = read('lib/domain/canvas/documentPost.ts');
    expect(src).toContain('export function resolveChildCardChrome');
    expect(src).toContain("backgroundColor: (child.metadata as any)?.backgroundColor || '#ffffff'");
  });

  it('Document Read routing (PATCH 9D.1) is untouched -- onOpenDocument wiring in RowColumnContainerCard is unchanged', () => {
    expect(rowColumnSrc).toContain('onOpenDocument={onOpenDocument ? () => onOpenDocument(child) : undefined}');
  });

  it('per-child title visibility (PATCH 9C.1) is untouched', () => {
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    expect(helper).toContain('export function getEffectiveVisibleChildTitleIds');
    expect(helper).toContain('export function resolveVisibleChildTitle');
    expect(rowColumnSrc).toContain('resolveVisibleChildTitle(visibleChildTitleIds, child)');
  });

  it('Group into Column (PATCH 9A) is untouched', () => {
    const src = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(src).toContain('const newMetadata = { ...post.metadata, parentId: containerId };');
  });

  it('Container Editor has no scrollbar-lane wiring added -- this patch does not touch it', () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    expect(src).not.toContain('scrollbarGutter');
  });
});

describe('PATCH 9E: readonly is a pure rendering pass-through -- geometry is not coupled to edit permission', () => {
  it('the scroll-viewport style block does not reference any permission/role/accessMode variable', () => {
    const rowBlock = rowColumnSrc.slice(rowColumnSrc.indexOf('scrollbarGutter: "stable"') - 50, rowColumnSrc.indexOf('scrollbarGutter: "stable"') + 150);
    expect(rowBlock).not.toMatch(/accessMode|canEdit|isReadonly/);
    const postBlock = postCardSrc.slice(postCardSrc.indexOf('scrollbarGutter: "stable"') - 50, postCardSrc.indexOf('scrollbarGutter: "stable"') + 150);
    expect(postBlock).not.toMatch(/accessMode|canEdit|isReadonly/);
  });
});
