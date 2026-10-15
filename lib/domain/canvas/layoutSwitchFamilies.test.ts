import { describe, expect, it } from 'vitest';

import {
  CROSS_FAMILY_NOTE,
  LAYOUT_FAMILIES,
  canSwitchLayout,
  layoutFamily,
} from './layoutSwitchFamilies';

/** Every layout the settings window offers, plus the ones it does not. */
const SWITCHABLE = ['wall', 'columns', 'grid', 'timeline'];
const OTHER = ['freeform', 'map', 'kanban', 'gantt', 'scheduler', 'drawing', 'table'];

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
  it('allows every same-family pair, including a layout to itself', () => {
    expect(canSwitchLayout('columns', 'grid')).toBe(true);
    expect(canSwitchLayout('grid', 'columns')).toBe(true);
    expect(canSwitchLayout('wall', 'timeline')).toBe(true);
    expect(canSwitchLayout('timeline', 'wall')).toBe(true);
    for (const layout of SWITCHABLE) expect(canSwitchLayout(layout, layout), layout).toBe(true);
  });

  it('refuses every cross-family pair, both ways', () => {
    const sections = LAYOUT_FAMILIES.sections;
    const containers = LAYOUT_FAMILIES.containers;
    for (const from of sections) {
      for (const to of containers) {
        expect(canSwitchLayout(from, to), `${from} -> ${to}`).toBe(false);
        expect(canSwitchLayout(to, from), `${to} -> ${from}`).toBe(false);
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

describe('CROSS_FAMILY_NOTE', () => {
  it('names both families, so a disabled tile explains itself', () => {
    expect(CROSS_FAMILY_NOTE).toContain('Wall/Timeline');
    expect(CROSS_FAMILY_NOTE).toContain('Columns/Grid');
    expect(CROSS_FAMILY_NOTE).toContain('organised differently');
  });
});
