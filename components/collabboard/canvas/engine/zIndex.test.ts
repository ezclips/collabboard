import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveFreeformPostRenderZIndex,
  FREEFORM_DRAGGING_Z_INDEX,
  FREEFORM_SELECTED_INTERACTION_Z_INDEX,
} from './zIndex';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('PATCH POST-RESIZE-B2R.4: resolveFreeformPostRenderZIndex precedence contract', () => {
  it('1. dragging outranks everything, including a selected post', () => {
    expect(resolveFreeformPostRenderZIndex({ persistedZIndex: 9000, isSelected: true, isDragging: true }))
      .toBe(FREEFORM_DRAGGING_Z_INDEX);
    expect(resolveFreeformPostRenderZIndex({ persistedZIndex: 1, isSelected: false, isDragging: true }))
      .toBe(FREEFORM_DRAGGING_Z_INDEX);
  });

  it('2. a selected (non-dragging) post outranks its own ordinary persisted value', () => {
    const persistedZIndex = 1;
    const result = resolveFreeformPostRenderZIndex({ persistedZIndex, isSelected: true, isDragging: false });
    expect(result).toBe(FREEFORM_SELECTED_INTERACTION_Z_INDEX);
    expect(result).toBeGreaterThan(persistedZIndex);
  });

  it('3. an ordinary (unselected, non-dragging) post renders at exactly its persisted zIndex -- untouched', () => {
    expect(resolveFreeformPostRenderZIndex({ persistedZIndex: 42, isSelected: false, isDragging: false })).toBe(42);
    expect(resolveFreeformPostRenderZIndex({ persistedZIndex: 9000, isSelected: false, isDragging: false })).toBe(9000);
  });

  it('4. selection never mutates or reads any metadata -- the function is a pure number-in/number-out mapping with no side effects', () => {
    expect(resolveFreeformPostRenderZIndex.length).toBe(1); // single destructured options object, no state/mutation params
    const input = { persistedZIndex: 5, isSelected: true, isDragging: false };
    const frozen = Object.freeze({ ...input });
    expect(() => resolveFreeformPostRenderZIndex(frozen)).not.toThrow();
  });

  it('6. selected (lower persisted z) beats an ordinary post with a HIGHER persisted z -- proves precedence is NOT persisted-value-dependent', () => {
    const selectedLow = resolveFreeformPostRenderZIndex({ persistedZIndex: 10, isSelected: true, isDragging: false });
    const ordinaryHigh = resolveFreeformPostRenderZIndex({ persistedZIndex: 9000, isSelected: false, isDragging: false });
    expect(selectedLow).toBeGreaterThan(ordinaryHigh);
  });

  it('7. default-tie: two ordinary posts sharing the same persisted zIndex -- whichever becomes selected wins, deterministically', () => {
    const bothOrdinary = { persistedZIndex: 1, isSelected: false, isDragging: false };
    const aSelected = resolveFreeformPostRenderZIndex({ ...bothOrdinary, isSelected: true });
    const bOrdinary = resolveFreeformPostRenderZIndex(bothOrdinary);
    expect(aSelected).toBeGreaterThan(bOrdinary);
  });

  it('9. FREEFORM_SELECTED_INTERACTION_Z_INDEX sits strictly between the realistic ordinary ceiling (9000, see movePadletLayer bringToFront normalize threshold) and dragging', () => {
    expect(FREEFORM_SELECTED_INTERACTION_Z_INDEX).toBeGreaterThan(9000);
    expect(FREEFORM_SELECTED_INTERACTION_Z_INDEX).toBeLessThan(FREEFORM_DRAGGING_Z_INDEX);
  });

  it('9b. FREEFORM_SELECTED_INTERACTION_Z_INDEX stays below FreeformGraphLayer\'s EDGE_DEFAULT_Z (999999) -- a merely-selected post must not change the established "lines render above ordinary posts" Graph default; only dragging (which already exceeds it) does', () => {
    const graphLayerSrc = read('components/graph/FreeformGraphLayer.tsx');
    expect(graphLayerSrc).toContain('const EDGE_DEFAULT_Z = 999999;');
    expect(FREEFORM_SELECTED_INTERACTION_Z_INDEX).toBeLessThan(999999);
  });

  it('negative control A: without the isSelected branch, a selected post would render at its ordinary persisted value -- proves the branch is load-bearing', () => {
    function withoutSelectedElevation({ persistedZIndex, isDragging }: { persistedZIndex: number; isDragging: boolean }): number {
      if (isDragging) return FREEFORM_DRAGGING_Z_INDEX;
      return persistedZIndex; // the (removed) isSelected branch is what this patch adds
    }
    const real = resolveFreeformPostRenderZIndex({ persistedZIndex: 1, isSelected: true, isDragging: false });
    const mutated = withoutSelectedElevation({ persistedZIndex: 1, isDragging: false });
    expect(real).not.toBe(mutated);
  });

  it('negative control D: if selected were checked BEFORE dragging, a selected-and-dragging post would lose its dragging precedence -- proves branch order is load-bearing', () => {
    function wrongOrder({ persistedZIndex, isSelected, isDragging }: { persistedZIndex: number; isSelected: boolean; isDragging: boolean }): number {
      if (isSelected) return FREEFORM_SELECTED_INTERACTION_Z_INDEX;
      if (isDragging) return FREEFORM_DRAGGING_Z_INDEX;
      return persistedZIndex;
    }
    const input = { persistedZIndex: 1, isSelected: true, isDragging: true };
    expect(resolveFreeformPostRenderZIndex(input)).toBe(FREEFORM_DRAGGING_Z_INDEX);
    expect(wrongOrder(input)).toBe(FREEFORM_SELECTED_INTERACTION_Z_INDEX);
    expect(resolveFreeformPostRenderZIndex(input)).not.toBe(wrongOrder(input));
  });
});

describe('PATCH POST-RESIZE-B2R.4: FreeformPadletCards.tsx wiring', () => {
  const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');

  it('the outer root wrapper computes zIndex via resolveFreeformPostRenderZIndex, not a raw drag-only ternary', () => {
    expect(cardsSrc).toContain("import { resolveFreeformPostRenderZIndex } from '@/components/collabboard/canvas/engine/zIndex';");
    expect(cardsSrc).toContain('zIndex: resolveFreeformPostRenderZIndex({');
    expect(cardsSrc).toContain('isSelected: isPadletSelected(padlet.id),');
    expect(cardsSrc).toContain('isDragging: draggingPadletId === padlet.id,');
  });

  it('negative control G: the fix is not implemented via a portal -- no new createPortal/portal usage was introduced near the outer wrapper', () => {
    const wrapperStart = cardsSrc.indexOf('zIndex: resolveFreeformPostRenderZIndex({');
    const nearby = cardsSrc.slice(Math.max(0, wrapperStart - 2000), wrapperStart + 2000);
    expect(nearby).not.toContain('createPortal');
  });

  it('negative control I: Section Heading\'s own dedicated z-index formula is untouched -- it does not route through resolveFreeformPostRenderZIndex', () => {
    const sectionHeadingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
    expect(sectionHeadingSrc).toContain("zIndex: isDraggingThis ? Number.MAX_SAFE_INTEGER : ((padlet.metadata as { zIndex?: number } | undefined)?.zIndex || 1),");
    expect(sectionHeadingSrc).not.toContain('resolveFreeformPostRenderZIndex');
  });

  it('negative control J: the Excalidraw fork is untouched by this patch', () => {
    expect(cardsSrc).not.toContain('excalidraw_fork');
  });

  it('negative control H: PostResizeHandle.tsx (the low-zoom sibling-handle structure from B2R.2) is untouched by this patch', () => {
    const handleSrc = read('components/collabboard/canvas/ui/PostResizeHandle.tsx');
    expect(handleSrc).toContain('className={`absolute bottom-0 right-0');
  });
});
