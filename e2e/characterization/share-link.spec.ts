import { test, expect } from '@playwright/test';

// Unauthenticated by design (PATCH-015): inline empty storage state overrides
// the project's file-based state, so this spec needs neither credentials nor
// e2e/.auth/user.json — it must run (not skip) on CI, where the not-found
// branch is the only reachable one.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('share link page (characterization)', () => {
  test('renders the not-found state for a definitely invalid token', async ({ page }) => {
    await page.goto('/share/definitely-not-a-real-token-12345', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Link not found' })).toBeVisible({
      timeout: 30_000,
    });
  });
});
