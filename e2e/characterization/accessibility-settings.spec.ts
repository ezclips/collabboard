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
      // The page's save is fire-and-forget; reloading before the POST
      // completes aborts it. Barrier on the save request's response.
      const saveDone = page.waitForResponse(
        (resp) =>
          resp.url().includes('/rest/v1/accessibility_settings') &&
          resp.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await reducedMotion.selectOption(changedValue);
      await expect(reducedMotion).toHaveValue(changedValue);
      await saveDone;

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator('select').nth(1)).toHaveValue(changedValue, { timeout: 30_000 });
    } finally {
      const restoreDone = page
        .waitForResponse(
          (resp) =>
            resp.url().includes('/rest/v1/accessibility_settings') &&
            resp.request().method() === 'POST',
          { timeout: 15_000 },
        )
        .catch(() => undefined);
      await page.locator('select').nth(1).selectOption(originalValue).catch(() => undefined);
      await expect(page.locator('select').nth(1)).toHaveValue(originalValue).catch(() => undefined);
      await restoreDone;
    }
  });
});
