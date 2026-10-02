import { describe, expect, it } from 'vitest';

import {
  ComparisonDiagramSchema,
  InfographicDiagramSchema,
  MindmapDiagramSchema,
  TimelineDiagramSchema,
} from './validators';

const outline = { title: 'T', ordered: false, kind: 'levels', items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] };

const bases = {
  infographic: {
    type: 'diagram' as const,
    subtype: 'infographic' as const,
    title: 'Water cycle',
    renderer: 'infographic' as const,
    template: 'pyramid' as const,
    outline,
  },
  mindmap: {
    type: 'diagram' as const,
    subtype: 'mindmap' as const,
    title: 'Water cycle',
    renderer: 'diagram_code' as const,
    code: 'mindmap\n  root((water))',
    tree: { label: 'Water cycle', children: [{ label: 'Rain' }] },
  },
  comparison: {
    type: 'diagram' as const,
    subtype: 'comparison' as const,
    title: 'Cats vs Dogs',
    renderer: 'comparison' as const,
    columns: [{ heading: 'Cats', points: ['Quiet'] }, { heading: 'Dogs', points: ['Loyal'] }],
  },
  timeline: {
    type: 'diagram' as const,
    subtype: 'timeline' as const,
    title: 'Launch',
    renderer: 'timeline' as const,
    items: [{ title: 'Kickoff' }],
  },
};

const cases = [
  ['infographic', InfographicDiagramSchema, bases.infographic],
  ['mindmap', MindmapDiagramSchema, bases.mindmap],
  ['comparison', ComparisonDiagramSchema, bases.comparison],
  ['timeline', TimelineDiagramSchema, bases.timeline],
] as const;

describe('PATCH-253 stored visual style validation', () => {
  for (const [name, schema, base] of cases) {
    it(`${name}: a stored valid style is kept`, () => {
      const result = schema.safeParse({
        ...base,
        style: { background: '#112233', colors: ['#ff0000'], fonts: { title: { family: 'serif', weight: 700 } } },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { style?: unknown }).style).toEqual({
          background: '#112233',
          colors: ['#ff0000'],
          fonts: { title: { family: 'serif', weight: 700 } },
        });
      }
    });

    it(`${name}: a hostile style is dropped and the post still validates`, () => {
      const result = schema.safeParse({
        ...base,
        style: {
          background: 'url(javascript:1)',
          colors: ['red;x'],
          fonts: { title: { family: 'Comic</style>' } },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) expect((result.data as { style?: unknown }).style).toBeUndefined();
    });
  }
});
