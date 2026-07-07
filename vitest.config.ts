import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts'],
    environment: 'node',
  },
});
