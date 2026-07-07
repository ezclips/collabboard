import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('settings pages render (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('ai settings page renders', async ({ page }) => {
    await page.goto('/dashboard/settings/ai', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /AI/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('preferences page renders', async ({ page }) => {
    await page.goto('/dashboard/settings/preferences', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Preferences/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
