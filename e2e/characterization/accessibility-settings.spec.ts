import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('accessibility settings (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('persists reduced motion after reload', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/dashboard/settings/accessibility', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible({
      timeout: 30_000,
    });

    const reducedMotion = page.locator('select').nth(1);
    await expect(reducedMotion).toBeVisible({ timeout: 15_000 });

    const originalValue = await reducedMotion.inputValue();
    const changedValue = originalValue === 'on' ? 'off' : 'on';

    try {
      await reducedMotion.selectOption(changedValue);
      await expect(reducedMotion).toHaveValue(changedValue);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator('select').nth(1)).toHaveValue(changedValue, { timeout: 30_000 });
    } finally {
      await page.locator('select').nth(1).selectOption(originalValue).catch(() => undefined);
      await expect(page.locator('select').nth(1)).toHaveValue(originalValue).catch(() => undefined);
    }
  });
});
