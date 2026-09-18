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
      // Client-safe AI contracts and helpers (attribution, roles). Same trap as
      // components/ai below: without this line a test file here is silently NOT
      // RUN, which is worse than a failing one -- it reports nothing and looks
      // green. lib/ai held no test files at all until this was added.
      'lib/ai/*.test.ts',
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
      'components/collabboard/canvas/hooks/*.test.tsx',
      'components/settings/ai/*.test.ts',
      'components/settings/ai/*.test.tsx',
      // Shared AI components used by several surfaces (the role model chooser).
      // Without this line a test file here is silently NOT RUN, which is worse
      // than a failing one -- it reports nothing and looks green.
      'components/ai/*.test.tsx',
      'components/ui/*.test.tsx',
      'components/canvas/*.test.tsx',
      'components/map/*.test.tsx',
      'components/graph/*.test.tsx',
      'lib/graph/*.test.ts',
    ],
    environment: 'node',
  },
});
