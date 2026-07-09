import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('workspace settings root (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the repaired cookie-session settings form without mutating shared state', async ({ page }) => {
    await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });

    // PATCH-024 repaired this page for cookie sessions: the token now comes
    // from the real session, so loadSettings completes instead of dying on
    // the localStorage guard.
    const nameInput = page.getByPlaceholder('Enter workspace name');
    await expect(nameInput).toBeVisible({ timeout: 30_000 });
    await expect(nameInput).toBeEnabled();
    await expect(nameInput).not.toHaveValue('');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });
});
