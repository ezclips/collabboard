import { describe, expect, it } from 'vitest';

import { MindmapDiagramSchema, safeValidateDiagramData } from './validators';

const base = {
  type: 'diagram' as const,
  subtype: 'mindmap' as const,
  title: 'Water cycle',
  renderer: 'diagram_code' as const,
  code: 'mindmap\n  root((water))',
};

describe('PATCH-234 mindmap optional tree', () => {
  it('a stored mindmap without a tree still validates', () => {
    expect(MindmapDiagramSchema.safeParse(base).success).toBe(true);
    expect(safeValidateDiagramData('mindmap', base).success).toBe(true);
  });

  it('a valid tree validates and is preserved', () => {
    const result = MindmapDiagramSchema.safeParse({
      ...base,
      tree: { label: 'Water cycle', children: [{ label: 'Evaporation', children: [{ label: 'Oceans' }] }] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tree).toEqual({
        label: 'Water cycle',
        children: [{ label: 'Evaporation', children: [{ label: 'Oceans' }] }],
      });
    }
  });

  it('trims an over-long tree (9 branches -> 8) rather than rejecting it', () => {
    // Consistent with parseOutline, which caps the outline at 8 items / 6 children.
    const result = MindmapDiagramSchema.safeParse({
      ...base,
      tree: {
        label: 'Root',
        children: Array.from({ length: 9 }, (_, i) => ({
          label: `Branch ${i}`,
          children: Array.from({ length: 8 }, (_, j) => ({ label: `Leaf ${i}-${j}` })),
        })),
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tree!.children).toHaveLength(8);
      expect(result.data.tree!.children![0].children).toHaveLength(6);
    }
  });
});
