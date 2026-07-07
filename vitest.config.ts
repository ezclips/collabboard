import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/domain/**/*.test.ts'],
    environment: 'node',
  },
});
