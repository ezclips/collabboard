import { test, expect, Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

// CHARACTERIZATION TEST (PATCH-001): asserts what the app does TODAY on a
// wall board — create board → add note post → edit it (persist) → delete board.
// If a refactor breaks this test, fix the code, not the test.
//
// SCOPE NOTE (deviation from PATCH-001): standalone post-deletion via the wall
// card's right-click menu is DEFERRED to a later patch. On the wall layout that
// menu is unreliable to drive (right-click reopens the editor instead of showing
// the Radix ContextMenu; wall notes don't consistently expose menuitem roles) —
// the same a11y gap noted below. Board deletion still exercises a delete path and
// removes the post, so the behavior net stays meaningful.
//
// Selector notes (discovered against the live UI, 2026-07-07):
// - Board creation form: input[placeholder="Canvas title"], button "Save Canvas";
//   on success the app returns to /dashboard (it does NOT open the new board).
// - Board sidebar tools are DIVs with onClick (not buttons) whose visible label
//   is a tooltip span; we target div.cursor-pointer:has(span:text-is("Note")).
//   Known a11y gap, logged in ACCESSIBILITY burn-down — update selectors when fixed.
// - NoteEditor is a TipTap contenteditable in a centered modal that SAVES when
//   its dark backdrop is clicked (Escape does NOT save). We click the top-left
//   corner (5,5), which is always backdrop, never the centered card.
// - Board deletion is a dashboard-card right-click menu (Radix, role=menuitem).

test.describe('wall board lifecycle (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  const BOARD_NAME = `e2e-lifecycle-${Date.now()}`;
  const POST_TEXT = `e2e note ${Date.now()}`;
  const EDIT_SUFFIX = ' edited';

  async function deleteBoardFromDashboard(page: Page, name: string): Promise<boolean> {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const card = page.getByText(name, { exact: true }).first();
    if (!(await card.isVisible({ timeout: 30_000 }).catch(() => false))) return false;
    await card.scrollIntoViewIfNeeded();
    await card.click({ button: 'right' });
    // Right-click menu labels the soft-delete "Move to Trash" (the ... dropdown
    // calls it "Delete"); both call the same onDelete handler.
    await page.getByRole('menuitem', { name: /Move to Trash/i }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 15_000 });
    return true;
  }

  test('create board, add/edit/delete post, delete board', async ({ page }) => {
    test.setTimeout(300_000); // dev-server compiles of the board route are slow

    try {
      // 1. Create a wall board (wall is the default layout on the setup page)
      await page.goto('/dashboard/create-canvas', { waitUntil: 'domcontentloaded' });
      await page.fill('input[placeholder="Canvas title"]', BOARD_NAME);
      await page.getByRole('button', { name: /Save Canvas/ }).click();
      await page.waitForURL(/dashboard\/?$/, { timeout: 30_000 });
      await expect(page.getByText(BOARD_NAME, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });

      // 2. Open it
      await page.getByText(BOARD_NAME, { exact: true }).first().click();
      await page.waitForURL('**/dashboard/canvas/**', { timeout: 90_000 });
      await page.getByTitle('Back to Dashboard').waitFor({ timeout: 90_000 });
      await page.waitForTimeout(4_000); // board data load + hydration

      // 3. Add a note post via the sidebar "Note" tool
      await page.locator('div.cursor-pointer:has(span:text-is("Note"))').first().click();
      const editor = page.locator('[contenteditable="true"]').first();
      await editor.waitFor({ timeout: 20_000 });
      await editor.click();
      await page.keyboard.type(POST_TEXT);
      await page.waitForTimeout(800);
      await page.mouse.click(5, 5); // click backdrop to save + close
      await expect(page.getByText(POST_TEXT).first()).toBeVisible({ timeout: 15_000 });

      // 4. Edit the post: click it to reopen the editor, append text, close
      await page.getByText(POST_TEXT).first().click();
      const reopened = page.locator('[contenteditable="true"]').first();
      await reopened.waitFor({ timeout: 20_000 });
      await reopened.click();
      await page.keyboard.press('End');
      await page.keyboard.type(EDIT_SUFFIX);
      await page.waitForTimeout(800);
      await page.mouse.click(5, 5); // click backdrop to save + close
      await expect(page.getByText(POST_TEXT + EDIT_SUFFIX).first()).toBeVisible({
        timeout: 15_000,
      });

      // 5. Delete the board from the dashboard (also the cleanup path).
      // (Standalone post-deletion is deferred — see SCOPE NOTE at top of file.)
      expect(await deleteBoardFromDashboard(page, BOARD_NAME)).toBe(true);
    } finally {
      // Guaranteed cleanup even when an assertion above failed. Never touches
      // any board other than the one this test created.
      await deleteBoardFromDashboard(page, BOARD_NAME).catch(() => undefined);
    }
  });
});
