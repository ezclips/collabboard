import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('profile page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the repaired cookie-session profile without mutating shared state', async ({ page }) => {
    await page.goto('/dashboard/settings/profile', { waitUntil: 'domcontentloaded' });

    // Email comes from the session JWT regardless of whether a profiles row
    // exists; .first() because the page may render the email in more than
    // one field (layout unprobeable before the repair exists).
    await expect(page.getByText('e2e.causal793@silomails.com').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });
});
