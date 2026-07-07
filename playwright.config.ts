import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH } from './e2e/helpers/env';

// Default: runs against the production build on :3100 (`npm run build` first;
// the webServer block starts `next start` automatically).
// Override: set PW_BASE_URL (e.g. http://localhost:3000) to run against an
// already-running server instead — no webServer is started then. Never run
// `npm run build` while a dev server is running (see SKILL.md).
const baseURL = process.env.PW_BASE_URL || 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Unauthenticated smoke suite — runs with or without credentials.
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Authenticated characterization suite — reuses the session captured
      // by the setup project; skips itself when credentials are absent.
      name: 'characterization',
      testDir: './e2e/characterization',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE_PATH },
    },
  ],
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: 'npm run start -- --port 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
