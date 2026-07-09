import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('members page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the members list and pending-invitations empty state without mutating anything', async ({ page }) => {
    await page.goto('/dashboard/settings/members', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pending invitations' })).toBeVisible();
    // This encodes the test account's current solo-owner, zero-invitations state; rebind if the workspace ever gains a second member or a pending invitation.
    await expect(page.getByText("There aren't any pending invitations currently.")).toBeVisible({ timeout: 30_000 });
    const membersSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Members', level: 2 }),
    });
    await expect(membersSection.locator('table tbody tr')).toHaveCount(1);

    await expect(page.getByText('e2e.causal793@silomails.com')).toBeVisible();
    // CSS uppercase trap (PATCH-020 Amendment 3): the badge paints as "YOU" but its raw text is "You" - bind the raw text, never the painted casing.
    await expect(page.getByText('You', { exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Edit role' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove member' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Create invite link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite user' })).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });
});
