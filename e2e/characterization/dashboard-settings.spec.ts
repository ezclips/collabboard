import { test, expect, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('dashboard settings (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  async function firstLibraryToggle(page: Page): Promise<Locator> {
    const row = page
      .locator('div.px-6.py-4.flex.items-center.justify-between.border-b.border-gray-100.last\\:border-b-0')
      .first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    return row.locator('button');
  }

  async function isShown(toggle: Locator): Promise<boolean> {
    return toggle.evaluate((el) => el.className.includes('bg-purple-600'));
  }

  test('persists one library visibility toggle after reload', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/dashboard/settings/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 30_000,
    });

    const toggle = await firstLibraryToggle(page);
    const originalValue = await isShown(toggle);

    try {
      const saveDone = page.waitForResponse(
        (resp) =>
          resp.url().includes('/rest/v1/dashboard_settings') &&
          resp.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await toggle.click();
      await saveDone;
      await expect
        .poll(async () => isShown(await firstLibraryToggle(page)), { timeout: 30_000 })
        .toBe(!originalValue);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(async () => isShown(await firstLibraryToggle(page)), { timeout: 30_000 })
        .toBe(!originalValue);
    } finally {
      const restoreToggle = await firstLibraryToggle(page).catch(() => null);
      if (restoreToggle && (await isShown(restoreToggle).catch(() => originalValue)) !== originalValue) {
        const restoreDone = page
          .waitForResponse(
            (resp) =>
              resp.url().includes('/rest/v1/dashboard_settings') &&
              resp.request().method() === 'POST',
            { timeout: 15_000 },
          )
          .catch(() => undefined);
        await restoreToggle.click().catch(() => undefined);
        await restoreDone;
        await expect
          .poll(async () => isShown(await firstLibraryToggle(page)), { timeout: 30_000 })
          .toBe(originalValue)
          .catch(() => undefined);
      }
    }
  });
});
