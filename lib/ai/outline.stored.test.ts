import { describe, expect, it } from 'vitest';

import { parseOutline } from './outline';
import { safeValidateAIContent, safeValidateStoredAIContent } from './validators';

/**
 * PATCH-272. The stored-data path keeps the trusted `valuesEstimated` flag and
 * sanitized overrides; the model path drops every server-only flag. Example flags
 * are never real data and are dropped on BOTH paths.
 */

const RAW_STORED_OUTLINE = {
  title: 'Budget',
  ordered: false,
  kind: 'parts',
  valuesEstimated: true,
  valuesExample: true,
  elementOverrides: {
    template: 'list-grid-badge-card',
    items: { 'item-label@0': { dx: 12 } },
  },
  items: [
    { label: 'A', value: 50, valueExample: true },
    { label: 'B' },
  ],
};

const INFOGRAPHIC = {
  type: 'diagram',
  subtype: 'infographic',
  renderer: 'infographic',
  title: 'Budget',
  template: 'antv:list-grid-badge-card',
  outline: RAW_STORED_OUTLINE,
};

describe('PATCH-272 parseOutline model vs stored', () => {
  it('the model path drops valuesEstimated, valuesExample and valueExample', () => {
    const out = parseOutline(RAW_STORED_OUTLINE);
    expect(out.valuesEstimated).toBeUndefined();
    expect(out.valuesExample).toBeUndefined();
    expect(out.items[0].valueExample).toBeUndefined();
    // The model path still sanitizes overrides here; the route strips the map.
    expect(out.elementOverrides).toEqual({
      template: 'list-grid-badge-card',
      items: { 'item-label@0': { dx: 12 } },
    });
  });

  it('the stored path keeps valuesEstimated but still drops the example flags', () => {
    const out = parseOutline(RAW_STORED_OUTLINE, { source: 'stored' });
    expect(out.valuesEstimated).toBe(true);
    expect(out.valuesExample).toBeUndefined();
    expect(out.items[0].valueExample).toBeUndefined();
    expect(out.items[0].value).toBe(50);
  });
});

describe('PATCH-272 stored infographic schema', () => {
  it('keeps valuesEstimated on the stored path and drops it on the model path', () => {
    const model = safeValidateAIContent({ mode: 'diagram', subtype: 'infographic', data: INFOGRAPHIC });
    expect(model.success).toBe(true);
    if (model.success) {
      const outline = (model.data as { outline: { valuesEstimated?: boolean } }).outline;
      expect(outline.valuesEstimated).toBeUndefined();
    }

    const stored = safeValidateStoredAIContent({ mode: 'diagram', subtype: 'infographic', data: INFOGRAPHIC });
    expect(stored.success).toBe(true);
    if (stored.success) {
      const outline = (stored.data as { outline: { valuesEstimated?: boolean } }).outline;
      expect(outline.valuesEstimated).toBe(true);
    }
  });

  it('the stored schema still falls back an unknown antv: template', () => {
    const stored = safeValidateStoredAIContent({
      mode: 'diagram',
      subtype: 'infographic',
      data: { ...INFOGRAPHIC, template: 'antv:obsolete-template' },
    });
    expect(stored.success).toBe(true);
    if (stored.success) {
      expect((stored.data as { template: string }).template).toBe('antv:list-grid-badge-card');
    }
  });
});
