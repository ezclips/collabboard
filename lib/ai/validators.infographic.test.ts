import { describe, expect, it } from 'vitest';

import { InfographicDiagramSchema } from './validators';

const outline = { title: 'T', ordered: false, kind: 'levels', items: [{ label: 'A' }, { label: 'B' }] };

describe('PATCH-236 infographic validation', () => {
  it('a valid infographic validates', () => {
    const result = InfographicDiagramSchema.safeParse({
      type: 'diagram',
      subtype: 'infographic',
      title: 'Water cycle',
      renderer: 'infographic',
      template: 'pyramid',
      outline,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown template', () => {
    const result = InfographicDiagramSchema.safeParse({
      type: 'diagram',
      subtype: 'infographic',
      title: 'X',
      renderer: 'infographic',
      template: 'hexagon',
      outline,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an outline with too few items (same limits as parseOutline)', () => {
    const result = InfographicDiagramSchema.safeParse({
      type: 'diagram',
      subtype: 'infographic',
      title: 'X',
      renderer: 'infographic',
      template: 'hub',
      outline: { title: 'X', ordered: false, kind: 'list', items: [{ label: 'Only' }] },
    });
    expect(result.success).toBe(false);
  });
});
