import { describe, expect, it } from 'vitest';

import {
  ComparisonDiagramSchema,
  InfographicDiagramSchema,
  MindmapDiagramSchema,
  TimelineDiagramSchema,
} from './validators';

const outline = { title: 'T', ordered: false, kind: 'levels', items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] };

const infographic = {
  type: 'diagram' as const,
  subtype: 'infographic' as const,
  title: 'Water cycle',
  renderer: 'infographic' as const,
  template: 'pyramid' as const,
  outline,
};

const mindmap = {
  type: 'diagram' as const,
  subtype: 'mindmap' as const,
  title: 'Water cycle',
  renderer: 'diagram_code' as const,
  code: 'mindmap\n  root((water))',
  tree: { label: 'Water cycle', children: [{ label: 'Rain' }] },
};

const comparison = {
  type: 'diagram' as const,
  subtype: 'comparison' as const,
  title: 'Cats vs Dogs',
  renderer: 'comparison' as const,
  columns: [{ heading: 'Cats', points: ['Quiet'] }, { heading: 'Dogs', points: ['Loyal'] }],
};

const timeline = {
  type: 'diagram' as const,
  subtype: 'timeline' as const,
  title: 'Launch',
  renderer: 'timeline' as const,
  items: [{ title: 'Kickoff' }],
};

const cases = [
  ['infographic', InfographicDiagramSchema, infographic],
  ['mindmap', MindmapDiagramSchema, mindmap],
  ['comparison', ComparisonDiagramSchema, comparison],
  ['timeline', TimelineDiagramSchema, timeline],
] as const;

describe('PATCH-238 stored theme validation', () => {
  for (const [name, schema, base] of cases) {
    it(`${name}: a post without a theme still validates`, () => {
      const result = schema.safeParse(base);
      expect(result.success).toBe(true);
      if (result.success) expect((result.data as { theme?: string }).theme).toBeUndefined();
    });

    it(`${name}: a known theme validates and is kept`, () => {
      const result = schema.safeParse({ ...base, theme: 'teal-night' });
      expect(result.success).toBe(true);
      if (result.success) expect((result.data as { theme?: string }).theme).toBe('teal-night');
    });

    it(`${name}: an unknown theme is dropped, the post still validates`, () => {
      const result = schema.safeParse({ ...base, theme: 'not-a-theme' });
      expect(result.success).toBe(true);
      if (result.success) expect((result.data as { theme?: string }).theme).toBeUndefined();
    });
  }
});
