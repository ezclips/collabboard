import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('password page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the password form and the current passkey-free state without mutating anything', async ({ page }) => {
    await page.goto('/dashboard/settings/password', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Password', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Enter current password')).toBeVisible();
    await expect(page.getByPlaceholder('Enter new password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update password' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reset password by email' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Passkeys', exact: true })).toBeVisible();
    // This encodes the test account's current passkey-free state; rebind if the account ever enrolls one.
    await expect(page.getByText('No passkeys registered yet.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Verify session' })).toHaveCount(0);
    await expect(page.getByText(/Current session: aal1/)).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('rejects a too-short new password client-side with zero network', async ({ page }) => {
    await page.goto('/dashboard/settings/password', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No passkeys registered yet.')).toBeVisible({ timeout: 30_000 });

    const forbidden: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/auth/v1/') || url.includes('/rest/v1/') || url.includes('/api/')) {
        forbidden.push(`${request.method()} ${url}`);
      }
    });

    await page.getByPlaceholder('Enter current password').fill('characterization-probe');
    await page.getByPlaceholder('Enter new password').fill('short');
    await expect(page.getByRole('button', { name: 'Update password' })).toBeEnabled();

    // Hydration-acknowledged click (PATCH-014 Amendment 2 idiom): retry the
    // click until the toast confirms the handler ran. Re-clicks stay in the
    // zero-network validation branch, so the listener assertion is unaffected.
    await expect(async () => {
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(
        page.locator('[data-sonner-toast]', { hasText: 'Password must be at least 15 characters' }).first(),
      ).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });

    expect(forbidden).toEqual([]);
  });
});
