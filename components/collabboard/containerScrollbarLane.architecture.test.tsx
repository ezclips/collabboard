import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const rowColumnSrc = read('components/collabboard/RowColumnContainerCard.tsx');
const postCardSrc = read('components/collabboard/PostCardContent.tsx');
const hookSrc = read('components/collabboard/useScrollbarLane.ts');

describe('PATCH 9E.1: no guessed constant remains -- the scrollbar lane is derived from measurement', () => {
  it('no hardcoded pixel overshoot (6, or any other guessed value) remains in either Container renderer', () => {
    for (const src of [rowColumnSrc, postCardSrc]) {
      expect(src).not.toMatch(/calc\(100% \+ \d+px\)/);
      expect(src).not.toMatch(/marginRight:\s*"-\d+px"/);
      expect(src).not.toMatch(/"calc\(100% \+ 6px\)"/);
    }
  });

  it('RowColumnContainerCard derives its overshoot from useScrollbarLane, applied via a template literal keyed to the measured value', () => {
    expect(rowColumnSrc).toContain('import { useScrollbarLane } from "./useScrollbarLane";');
    expect(rowColumnSrc).toContain('const scrollbarLane = useScrollbarLane(contentMeasureRef, shouldEnableInternalScroll);');
    expect(rowColumnSrc).toContain('width: `calc(100% + ${scrollbarLane}px)`');
    expect(rowColumnSrc).toContain('marginRight: `-${scrollbarLane}px`');
  });

  it('both viewports keep scrollbar-gutter: stable -- without it the reservation (and therefore the correct measured compensation) would only exist while a scrollbar is actually painting, reintroducing the width jump', () => {
    expect(rowColumnSrc).toContain('scrollbarGutter: "stable"');
    expect(postCardSrc).toContain('scrollbarGutter: "stable"');
  });

  it('PostCardContent nested-Container branch derives its overshoot from its OWN useScrollbarLane call, applied via a template literal', () => {
    expect(postCardSrc).toContain('import { useScrollbarLane } from "./useScrollbarLane";');
    expect(postCardSrc).toContain('const nestedContainerScrollbarLane = useScrollbarLane(nestedContainerScrollRef, type === "container");');
    expect(postCardSrc).toContain('width: `calc(100% + ${nestedContainerScrollbarLane}px)`');
    expect(postCardSrc).toContain('marginRight: `-${nestedContainerScrollbarLane}px`');
  });

  it('the shared hook measures real layout (offsetWidth - clientWidth), not an assumed browser/OS constant', () => {
    expect(hookSrc).toContain('export function computeScrollbarLane(offsetWidth: number, clientWidth: number): number');
    expect(hookSrc).toContain('const gutter = offsetWidth - clientWidth;');
    expect(hookSrc).not.toMatch(/\b(15|16|17)\b/); // no native-scrollbar-width assumption baked in
  });

  it('zero measured gutter applies zero overshoot -- computeScrollbarLane never returns a negative or invented value', () => {
    expect(hookSrc).toContain('return gutter > 0 ? gutter : 0;');
  });
});

describe('PATCH 9E.1: measurement survives resize -- ResizeObserver drives recalculation, not a polling loop', () => {
  it('useScrollbarLane wires a ResizeObserver on the measured element and disconnects it on cleanup', () => {
    expect(hookSrc).toContain('new ResizeObserver(() => measure())');
    expect(hookSrc).toContain('resizeObserver.observe(el)');
    expect(hookSrc).toContain('resizeObserver.disconnect()');
    expect(hookSrc).not.toMatch(/setInterval|setTimeout\(.*measure/);
  });

  it('the hook returns 0 (no compensation) while disabled, matching the non-scrolling CSS state', () => {
    expect(hookSrc).toContain('if (!enabled) {');
    expect(hookSrc).toContain('laneRef.current = 0;');
    expect(hookSrc).toContain('setLane(0);');
  });
});

describe('PATCH 9E.1: the overshoot/gutter styling is applied only to the scroll viewport itself -- no per-child-card override', () => {
  it('no per-child-card width/margin/padding style override was introduced', () => {
    for (const src of [rowColumnSrc, postCardSrc]) {
      expect(src).not.toMatch(/relative border border-gray-(200|100)[^`]*style=\{\{[^}]*width/);
    }
  });

  it('no horizontal-scroll-inducing class was introduced on the Container child-list viewports (pre-existing, unrelated table overflow-x-auto elsewhere in PostCardContent.tsx is untouched)', () => {
    const rowAnchor = rowColumnSrc.indexOf('shouldEnableInternalScroll ? "max-h-[300px]');
    const rowBlock = rowColumnSrc.slice(rowAnchor, rowColumnSrc.indexOf('>', rowColumnSrc.indexOf('scrollbarLane}px', rowAnchor)) + 1);
    expect(rowBlock).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(rowBlock).toContain('overflow-x-hidden');

    const postAnchor = postCardSrc.indexOf('max-h-[260px]');
    const postBlock = postCardSrc.slice(postAnchor, postCardSrc.indexOf('>', postCardSrc.indexOf('nestedContainerScrollbarLane}px', postAnchor)) + 1);
    expect(postBlock).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(postBlock).toContain('overflow-x-hidden');

    // The pre-existing, unrelated Table-post horizontal scroll remains exactly as before.
    expect(postCardSrc).toContain('overflow-x-auto rounded border border-gray-200 bg-white');
  });
});

describe('PATCH 9E.1: header, edit pencil, collapse toggle, and footer are outside the scroll viewport and untouched', () => {
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

describe('PATCH 9E.1: shared component -- every live host inherits the fix automatically, no host duplicates its own scroll geometry', () => {
  const HOST_FILES = [
    'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
    'components/canvas/WallCanvas.tsx',
    'components/collabboard/row/RowLane.tsx',
    'components/canvas/layouts/ColumnsCanvasRow.tsx',
    'components/collabboard/canvas/layouts/DrawingLayout.tsx',
    'components/map/PostPopup.tsx',
    'components/canvas/ChronoTimelineCanvas.tsx',
  ];

  it('no host file reimplements its own max-h/overflow-y-auto child-scroll geometry, or its own scrollbar-lane measurement, for Container children', () => {
    for (const f of HOST_FILES) {
      const src = read(f);
      expect(src, f).not.toContain('max-h-[300px] overflow-y-auto');
      expect(src, f).not.toContain('useScrollbarLane');
    }
  });

  it('CanvasClient.tsx Scheduler popover reuses RowColumnContainerCard directly -- no separate scroll viewport or measurement of its own', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const popoverStart = src.indexOf('{isSchedulerLayout && schedulerPopoverPadletId && (');
    const popoverEnd = src.indexOf('className="w-full bg-white p-4"', popoverStart);
    const block = src.slice(popoverStart, popoverEnd);
    expect(block).not.toContain('max-h-[300px] overflow-y-auto');
    expect(block).not.toContain('useScrollbarLane');
    expect(block).toContain('<RowColumnContainerCard');
  });
});

describe('PATCH 9E.1: nested Container geometry is independent of the outer scroll viewport -- no shared/global measurement state', () => {
  it('each renderer calls useScrollbarLane with its OWN ref -- RowColumnContainerCard measures contentMeasureRef, PostCardContent measures nestedContainerScrollRef', () => {
    expect(rowColumnSrc).toContain('useScrollbarLane(contentMeasureRef, shouldEnableInternalScroll)');
    expect(postCardSrc).toContain('useScrollbarLane(nestedContainerScrollRef, type === "container")');
    // Exactly one call site per file -- not reused/shared across multiple viewports.
    expect(rowColumnSrc.match(/useScrollbarLane\(/g)?.length).toBe(1);
    expect(postCardSrc.match(/useScrollbarLane\(/g)?.length).toBe(1);
  });

  it('the hook itself holds no module-level/singleton state -- each call gets its own useState/useRef instance', () => {
    expect(hookSrc).not.toMatch(/^(let|const)\s+\w+\s*=\s*(0|null);?\s*$/m);
    expect(hookSrc).toContain('const [lane, setLane] = useState(0);');
    expect(hookSrc).toContain('const laneRef = useRef(0);');
  });

  it('PostCardContent nested-Container branch resolves its own children independently of any outer RowColumnContainerCard scroll state', () => {
    const block = postCardSrc.slice(postCardSrc.indexOf('if (type === "container") {'), postCardSrc.indexOf('max-h-[260px]') + 400);
    expect(block).toContain('const childIds = padlet.metadata?.childPadletIds || [];');
    expect(block).not.toContain('contentMeasureRef');
  });
});

describe('PATCH 9E.1: regression freezes hold (9D, 9D.1, 9C.1, 9B, 9A)', () => {
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
    expect(src).not.toContain('useScrollbarLane');
  });
});

describe('PATCH 9E.1: readonly is a pure rendering pass-through -- geometry is not coupled to edit permission', () => {
  it('the scroll-viewport style block does not reference any permission/role/accessMode variable', () => {
    const rowBlock = rowColumnSrc.slice(rowColumnSrc.indexOf('scrollbarGutter: "stable"') - 50, rowColumnSrc.indexOf('scrollbarGutter: "stable"') + 200);
    expect(rowBlock).not.toMatch(/accessMode|canEdit|isReadonly/);
    const postBlock = postCardSrc.slice(postCardSrc.indexOf('scrollbarGutter: "stable"') - 50, postCardSrc.indexOf('scrollbarGutter: "stable"') + 200);
    expect(postBlock).not.toMatch(/accessMode|canEdit|isReadonly/);
  });
});
