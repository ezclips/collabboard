import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('integrations page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the current no-integrations state without mutating integrations', async ({ page }) => {
    await page.goto('/dashboard/settings/integrations', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Integrations' }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Google Drive', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Microsoft OneDrive', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // This encodes the test account's current no-integrations state; rebind if the account ever gains a connection.
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('shows the callback success toast from URL params only', async ({ page }) => {
    await page.goto('/dashboard/settings/integrations?status=success&provider=e2e-callback-probe', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'e2e-callback-probe connected' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('shows the callback error toast from the message URL param', async ({ page }) => {
    await page.goto(
      '/dashboard/settings/integrations?status=error&provider=e2e-callback-probe&message=e2e-probe-message',
      { waitUntil: 'domcontentloaded' },
    );

    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'e2e-probe-message' }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
