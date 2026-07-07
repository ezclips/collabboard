import { test, expect, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('notification settings (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  async function productUpdatesEmailCheckbox(page: Page): Promise<Locator> {
    const row = page
      .locator('div.px-6.py-4.flex.items-center.justify-between')
      .filter({ hasText: 'Product updates' })
      .first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    return row.locator('input[type="checkbox"]').nth(1);
  }

  test('persists product update email toggle after reload', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/dashboard/settings/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible({
      timeout: 30_000,
    });

    const checkbox = await productUpdatesEmailCheckbox(page);
    const originalValue = await checkbox.isChecked();

    try {
      await checkbox.click();
      await expect(checkbox).toBeChecked({ checked: !originalValue });
      await page.waitForTimeout(1_000);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(await productUpdatesEmailCheckbox(page)).toBeChecked({
        checked: !originalValue,
        timeout: 30_000,
      });
    } finally {
      const restoreCheckbox = await productUpdatesEmailCheckbox(page).catch(() => null);
      if (restoreCheckbox && (await restoreCheckbox.isChecked().catch(() => originalValue)) !== originalValue) {
        await restoreCheckbox.click().catch(() => undefined);
        await expect(restoreCheckbox).toBeChecked({ checked: originalValue }).catch(() => undefined);
      }
    }
  });
});
