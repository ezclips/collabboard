import { test as setup, expect } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD, hasE2ECredentials, AUTH_STATE_PATH } from './helpers/env';

// Logs in once via the real /auth UI and saves storage state for the
// characterization project. Skips (with a visible reason) when credentials
// are not configured — see .env.e2e.example.
setup('authenticate', async ({ page }) => {
  setup.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  // One retry: on dev servers the form can be visible before React handlers
  // attach, making the first submit a no-op (observed 2026-07-07).
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    const signIn = page.getByRole('button', { name: /^Sign In$/i });
    await signIn.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1500); // hydration settle
    await page.fill('input[name="email"]', E2E_EMAIL);
    await page.fill('input[name="password"]', E2E_PASSWORD);
    await signIn.click();
    try {
      await page.waitForURL('**/dashboard**', { timeout: 45_000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }

  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
