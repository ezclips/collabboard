import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

const baseURL = process.env.PW_BASE_URL || 'http://localhost:3100';

test.describe('protected route (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('allows the stored authenticated session to render the dashboard', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('redirects a fresh unauthenticated context to auth', async ({ browser }) => {
    const context = await browser.newContext();
    await context.clearCookies();
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseURL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/auth/, { timeout: 30_000 });
    } finally {
      await context.close();
    }
  });
});
