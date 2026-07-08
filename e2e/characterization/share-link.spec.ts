import { test, expect } from '@playwright/test';

test.describe('share link page (characterization)', () => {
  test('renders the not-found state for a definitely invalid token', async ({ page }) => {
    await page.goto('/share/definitely-not-a-real-token-12345', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Link not found' })).toBeVisible({
      timeout: 30_000,
    });
  });
});
