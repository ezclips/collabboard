import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('workspace settings root (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the reachable cookie-only failure state without mutating shared state', async ({ page }) => {
    await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'Not authenticated' }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/^Workspace settings$/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Logo', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Name', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Workspace URL', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('collabboard.app/', { exact: true })).toBeVisible({ timeout: 30_000 });

    const nameInput = page.getByPlaceholder('Enter workspace name');
    await expect(nameInput).toHaveValue('', { timeout: 30_000 });
    await expect(nameInput).toBeDisabled({ timeout: 30_000 });

    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled({ timeout: 30_000 });
    await expect(page.getByText('You have read-only access', { exact: false })).toBeHidden({
      timeout: 30_000,
    });
  });
});
