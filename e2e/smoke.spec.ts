import { test, expect } from '@playwright/test';

// Phase 0 smoke suite: proves the production build serves its core public
// pages without crashing. No auth, no data mutations — safe against any env.

test('home page responds and renders', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'home page should respond').toBeTruthy();
  expect(response!.status(), 'home page should not 5xx').toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
});

test('auth page renders a sign-in form', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
    timeout: 15_000,
  });
});

test('pricing page renders', async ({ page }) => {
  const response = await page.goto('/pricing');
  expect(response!.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
});

test('unknown route does not crash the server', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist-phase0');
  expect(response!.status()).toBe(404);
});
