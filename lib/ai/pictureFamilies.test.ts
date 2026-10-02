import { describe, expect, it } from 'vitest';

import { ANTV_TEMPLATES } from './antv/catalog';
import { PICTURE_FAMILIES, pictureFamily, type PictureFamily } from './pictureFamilies';

/**
 * PATCH-246. One family per design so the gallery can filter locally instead of
 * asking for a generator. Every catalogue name must land in exactly one family.
 */
describe('PATCH-246 pictureFamily', () => {
  it('maps every one of the 276 AntV names to exactly one family', () => {
    expect(ANTV_TEMPLATES).toHaveLength(276);

    const counts: Record<PictureFamily, number> = {
      flow: 0,
      mindmap: 0,
      hierarchy: 0,
      list: 0,
      timeline: 0,
      comparison: 0,
      chart: 0,
    };
    for (const info of ANTV_TEMPLATES) {
      const family = pictureFamily({ key: `antv:${info.name}`, category: info.category });
      expect(PICTURE_FAMILIES).toContain(family);
      counts[family] += 1;
    }

    // Snapshot of the counts per family (sums to 276).
    expect(counts).toEqual({
      flow: 78,
      mindmap: 10,
      hierarchy: 102,
      list: 50,
      timeline: 5,
      comparison: 20,
      chart: 11,
    });
  });

  it('routes the AntV special cases: sequence timeline vs other sequence, mindmap vs hierarchy', () => {
    expect(
      pictureFamily({ key: 'antv:sequence-timeline-done-list', category: 'sequence' }),
    ).toBe('timeline');
    expect(pictureFamily({ key: 'antv:sequence-steps-badge-card', category: 'sequence' })).toBe('flow');
    expect(
      pictureFamily({ key: 'antv:hierarchy-mindmap-branch-gradient-capsule-item', category: 'hierarchy' }),
    ).toBe('mindmap');
    expect(
      pictureFamily({ key: 'antv:hierarchy-tree-bt-curved-line-badge-card', category: 'hierarchy' }),
    ).toBe('hierarchy');
    expect(pictureFamily({ key: 'antv:list-grid-badge-card', category: 'list' })).toBe('list');
    expect(pictureFamily({ key: 'antv:compare-binary-horizontal-badge-card-arrow', category: 'compare' })).toBe(
      'comparison',
    );
  });

  it('maps our own base keys and infographic templates', () => {
    expect(pictureFamily({ key: 'flow' })).toBe('flow');
    expect(pictureFamily({ key: 'mindmap' })).toBe('mindmap');
    expect(pictureFamily({ key: 'timeline' })).toBe('timeline');
    expect(pictureFamily({ key: 'comparison' })).toBe('comparison');
    expect(pictureFamily({ key: 'infographic:stairs' })).toBe('flow');
    expect(pictureFamily({ key: 'infographic:funnel' })).toBe('flow');
    expect(pictureFamily({ key: 'infographic:cycle' })).toBe('flow');
    expect(pictureFamily({ key: 'infographic:hub' })).toBe('mindmap');
    expect(pictureFamily({ key: 'infographic:pyramid' })).toBe('hierarchy');
    expect(pictureFamily({ key: 'infographic:stack' })).toBe('hierarchy');
  });

  it('falls back to list for an unknown design', () => {
    expect(pictureFamily({ key: 'something-else' })).toBe('list');
    expect(pictureFamily({ key: 'antv:not-a-real-template', category: '' })).toBe('list');
  });
});
