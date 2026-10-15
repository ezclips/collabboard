import { describe, expect, it } from 'vitest';

import {
  CARD_COMMENTS_NOTE,
  LAYOUT_FAMILIES,
  canSwitchLayout,
  layoutFamily,
  layoutSwitchCounts,
  layoutSwitchPlan,
  type LayoutSwitchPost,
} from './layoutSwitchFamilies';

/** Every layout the settings window offers, plus the ones it does not. */
const SWITCHABLE = ['wall', 'columns', 'grid', 'timeline'];
const OTHER = ['freeform', 'map', 'kanban', 'gantt', 'scheduler', 'drawing', 'table'];

const post = (id: string, metadata: Record<string, unknown> = {}, type = 'text'): LayoutSwitchPost => ({ id, type, metadata });
const card = (id: string, childPadletIds: string[], metadata: Record<string, unknown> = {}): LayoutSwitchPost => (
  post(id, { kind: 'container', isContainer: true, childPadletIds, ...metadata }, 'container')
);

describe('layoutFamily', () => {
  it('puts Columns and Grid together, and Wall and Timeline together', () => {
    expect(layoutFamily('columns')).toBe('sections');
    expect(layoutFamily('grid')).toBe('sections');
    expect(layoutFamily('wall')).toBe('containers');
    expect(layoutFamily('timeline')).toBe('containers');
  });

  it('is null for a layout with no posts of either shape, and for nothing at all', () => {
    for (const layout of OTHER) expect(layoutFamily(layout), layout).toBeNull();
    expect(layoutFamily(null)).toBeNull();
    expect(layoutFamily(undefined)).toBeNull();
    expect(layoutFamily('')).toBeNull();
  });

  it('groups exactly the four switchable layouts, with none in both', () => {
    const grouped = [...LAYOUT_FAMILIES.sections, ...LAYOUT_FAMILIES.containers];
    expect([...grouped].sort()).toEqual([...SWITCHABLE].sort());
    expect(LAYOUT_FAMILIES.sections.some((id) => LAYOUT_FAMILIES.containers.includes(id))).toBe(false);
  });
});

describe('canSwitchLayout', () => {
  it('offers every pair of the four, same family AND across families', () => {
    // PATCH-376 answered "same family only". PATCH-377 converts across families,
    // so those pairs are offered too.
    for (const from of SWITCHABLE) {
      for (const to of SWITCHABLE) {
        expect(canSwitchLayout(from, to), `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it('refuses a switch from or to a layout outside the four', () => {
    for (const layout of OTHER) {
      expect(canSwitchLayout(layout, 'columns'), `from ${layout}`).toBe(false);
      expect(canSwitchLayout('columns', layout), `to ${layout}`).toBe(false);
    }
    expect(canSwitchLayout(null, 'columns')).toBe(false);
    expect(canSwitchLayout('columns', null)).toBe(false);
    expect(canSwitchLayout(null, null)).toBe(false);
  });
});

describe('layoutSwitchCounts', () => {
  it('counts sections as panels and the posts that carry a sectionId', () => {
    const posts = [
      post('p1', { sectionId: '10', sectionPosition: 0 }),
      post('p2', { sectionId: '10', sectionPosition: 1 }),
      post('p3', { sectionId: '11' }),
      post('p4', {}),                                  // no sectionId: left alone
      post('p5', { sectionId: '10', parentId: 'c1' }), // already a child: not a section post
    ];
    expect(layoutSwitchCounts('columns', posts, 2)).toEqual({ panels: 2, posts: 3, commentedPanels: 0 });
  });

  it('counts a card per root container, plus Unsorted only when a loose post needs one', () => {
    const posts = [
      card('c1', ['p1', 'p2']),
      card('c2', ['p3']),
      post('p1', { parentId: 'c1' }),
      post('p2', { parentId: 'c1' }),
      post('p3', { parentId: 'c2' }),
    ];
    expect(layoutSwitchCounts('wall', posts, 0)).toEqual({ panels: 2, posts: 3, commentedPanels: 0 });

    const withLoose = [...posts, post('p9', {})];
    expect(layoutSwitchCounts('timeline', withLoose, 0)).toEqual({ panels: 3, posts: 4, commentedPanels: 0 });
  });

  it('counts a child only when a card NAMES it, exactly as the conversion walks them', () => {
    const posts = [
      card('c1', ['p1']),
      post('p1', { parentId: 'c1' }),
      post('p2', { parentId: 'c1' }), // a dangling child the conversion never reaches
    ];
    expect(layoutSwitchCounts('wall', posts, 0).posts).toBe(1);
  });

  it('counts the source cards that carry comments', () => {
    const posts = [
      card('c1', [], { comments: [{ id: 'x' }] }),
      card('c2', [], { detachedComments: [{ id: 'y' }] }),
      card('c3', []),
    ];
    expect(layoutSwitchCounts('wall', posts, 0).commentedPanels).toBe(2);
    // A section is not a card and never has comments of its own.
    expect(layoutSwitchCounts('columns', [post('p1', { sectionId: '1' })], 1).commentedPanels).toBe(0);
  });

  it('is all zeroes for a layout outside the four', () => {
    expect(layoutSwitchCounts('freeform', [post('p1', {})], 3)).toEqual({ panels: 0, posts: 0, commentedPanels: 0 });
    expect(layoutSwitchCounts(null, [], 0)).toEqual({ panels: 0, posts: 0, commentedPanels: 0 });
  });
});

describe('layoutSwitchPlan', () => {
  const counts = (panels: number, posts: number, commentedPanels = 0) => ({ panels, posts, commentedPanels });

  it('says nothing moves within a family', () => {
    expect(layoutSwitchPlan('columns', 'grid', counts(3, 12))).toEqual({
      kind: 'same-family',
      summary: 'Your posts stay where they are.',
    });
    expect(layoutSwitchPlan('wall', 'timeline', counts(2, 5))?.kind).toBe('same-family');
  });

  it('reads sections -> cards, with the counts', () => {
    expect(layoutSwitchPlan('columns', 'wall', counts(3, 12))).toEqual({
      kind: 'convert',
      summary: 'Your 3 columns become 3 cards. All 12 posts move with them.',
    });
    expect(layoutSwitchPlan('grid', 'timeline', counts(4, 9))?.summary)
      .toBe('Your 4 columns become 4 cards. All 9 posts move with them.');
  });

  it('reads cards -> sections, with the counts', () => {
    expect(layoutSwitchPlan('wall', 'columns', counts(4, 9))).toEqual({
      kind: 'convert',
      summary: 'Your 4 cards become 4 columns. All 9 posts move with them.',
    });
    expect(layoutSwitchPlan('timeline', 'grid', counts(2, 5))?.summary)
      .toBe('Your 2 cards become 2 columns. All 5 posts move with them.');
  });

  it('gets the singulars right', () => {
    expect(layoutSwitchPlan('columns', 'wall', counts(1, 1))?.summary)
      .toBe('Your 1 column becomes 1 card. The 1 post moves with it.');
    expect(layoutSwitchPlan('wall', 'columns', counts(1, 1))?.summary)
      .toBe('Your 1 card becomes 1 column. The 1 post moves with it.');
  });

  it('never reports a negative or fractional count', () => {
    expect(layoutSwitchPlan('columns', 'wall', counts(-2, 3.7))?.summary)
      .toBe('Your 0 columns become 0 cards. All 3 posts move with them.');
  });

  it('is null when either layout is outside the four', () => {
    expect(layoutSwitchPlan('freeform', 'columns', counts(1, 1))).toBeNull();
    expect(layoutSwitchPlan('columns', 'map', counts(1, 1))).toBeNull();
    expect(layoutSwitchPlan(null, 'columns', counts(1, 1))).toBeNull();
    expect(layoutSwitchPlan('columns', null, counts(1, 1))).toBeNull();
  });
});

describe('CARD_COMMENTS_NOTE', () => {
  it('says exactly what is dropped', () => {
    expect(CARD_COMMENTS_NOTE).toBe('Comments on the cards themselves are not carried over.');
  });
});
