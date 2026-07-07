import { test, expect } from '@playwright/test';
import { hasE2ECredentials, E2E_EMAIL } from '../helpers/env';

const baseURL = process.env.PW_BASE_URL || 'http://localhost:3100';

test.describe('landing page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('fresh unauthenticated context renders the signed-out landing content', async ({ browser }) => {
    const context = await browser.newContext();
    await context.clearCookies();
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('link', { name: 'Get Started' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Interactive Boards' })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await context.close();
    }
  });

  test('stored authenticated session shows the signed-in landing variant', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(`Welcome, ${E2E_EMAIL}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Use another account' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible({
      timeout: 30_000,
    });
  });
});
