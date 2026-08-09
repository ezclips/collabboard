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
    include: ['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts', 'scripts/harness/**/*.test.ts', 'scripts/*.test.ts', 'components/collabboard/*.test.tsx', 'components/collabboard/editors/*.test.tsx', 'components/ui/*.test.tsx', 'components/canvas/*.test.tsx'],
    environment: 'node',
  },
});
