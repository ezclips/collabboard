import { test, expect } from '@playwright/test';
import { E2E_EMAIL, hasE2ECredentials } from '../helpers/env';

test.describe('logs page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('renders activity log entries with the signed-in email', async ({ page }) => {
    await page.goto('/dashboard/settings/logs', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Activity Logs' })).toBeVisible({
      timeout: 30_000,
    });

    const rows = page.locator('div.p-4.hover\\:bg-gray-50');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    await expect(rows.filter({ hasText: E2E_EMAIL }).first()).toBeVisible({ timeout: 30_000 });
  });
});
