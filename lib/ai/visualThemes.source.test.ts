import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-238. The six infographic layouts and the four themed renderers must get
 * every colour from a theme -- no hard-coded hex may remain in them.
 */
const FILES = [
  './infographic/stack.ts',
  './infographic/pyramid.ts',
  './infographic/stairs.ts',
  './infographic/cycle.ts',
  './infographic/funnel.ts',
  './infographic/hub.ts',
  '../../components/ai/renderers/InfographicRenderer.tsx',
  '../../components/ai/renderers/MindmapTreeRenderer.tsx',
  '../../components/ai/renderers/ComparisonDiagramRenderer.tsx',
  '../../components/ai/renderers/TimelineDiagramRenderer.tsx',
];

describe('PATCH-238 no colour literals outside the theme files', () => {
  for (const rel of FILES) {
    it(`${rel} contains no hex colour literal`, () => {
      const source = readFileSync(new URL(rel, import.meta.url), 'utf8');
      const matches = source.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [];
      expect(matches).toEqual([]);
    });
  }
});
