import { describe, expect, it } from 'vitest';

import { INfographicFallbackTemplate, InfographicDiagramSchema } from './validators';

const outline = { title: 'T', ordered: false, kind: 'levels', items: [{ label: 'A' }, { label: 'B' }] };

function parse(template: unknown) {
  return InfographicDiagramSchema.safeParse({
    type: 'diagram',
    subtype: 'infographic',
    title: 'X',
    renderer: 'infographic',
    template,
    outline,
  });
}

describe('PATCH-236/241 infographic validation', () => {
  it('a valid infographic with one of our six templates validates unchanged', () => {
    const result = parse('pyramid');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.template).toBe('pyramid');
  });

  it('PATCH-241 keeps a known antv: template', () => {
    const result = parse('antv:list-grid-badge-card');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.template).toBe('antv:list-grid-badge-card');
  });

  it('PATCH-241 falls back to a default antv template for an unknown antv: name', () => {
    const result = parse('antv:not-a-real-template');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.template).toBe(INfographicFallbackTemplate);
  });

  it('PATCH-241 falls back rather than rejecting any other unknown template', () => {
    const result = parse('hexagon');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.template).toBe(INfographicFallbackTemplate);
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
