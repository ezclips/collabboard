import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('delete-account page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('renders the reachable delete-account flow without submitting deletion', async ({ page }) => {
    await page.goto('/dashboard/settings/delete-account', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: 'Before you delete' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Export any scenes you want to keep')).toBeVisible({
      timeout: 30_000,
    });

    const verifyStep = page.getByRole('button', { name: /Log in/ });
    await expect(async () => {
      await verifyStep.click();
      await expect(page.getByText('Verified', { exact: true })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'Identity verified' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByText('This action is irreversible')).toBeVisible({ timeout: 30_000 });

    const confirmInput = page.getByPlaceholder('DELETE');
    const destructiveButton = page.getByRole('button', { name: 'Permanently delete account' });

    await expect(confirmInput).toBeVisible({ timeout: 30_000 });
    await expect(destructiveButton).toBeDisabled();

    await confirmInput.fill('NOPE');
    await expect(destructiveButton).toBeDisabled();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('This action is irreversible')).toBeHidden({ timeout: 30_000 });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
