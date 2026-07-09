import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('profile page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the reachable cookie-only failure state without mutating shared state', async ({ page }) => {
    await page.goto('/dashboard/settings/profile', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Basic info' })).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'Not authenticated — please log in again' }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/Email change re-auth:/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Strict MFA mode:/)).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('Avatar', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Name', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Email', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Username', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('About', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Class info', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Language', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Account type', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Beta features', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('Not set', { exact: true })).toHaveCount(1);
    await expect(page.getByText('English (US)', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Individual', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByText('Email', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Change email' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Send verification' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Change email' })).toBeHidden({ timeout: 30_000 });
  });
});
