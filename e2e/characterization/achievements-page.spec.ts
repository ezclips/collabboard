import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('achievements page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('renders the points and belt progress display', async ({ page }) => {
    await page.goto('/dashboard/settings/achievements', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Current belt')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('2026 belt progress')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('div.grid.grid-cols-5.gap-4 > div')).toHaveCount(5, { timeout: 30_000 });
  });
});
