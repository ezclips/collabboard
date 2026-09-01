import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" path so modules under test can use app-style imports.
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    include: [
      'lib/domain/**/*.test.ts',
      'lib/infra/**/*.test.ts',
      'lib/server/**/*.test.ts',
      'scripts/harness/**/*.test.ts',
      'scripts/*.test.ts',
      'scripts/db/**/*.test.ts',
      'tools/pdf-extraction-prototype/**/*.test.ts',
      'workers/knowledge-pdf/**/*.test.ts',
      'workers/knowledge-embedding/**/*.test.ts',
      'workers/knowledge-query/**/*.test.ts',
      'components/collabboard/*.test.tsx',
      'components/dashboard/*.test.tsx',
      'components/collabboard/editors/*.test.tsx',
      'components/collabboard/comments/*.test.tsx',
      'components/collabboard/canvas/engine/*.test.ts',
      'components/collabboard/canvas/hooks/*.test.ts',
      'components/settings/ai/*.test.ts',
      'components/settings/ai/*.test.tsx',
      'components/ui/*.test.tsx',
      'components/canvas/*.test.tsx',
      'components/map/*.test.tsx',
      'components/graph/*.test.tsx',
      'lib/graph/*.test.ts',
    ],
    environment: 'node',
  },
});
