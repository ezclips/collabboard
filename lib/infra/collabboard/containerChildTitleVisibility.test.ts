import { describe, expect, it } from 'vitest';
import {
  getEffectiveVisibleChildTitleIds,
  resolveVisibleChildTitle,
  toggleChildPostTitleVisibility,
} from './containerChildTitleVisibility';

const childA = { id: 'child-a', title: 'Alpha' };
const childB = { id: 'child-b', title: 'Beta' };
const untitledImage = { id: 'child-image', title: '' };

describe('getEffectiveVisibleChildTitleIds', () => {
  it('no explicit list, no legacy flag -> empty set (default hidden) [matrix 24]', () => {
    expect(getEffectiveVisibleChildTitleIds({}, [childA, childB])).toEqual(new Set());
    expect(getEffectiveVisibleChildTitleIds(null, [childA])).toEqual(new Set());
    expect(getEffectiveVisibleChildTitleIds({ showChildPostTitles: false }, [childA])).toEqual(new Set());
  });

  it('explicit list present -> used verbatim (non-string entries filtered)', () => {
    const result = getEffectiveVisibleChildTitleIds(
      { visibleChildPostTitleIds: ['child-a', 42, null, 'child-b'] as any },
      [childA, childB],
    );
    expect(result).toEqual(new Set(['child-a', 'child-b']));
  });

  it('legacy showChildPostTitles=true, no explicit list -> every CURRENTLY TITLED child visible [matrix 25]', () => {
    const result = getEffectiveVisibleChildTitleIds({ showChildPostTitles: true }, [childA, childB, untitledImage]);
    expect(result).toEqual(new Set(['child-a', 'child-b']));
  });

  it('explicit list (even empty) always wins over the legacy boolean [matrix 27]', () => {
    const result = getEffectiveVisibleChildTitleIds(
      { showChildPostTitles: true, visibleChildPostTitleIds: [] },
      [childA, childB],
    );
    expect(result).toEqual(new Set());
  });
});

describe('resolveVisibleChildTitle: the critical MENU-LABEL vs CANVAS-TITLE distinction', () => {
  it('visible + real title -> returns the title [matrix 11, 16]', () => {
    const ids = new Set(['child-a']);
    expect(resolveVisibleChildTitle(ids, childA)).toBe('Alpha');
  });

  it('visible + literal title "Image" -> returns "Image" (a real user-entered title, not the fallback) [matrix 16]', () => {
    const ids = new Set(['child-image']);
    expect(resolveVisibleChildTitle(ids, { id: 'child-image', title: 'Image' })).toBe('Image');
  });

  it('not visible -> null regardless of title content [matrix 12]', () => {
    const ids = new Set<string>();
    expect(resolveVisibleChildTitle(ids, childA)).toBeNull();
  });

  it('visible but untitled (empty/whitespace/undefined) -> null, NEVER a type-name fallback [matrix 13, 14, 15]', () => {
    const ids = new Set(['child-image']);
    expect(resolveVisibleChildTitle(ids, untitledImage)).toBeNull();
    expect(resolveVisibleChildTitle(ids, { id: 'child-image', title: '   ' })).toBeNull();
    expect(resolveVisibleChildTitle(ids, { id: 'child-image', title: undefined })).toBeNull();
  });
});

describe('toggleChildPostTitleVisibility', () => {
  it('toggles a hidden child to visible, leaving siblings untouched [matrix 10, 19, 20]', () => {
    const result = toggleChildPostTitleVisibility({ visibleChildPostTitleIds: ['child-a'] }, [childA, childB], 'child-b');
    expect(new Set(result)).toEqual(new Set(['child-a', 'child-b']));
  });

  it('toggles a visible child to hidden, leaving siblings untouched', () => {
    const result = toggleChildPostTitleVisibility({ visibleChildPostTitleIds: ['child-a', 'child-b'] }, [childA, childB], 'child-a');
    expect(result).toEqual(['child-b']);
  });

  it('first toggle materializes the legacy boolean state into an explicit list [matrix 26]', () => {
    // Container currently in legacy mode: showChildPostTitles=true, child-a
    // titled (implicitly visible), child-b about to be explicitly hidden.
    const result = toggleChildPostTitleVisibility({ showChildPostTitles: true }, [childA, childB], 'child-b');
    // child-a stays visible (carried over from the legacy-implied state),
    // child-b is now explicitly toggled OFF.
    expect(new Set(result)).toEqual(new Set(['child-a']));
  });

  it('is a per-relationship operation: does not mutate the input metadata object', () => {
    const metadata = { visibleChildPostTitleIds: ['child-a'] };
    toggleChildPostTitleVisibility(metadata, [childA, childB], 'child-b');
    expect(metadata.visibleChildPostTitleIds).toEqual(['child-a']);
  });
});
