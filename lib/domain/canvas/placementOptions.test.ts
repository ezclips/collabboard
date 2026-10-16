import { describe, expect, it } from 'vitest';
import {
  ADD_TO_EXISTING_EMPTY_HINT,
  countRootContainers,
  isPlacementDraftEmpty,
  placementOptions,
} from './placementOptions';

describe('placementOptions (PATCH-381)', () => {
  it('offers both options on a board that already has a container', () => {
    expect(placementOptions({ containerCount: 1, canCreateContainer: true })).toEqual({
      newContainer: 'enabled',
      addToExisting: 'enabled',
    });
  });

  it('disables Add to Existing with the hint when the board has no containers', () => {
    const options = placementOptions({ containerCount: 0, canCreateContainer: true });
    expect(options.newContainer).toBe('enabled');
    expect(options.addToExisting).toBe('disabled');
    expect(options.hint).toBe(ADD_TO_EXISTING_EMPTY_HINT);
  });

  it('hides New Container for a caller that may not create one', () => {
    const options = placementOptions({ containerCount: 0, canCreateContainer: false });
    expect(options.newContainer).toBe('hidden');
    expect(options.addToExisting).toBe('disabled');
    expect(options.hint).toBe(ADD_TO_EXISTING_EMPTY_HINT);
  });

  it('treats a non-finite or negative count as empty', () => {
    expect(placementOptions({ containerCount: NaN, canCreateContainer: true }).addToExisting).toBe('disabled');
    expect(placementOptions({ containerCount: -2, canCreateContainer: true }).addToExisting).toBe('disabled');
  });
});

describe('isPlacementDraftEmpty (PATCH-381)', () => {
  it('an empty TipTap note is empty', () => {
    expect(isPlacementDraftEmpty({ content: '<p></p>' })).toBe(true);
  });

  it('a note with text is not empty', () => {
    expect(isPlacementDraftEmpty({ content: '<p>hi</p>' })).toBe(false);
  });

  it('a note with only a title is not empty', () => {
    expect(isPlacementDraftEmpty({ content: '<p></p>', title: 'Heading' })).toBe(false);
  });

  it('a draft with a file is not empty', () => {
    expect(isPlacementDraftEmpty({ content: '', file_url: 'https://x/y.png' })).toBe(false);
  });
});

describe('countRootContainers (PATCH-381)', () => {
  it('counts a Timeline auto-created blank first entry (a root container)', () => {
    const timelineContainer = {
      type: 'container',
      metadata: { kind: 'container', isContainer: true, childPadletIds: [], position_in_timeline: 0 },
    };
    expect(countRootContainers([timelineContainer])).toBe(1);
  });

  it('counts containers identified by type or metadata flags', () => {
    expect(countRootContainers([{ type: 'container' }])).toBe(1);
    expect(countRootContainers([{ type: 'note', metadata: { kind: 'container' } }])).toBe(1);
    expect(countRootContainers([{ type: 'note', metadata: { isContainer: true } }])).toBe(1);
  });

  it('ignores nested containers and ordinary posts', () => {
    expect(countRootContainers([{ type: 'container', metadata: { parentId: 'c1' } }])).toBe(0);
    expect(countRootContainers([{ type: 'note' }, { type: 'text' }])).toBe(0);
  });

  it('counts only the root containers among a mixed board', () => {
    const posts = [
      { type: 'container' },
      { type: 'container', metadata: { parentId: 'c1' } },
      { type: 'text' },
      { type: 'container', metadata: { isContainer: true } },
    ];
    expect(countRootContainers(posts)).toBe(2);
  });
});
