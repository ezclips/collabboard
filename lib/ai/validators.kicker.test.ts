import { describe, expect, it } from 'vitest';

import type { DiagramSubtype } from './contracts';
import { safeValidateDiagramData } from './validators';

const OUTLINE = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [{ label: 'Spring' }, { label: 'Summer' }],
};

const BASE_BY_SUBTYPE: Record<DiagramSubtype, Record<string, unknown>> = {
  flowchart: {
    type: 'diagram',
    subtype: 'flowchart',
    title: 'Flow',
    renderer: 'diagram_code',
    code: 'graph TD; A-->B',
  },
  mindmap: {
    type: 'diagram',
    subtype: 'mindmap',
    title: 'Mind',
    renderer: 'diagram_code',
    code: 'mindmap\n  root((mind))',
  },
  pie_chart: {
    type: 'diagram',
    subtype: 'pie_chart',
    title: 'Pie',
    renderer: 'chart',
    dataPoints: [{ label: 'A', value: 1 }],
  },
  bar_chart: {
    type: 'diagram',
    subtype: 'bar_chart',
    title: 'Bar',
    renderer: 'chart',
    dataPoints: [{ label: 'A', value: 1 }],
  },
  timeline: {
    type: 'diagram',
    subtype: 'timeline',
    title: 'Timeline',
    renderer: 'timeline',
    items: [{ title: 'Kickoff' }],
  },
  comparison: {
    type: 'diagram',
    subtype: 'comparison',
    title: 'Compare',
    renderer: 'comparison',
    columns: [
      { heading: 'A', points: ['one'] },
      { heading: 'B', points: ['two'] },
    ],
  },
  infographic: {
    type: 'diagram',
    subtype: 'infographic',
    title: 'Seasons',
    renderer: 'infographic',
    template: 'stack',
    outline: OUTLINE,
  },
  drawn: {
    type: 'diagram',
    subtype: 'drawn',
    title: 'Seasons',
    renderer: 'drawn',
    kind: 'flowchart',
    seed: 1,
    outline: OUTLINE,
    picture: {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' }],
    },
  },
};

describe('PATCH-264 diagram kicker validation', () => {
  for (const subtype of Object.keys(BASE_BY_SUBTYPE) as DiagramSubtype[]) {
    it(`${subtype}: accepts a kicker up to 40 chars and preserves it`, () => {
      const kicker = 'K'.repeat(40);
      const result = safeValidateDiagramData(subtype, { ...BASE_BY_SUBTYPE[subtype], kicker });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { kicker?: string }).kicker).toBe(kicker);
      }
    });

    it(`${subtype}: rejects a kicker over 40 chars`, () => {
      const result = safeValidateDiagramData(subtype, {
        ...BASE_BY_SUBTYPE[subtype],
        kicker: 'K'.repeat(41),
      });
      expect(result.success).toBe(false);
    });

    it(`${subtype}: an absent kicker still validates`, () => {
      const result = safeValidateDiagramData(subtype, BASE_BY_SUBTYPE[subtype]);
      expect(result.success).toBe(true);
    });
  }
});
