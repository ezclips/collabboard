// PATCH-287. The library export transform: a chart element keeps ONLY its
// `antvRole` and `antvChart`; every other element loses all `customData`.
import { describe, expect, it } from 'vitest';

import { exportLibraryElement } from './libraryTemplates';

const antvChart = {
  v: 1,
  template: 'chart-pie-donut-pill-badge',
  theme: 'classic',
  title: 'Seasonal plan',
  items: [
    { label: 'Spring', value: 24 },
    { label: 'Summer', value: 40 },
  ],
};

describe('PATCH-287: exportLibraryElement chart customData', () => {
  it('keeps exactly antvRole and antvChart for a chart element', () => {
    const out = exportLibraryElement({
      id: 'e0',
      type: 'text',
      x: 1.2345,
      customData: { antvId: 'e0', antvKind: 'text', antvRole: 'item-label@0#0', antvChart },
    });
    expect(out.customData).toEqual({ antvRole: 'item-label@0#0', antvChart });
  });

  it('drops customData entirely for a non-chart element', () => {
    const out = exportLibraryElement({
      id: 'e1',
      type: 'rectangle',
      customData: { antvId: 'e1', antvKind: 'rect', antvRole: 'rect#0' },
    });
    expect('customData' in out).toBe(false);
  });

  it('drops customData for a chart element whose antvChart does not parse', () => {
    const out = exportLibraryElement({
      id: 'e2',
      type: 'text',
      customData: { antvRole: 'title#0', antvChart: { template: 'nope' } },
    });
    expect('customData' in out).toBe(false);
  });
});
