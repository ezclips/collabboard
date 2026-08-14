import { test, expect, type Page, type Locator } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

// CHARACTERIZATION TEST (PATCH 9E.1): proves, in a real Chromium tab against
// the live dev server, that RowColumnContainerCard's Freeform on-canvas
// Container renderer (components/collabboard/canvas/ui/FreeformPadletCards.tsx
// -> components/collabboard/RowColumnContainerCard.tsx) keeps a Document
// child card's rendered geometry (left/right/width) identical whether the
// Container is in its collapsed/internal-scroll state (real native scrollbar
// painted) or its expanded/no-scroll state. jsdom cannot render a real
// scrollbar or do real layout, so this is intentionally NOT a unit test --
// see useScrollbarLane.test.tsx / RowColumnContainerCard.scrollbarLane.test.tsx
// for the jsdom-level coverage this supplements.
//
// Everything here is driven through the real product UI (toolbar buttons,
// right-click context menu, and a real mouse drag), matching the flow the
// user's own bug report was captured from -- no direct DB writes for content
// creation.
//
// Selector notes (discovered against the live UI, 2026-08-14):
// - Freeform toolbar tools are `div.cursor-pointer` rows whose visible label
//   is a child span (same convention as patch-134-document-toolbar.spec.ts).
// - Note (NoteEditor.tsx) and Document (DocumentEditor.tsx) both render
//   through the shared PostEditorShell (z-[1000]), which saves + closes on a
//   genuine backdrop click, not a dedicated button (see
//   closePostEditorShellByBackdrop below). Document's title is a real
//   <input placeholder="Untitled document">; its body, like Note's, is a
//   TipTap contenteditable typed via keyboard.
// - A Note (type 'text') post's context menu offers "Group into Column"
//   (components/collabboard/menus/GroupIntoColumnMenuItem.tsx): a plain
//   menuitem when no Container exists yet (creates one, titled "New Column"
//   by app/dashboard/canvas/[id]/CanvasClient.tsx's groupIntoColumn), or a
//   submenu once one does (pick the existing Container by its title).
// - A Document (type 'card', no svgUrl) post's context menu does NOT offer
//   "Group into Column" -- FreeformPadletCards.tsx's dedicated 'card' render
//   branch never wires onGroupIntoColumn/groupIntoColumnTargets onto its
//   NotePostContextMenu. The only real-UI path to get a Document into a
//   Container is the same generic mouse-based drag every Freeform padlet
//   uses to reposition itself (useCanvasInteractions.ts: mousedown ->
//   mousemove -> mouseup, NOT native HTML5 drag/drop -- confirmed by
//   `data-padlet-id` root divs having no `draggable` attribute), which calls
//   attachPostToContainer() on drop when the dragged rect overlaps a
//   Container's rect (components/collabboard/canvas/engine/utils.ts
//   findContainerOverlappingRect).
// - The on-canvas expand/collapse toggle for a Freeform Container is NOT
//   RowColumnContainerCard's own built-in header button (that only renders
//   when the component is used *uncontrolled*, i.e. no `isExpanded` prop --
//   true for none of the production call sites this investigation found).
//   Every real layout (Freeform, Wall via CardShell, Row, Drawing) passes a
//   controlled `isExpanded` prop instead, so the actual clickable toggle is
//   each layout's own chrome: for Freeform it's the small chevron in the
//   card's title strip, aria-label "Expand" / "Collapse" (not "Expand
//   container" -- that label exists only in RowColumnContainerCard's own
//   dead-in-production uncontrolled header, exercised by its component-level
//   unit tests, not by any real page).

const TS = Date.now();
const BOARD_NAME = `PATCH-9E1-SCROLLBAR-TEST-${TS}`;
const NOTE_BODY = (n: number) =>
  `PATCH-9E1-NOTE-${n}-${TS} Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod ` +
  `tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation.`;
const DOC_TITLE = `PATCH-9E1-DOC-${TS}`;
// The Document's own title only renders on its free-standing root card (via
// CardPreview's caption) -- once dragged into the Container, RowColumnContainerCard
// renders it through PostCardContent -> DocumentCardContent, which shows the
// BODY only (per-child titles are hidden by default; see renderChildTitle in
// RowColumnContainerCard.tsx). So the child card must be located/verified by
// its body text, not its title, once inside the Container.
const DOC_BODY_SNIPPET = `PATCH-9E1 highlighted evidence text ${TS}`;
const DOC_BODY =
  `${DOC_BODY_SNIPPET}. This body is intentionally long so the Container's ` +
  `internal scrollbar reliably activates during this characterization run, reproducing the user's ` +
  `original screenshot scenario of a Document child card inside a scrolling Container.`;

function tool(page: Page, label: string): Locator {
  return page.locator('div.cursor-pointer').filter({ hasText: new RegExp(`^${label}$`) }).first();
}

async function closePostEditorShellByBackdrop(page: Page): Promise<void> {
  // Both Note (NoteEditor.tsx) and Document (DocumentEditor.tsx) render
  // through the shared PostEditorShell (z-[1000]), which saves + closes on a
  // genuine backdrop click (element === currentTarget check in
  // PostEditorShell.tsx handleOverlayClick), not a dedicated button. Try a
  // few corners in case one happens to sit under some other fixed-position
  // chrome (toast region, etc).
  const backdropCandidates: Array<[number, number]> = [[5, 5], [5, 780], [1270, 5], [1270, 780]];
  for (const [x, y] of backdropCandidates) {
    if ((await page.locator('[contenteditable="true"]').count()) === 0) return;
    await page.mouse.click(x, y);
    await page.waitForTimeout(400);
  }
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0, { timeout: 10_000 });
}

async function createNote(page: Page, text: string): Promise<void> {
  await tool(page, 'Note').click();
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.type(text);
  await page.waitForTimeout(400);
  await closePostEditorShellByBackdrop(page);
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

async function createDocument(page: Page, title: string, body: string): Promise<void> {
  // Document (type 'card', no svgUrl) is created via DocumentEditor.tsx --
  // a dedicated rich editor (distinct from the older, simpler CardEditor.tsx
  // "Edit Card" modal) that also renders through PostEditorShell. Title is a
  // real <input placeholder="Untitled document">; the body is a TipTap
  // contenteditable (typed via keyboard, like Note -- not a fillable
  // placeholder field).
  await tool(page, 'Document').click();
  const titleInput = page.getByPlaceholder('Untitled document');
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  await titleInput.fill(title);
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type(body);
  await page.waitForTimeout(400);
  await closePostEditorShellByBackdrop(page);
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

async function groupIntoNewColumn(page: Page, cardText: string): Promise<void> {
  await page.getByText(cardText, { exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Group into Column', exact: true }).click();
  await expect(page.getByText('New Column', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

async function groupIntoExistingColumn(page: Page, cardText: string, columnLabel: string): Promise<void> {
  // GroupIntoColumnMenuItem's submenu always renders a generic "New Column"
  // create-a-new-one item FIRST, then a separator, then the existing
  // Container targets by their own title. Our one Container's title is
  // itself literally "New Column" (the hardcoded default from
  // CanvasClient.tsx's groupIntoColumn), so the label collides with the
  // generic item's label -- the real target is always the LAST match in DOM
  // order (targets render after the generic item + separator).
  await page.getByText(cardText, { exact: true }).first().click({ button: 'right' });
  const subTrigger = page.getByRole('menuitem', { name: 'Group into Column', exact: true });
  await expect(subTrigger).toBeVisible({ timeout: 10_000 });
  await subTrigger.hover();
  const items = page.getByRole('menuitem', { name: columnLabel, exact: true });
  await expect(items.last()).toBeVisible({ timeout: 10_000 });
  await items.last().click();
}

async function dragCardOntoContainer(page: Page, cardText: string, container: Locator): Promise<void> {
  const card = page.getByText(cardText, { exact: true }).first();
  const cardBox = await card.boundingBox();
  const containerBox = await container.boundingBox();
  if (!cardBox || !containerBox) throw new Error('Missing bounding box for drag');
  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = containerBox.x + containerBox.width / 2;
  const endY = containerBox.y + containerBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed PADLET_DRAG_START_DISTANCE (8px) before heading to the target so
  // the real drag-start branch in useCanvasInteractions.ts actually engages.
  await page.mouse.move(startX + 30, startY + 30, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.move(endX, endY, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(1_000);
}

async function deleteBoardOnce(page: Page, name: string): Promise<boolean> {
  // 'domcontentloaded', not 'networkidle': coming straight off a live canvas
  // page (persistent realtime/WS connections) 'networkidle' can stall well
  // past this call's own timeout, silently defeating cleanup (observed
  // directly while building this spec -- a "passed" run still left its board
  // behind because this goto never settled and the outer .catch() swallowed
  // the resulting timeout).
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  const card = page.getByText(name, { exact: true }).first();
  // locator.isVisible() checks CURRENT state with no retry; the dashboard's
  // own client-side board list often hasn't rendered yet right after
  // 'domcontentloaded', so an isVisible() check here returns false
  // immediately instead of waiting. waitFor() polls until the condition
  // holds (or times out), which is what "wait for this to appear" needs.
  const appeared = await card.waitFor({ state: 'visible', timeout: 45_000 }).then(() => true).catch(() => false);
  if (!appeared) return false;
  await card.scrollIntoViewIfNeeded();
  await card.click({ button: 'right' });
  const trashItem = page.getByRole('menuitem', { name: /Move to Trash/i });
  const menuAppeared = await trashItem.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (!menuAppeared) return false;
  await trashItem.click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  return true;
}

// This save/dashboard-navigation round trip proved intermittently flaky
// while building this spec (the board occasionally isn't in the dashboard's
// client-side list yet even after a generous wait, most often after the
// slower ~50s runs) -- retry once before giving up, so cleanup is reliable
// even on a slow dev-server tick rather than only "usually".
async function deleteBoardFromDashboard(page: Page, name: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const deleted = await deleteBoardOnce(page, name).catch(() => false);
    if (deleted) return true;
  }
  return false;
}

test.describe('container scrollbar lane geometry (PATCH 9E.1 characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  // Cleanup lives in a real afterEach hook (not a try/finally inside the test
  // body): Playwright still runs afterEach after a test-body timeout, but a
  // try/finally's `finally` clause races the page/context teardown that
  // follows a timeout and can lose -- observed directly while building this
  // spec (two earlier runs each left an orphaned board behind despite a
  // finally block, which silently ate the "page already closing" error from
  // `deleteBoardFromDashboard`).
  let boardCreated = false;

  test.afterEach(async ({ page }) => {
    if (boardCreated) {
      await deleteBoardFromDashboard(page, BOARD_NAME).catch(() => undefined);
    }
  });

  test('Document child card keeps identical left/right/width between collapsed-scrolling and expanded states', async ({ page }) => {
    test.setTimeout(300_000); // dev-server compiles of the board route are slow (see board-lifecycle.spec.ts)

    // 1. Create a Freeform board (the layout picker defaults to Wall --
      // explicitly switch to Freeform so the on-canvas expand toggle + the
      // generic mouse-drag-into-container mechanics this test relies on are
      // actually the ones under test).
      await page.goto('/dashboard/create-canvas', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Wall', exact: true }).click();
      const freeformHeading = page.getByRole('heading', { name: 'Freeform', exact: true });
      await expect(freeformHeading).toBeVisible({ timeout: 15_000 });
      const freeformCard = freeformHeading.locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
      await freeformCard.getByRole('button', { name: 'Select', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Freeform', exact: true })).toBeVisible({ timeout: 10_000 });

      await page.fill('input[placeholder="Canvas title"]', BOARD_NAME);
      await page.getByRole('button', { name: /Save Canvas/ }).click();
      await page.waitForURL(/dashboard\/?$/, { timeout: 60_000 });
      boardCreated = true;
      await expect(page.getByText(BOARD_NAME, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

      // 2. Open it
      await page.getByText(BOARD_NAME, { exact: true }).first().click();
      await page.waitForURL('**/dashboard/canvas/**', { timeout: 90_000 });
      await expect(page.getByTitle('Back to Dashboard')).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText('Create', { exact: true })).toBeVisible({ timeout: 90_000 }); // Freeform-only toolbar group
      await page.waitForTimeout(2_000); // board data load + hydration

      // 3. Build the Container: Note 1 creates it ("New Column"), Notes 2 & 3
      // join the existing one via the submenu -- three Notes with enough text
      // each to guarantee the stacked content clears the 300px collapse
      // threshold.
      await createNote(page, NOTE_BODY(1));
      await groupIntoNewColumn(page, NOTE_BODY(1));

      await createNote(page, NOTE_BODY(2));
      await groupIntoExistingColumn(page, NOTE_BODY(2), 'New Column');

      await createNote(page, NOTE_BODY(3));
      await groupIntoExistingColumn(page, NOTE_BODY(3), 'New Column');

      // 4. Create the free-standing Document (the user's actual screenshot
      // scenario), then drag it onto the Container -- the only real-UI path
      // available for a Document (its context menu has no "Group into
      // Column" item; see selector notes above).
      await createDocument(page, DOC_TITLE, DOC_BODY);

      const containerRoot = page.locator('[data-padlet-id]').filter({ hasText: 'New Column' }).first();
      await expect(containerRoot).toBeVisible({ timeout: 15_000 });

      await dragCardOntoContainer(page, DOC_TITLE, containerRoot);

      // Confirm the drag actually attached the Document as a child: its body
      // text now renders INSIDE the Container's own data-padlet-id subtree.
      // (Its title does not render as a child -- see DOC_BODY_SNIPPET note.)
      const docInContainer = containerRoot.getByText(DOC_BODY_SNIPPET);
      await expect(docInContainer).toBeVisible({ timeout: 20_000 });

      // 5. Wait for RowColumnContainerCard's overflow-detection effect to
      // flip the expand toggle on (fires once contentMeasureRef.scrollHeight
      // exceeds 300px + 1).
      const expandToggle = containerRoot.getByRole('button', { name: /^(Expand|Expand container)$/ });
      await expect(expandToggle).toBeVisible({ timeout: 20_000 });

      // Sanity: confirm the internal scroll viewport is actually scrolling
      // (real scrollHeight > clientHeight) before trusting "collapsed" below.
      const collapsedScrollState = await containerRoot.evaluate((el) => {
        const scroller = el.querySelector('.scrollbar-ultrathin');
        if (!scroller) return null;
        return { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight };
      });
      expect(collapsedScrollState, 'expected the .scrollbar-ultrathin viewport to exist in the collapsed state').not.toBeNull();
      if (collapsedScrollState) {
        expect(collapsedScrollState.scrollHeight).toBeGreaterThan(collapsedScrollState.clientHeight);
      }

      // 6. Measure the Document child card in the collapsed/scrolling state.
      const documentChildCard = containerRoot.locator('.border-gray-200').filter({ hasText: DOC_BODY_SNIPPET }).first();
      await expect(documentChildCard).toBeVisible({ timeout: 15_000 });
      const collapsedRect = await documentChildCard.boundingBox();
      if (!collapsedRect) throw new Error('Could not measure collapsed-state rect');
      const collapsedPageScroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      await page.screenshot({ path: 'e2e/.artifacts/patch-9e1-collapsed.png' }).catch(() => undefined);

      // 7. Switch to the expanded/no-scroll state and re-measure the SAME
      // child card.
      await expandToggle.click();
      const collapseToggle = containerRoot.getByRole('button', { name: /^(Collapse|Collapse container)$/ });
      await expect(collapseToggle).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(300); // layout settle

      const expandedRect = await documentChildCard.boundingBox();
      if (!expandedRect) throw new Error('Could not measure expanded-state rect');
      const expandedPageScroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      await page.screenshot({ path: 'e2e/.artifacts/patch-9e1-expanded.png' }).catch(() => undefined);

      const deltaLeft = Math.abs(expandedRect.x - collapsedRect.x);
      const deltaRight = Math.abs((expandedRect.x + expandedRect.width) - (collapsedRect.x + collapsedRect.width));
      const deltaWidth = Math.abs(expandedRect.width - collapsedRect.width);

      const resultSummary = {
        collapsedRect,
        expandedRect,
        deltaLeft,
        deltaRight,
        deltaWidth,
        collapsedScrollState,
        collapsedPageScroll,
        expandedPageScroll,
      };
      console.log('PATCH-9E1-SCROLLBAR-GEOMETRY-RESULT', JSON.stringify(resultSummary));
      test.info().annotations.push({
        type: 'patch-9e1-scrollbar-geometry',
        description: JSON.stringify(resultSummary),
      });

      expect(deltaLeft).toBeLessThan(1);
      expect(deltaRight).toBeLessThan(1);
      expect(deltaWidth).toBeLessThan(1);
      expect(collapsedPageScroll.scrollWidth).toBeLessThanOrEqual(collapsedPageScroll.clientWidth + 1);
      expect(expandedPageScroll.scrollWidth).toBeLessThanOrEqual(expandedPageScroll.clientWidth + 1);
  });
});
