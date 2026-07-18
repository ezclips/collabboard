import { test, expect, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';

const MENU_ITEM_NAMES = [
  'Start presentation',
  'Share presentation',
  'Preview slide',
  'Duplicate slide',
  'Rename slide',
  'Add slide below',
  'Remove slide',
] as const;
const RENAME_ITEM_INDEX = 4;
const PRIMARY_ANNOTATION = 'patch-078-rename-state-diagnosis' as const;
const PATCH_078_PREFIX = 'patch-064-harness-patch-078-rename-' as const;
const SOURCE_SLIDE_TITLE = 'PATCH-064 Portrait' as const;
const OTHER_SLIDE_TITLE = 'PATCH-064 Landscape' as const;
const REPLACEMENT_TITLE = 'PATCH-064 Portrait renamed' as const;

registerDrawingCleanup(test);

type MasterPadletRow = {
  id: string;
  content: string | null;
};

type SceneElement = {
  id: string;
  type: string;
  name?: string | null;
  frameId?: string | null;
  link?: string | null;
  isDeleted?: boolean;
};

function activeSceneElements(master: MasterPadletRow): SceneElement[] {
  const parsed = JSON.parse(master.content ?? '[]') as SceneElement[];
  return parsed.filter((element) => !element.isDeleted);
}

async function fetchMasterPadletRow(supabase: any, masterPadletId: string): Promise<MasterPadletRow> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,content')
    .eq('id', masterPadletId)
    .single();
  if (error) throw error;
  return data;
}

function persistedFrameTitle(elements: SceneElement[], frameId: string): string | null {
  const frame = elements.find((element) => element.id === frameId && element.type === 'frame');
  return frame?.name ?? null;
}

async function observeSettledPersistedTitle(
  supabase: any,
  masterPadletId: string,
  sourceFrameId: string,
  replacementTitle: string,
): Promise<{
  settledTitle: string | null;
  newTitleEverAppearedDuringSettlement: boolean;
  settledFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
}> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 6_000;
  const startedAt = Date.now();
  let newTitleEverAppearedDuringSettlement = false;
  let settledTitle: string | null = null;
  let settledFrameIds: string[] = [];

  do {
    const elements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
    settledTitle = persistedFrameTitle(elements, sourceFrameId);
    settledFrameIds = elements.filter((element) => element.type === 'frame').map((element) => element.id);
    newTitleEverAppearedDuringSettlement ||= settledTitle === replacementTitle;

    if (Date.now() - startedAt >= minimumObservationWindowMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  } while (true);

  return {
    settledTitle,
    newTitleEverAppearedDuringSettlement,
    settledFrameIds,
    observationWindowMs: Date.now() - startedAt,
    pollingIntervalMs,
  };
}

async function openPresentationSidebar(page: Page): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  return sidebar;
}

function slideRows(sidebar: Locator): Locator {
  return sidebar.locator('div.space-y-3 > div.group');
}

function rowTitleSpan(row: Locator): Locator {
  return row.locator('span.truncate').first();
}

function rowCard(row: Locator): Locator {
  return row.locator('div.rounded-xl').first();
}

async function openMenuForRow(row: Locator): Promise<{ menu: Locator; items: Locator[] }> {
  const menuTrigger = row.locator('div.relative.flex-shrink-0.self-end.mb-2 > button').first();
  await expect(menuTrigger).toBeVisible({ timeout: 60_000 });

  const menu = row.locator('div.absolute.right-0.w-52');
  if (!(await menu.isVisible().catch(() => false))) {
    await menuTrigger.click();
    await expect(menu).toBeVisible({ timeout: 60_000 });
  }

  const items = MENU_ITEM_NAMES.map((name) => menu.getByRole('button', { name, exact: true }));
  for (const item of items) {
    await expect(item).toHaveCount(1);
    await expect(item).toBeVisible({ timeout: 60_000 });
  }

  const names = await menu.getByRole('button').allTextContents();
  expect(names.map((name) => name.trim().replace(/\s+/g, ' '))).toEqual([...MENU_ITEM_NAMES]);

  return { menu, items };
}

async function newTitleObservedOutsideSidebar(page: Page, sidebar: Locator, frameNameLabel: Locator): Promise<{
  observed: boolean;
  where: string | null;
  labelText: string | null;
}> {
  const labelText = (await frameNameLabel.count()) > 0
    ? await frameNameLabel.first().textContent().catch(() => null)
    : null;
  if (labelText !== null && labelText.trim() === REPLACEMENT_TITLE) {
    return { observed: true, where: 'excalidraw-frame-name-label', labelText };
  }
  const totalMatches = await page.getByText(REPLACEMENT_TITLE, { exact: true }).count();
  const sidebarMatches = await sidebar.getByText(REPLACEMENT_TITLE, { exact: true }).count();
  if (totalMatches - sidebarMatches > 0) {
    return { observed: true, where: 'non-sidebar-page-text', labelText };
  }
  return { observed: false, where: null, labelText };
}

test.describe('drawing slide rename state-ownership diagnosis (PATCH-078)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes rename-slide title state ownership through the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-078-rename');

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      expect(fixture.prefix.startsWith(PATCH_078_PREFIX)).toBe(true);

      const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
      const sourceFrameId = fixture.frameIds.find((frameId) => {
        const frame = seededElements.find((element) => element.id === frameId && element.type === 'frame');
        return frame?.name === SOURCE_SLIDE_TITLE;
      });
      expect(sourceFrameId).toBeTruthy();
      const seededPersistedTitle = persistedFrameTitle(seededElements, sourceFrameId!);
      expect(seededPersistedTitle).toBe(SOURCE_SLIDE_TITLE);

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
      const sidebar = await openPresentationSidebar(page);

      const rows = slideRows(sidebar);
      await expect(rows).toHaveCount(2, { timeout: 30_000 });
      await expect(rowTitleSpan(rows.nth(0))).toHaveText(OTHER_SLIDE_TITLE, { timeout: 30_000 });
      await expect(rowTitleSpan(rows.nth(1))).toHaveText(SOURCE_SLIDE_TITLE, { timeout: 30_000 });
      const otherRow = rows.nth(0);
      const sourceRow = rows.nth(1);
      const frameNameLabel = page.locator(`[id$="-frame-name-${sourceFrameId}"]`);

      // PHASE 4 — real Rename flow (observation-derived; a broken flow is a
      // valid diagnosis outcome, not a test failure).
      let inputAcceptedRename = false;
      let renameInputAppeared = false;
      let renameInputValueBeforeEnter: string | null = null;
      const { items } = await openMenuForRow(sourceRow);
      await items[RENAME_ITEM_INDEX].click({ timeout: 3_000 });

      const renameInput = sourceRow.locator('input:not([type="checkbox"])');
      try {
        await expect(renameInput).toBeVisible({ timeout: 15_000 });
        renameInputAppeared = true;
      } catch {
        renameInputAppeared = false;
      }

      if (renameInputAppeared) {
        await expect(renameInput).toHaveValue(SOURCE_SLIDE_TITLE, { timeout: 5_000 });
        // startRename pre-selects the whole title ~30ms after mount (the real
        // product flow a user experiences). Wait for that native selection —
        // clicking or chording here would fight it (Ctrl+A is intercepted by
        // the canvas's global chord handler, observed live in run 1).
        let fullTitleSelected = false;
        try {
          await expect
            .poll(
              async () =>
                renameInput.evaluate((el) => {
                  const input = el as HTMLInputElement;
                  return input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0;
                }),
              { timeout: 5_000 },
            )
            .toBe(true);
          fullTitleSelected = true;
        } catch {
          fullTitleSelected = false;
        }
        if (!fullTitleSelected) {
          // Pure-keyboard fallback: caret to end, erase, no modifier chords.
          await renameInput.press('End');
          const currentLength = (await renameInput.inputValue()).length;
          for (let i = 0; i < currentLength; i++) {
            await renameInput.press('Backspace');
          }
        }
        await page.keyboard.type(REPLACEMENT_TITLE);
        renameInputValueBeforeEnter = await renameInput.inputValue();
        await renameInput.press('Enter');
        let renameModeExited = false;
        try {
          await expect(renameInput).toHaveCount(0, { timeout: 5_000 });
          renameModeExited = true;
        } catch {
          renameModeExited = false;
        }
        inputAcceptedRename = renameInputValueBeforeEnter === REPLACEMENT_TITLE && renameModeExited;
      }

      // Immediate persisted read — evidence only, never a derivation basis.
      const immediatePersistedTitle = persistedFrameTitle(
        activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!)),
        sourceFrameId!,
      );

      // PHASE 5 — immediate UI-state observation across a bound 15 s window.
      const uiWindowMs = 15_000;
      const uiPollMs = 500;
      const uiStartedAt = Date.now();
      let sidebarTitleUpdatedWithinWindow = false;
      let newTitleVisibleElsewhere = false;
      let elsewhereWhere: string | null = null;
      let frameLabelTextDuringWindow: string | null = null;
      while (Date.now() - uiStartedAt < uiWindowMs) {
        if (!sidebarTitleUpdatedWithinWindow) {
          const sidebarNewCount = await sidebar.getByText(REPLACEMENT_TITLE, { exact: true }).count();
          sidebarTitleUpdatedWithinWindow = sidebarNewCount > 0;
        }
        if (!newTitleVisibleElsewhere) {
          const elsewhere = await newTitleObservedOutsideSidebar(page, sidebar, frameNameLabel);
          newTitleVisibleElsewhere = elsewhere.observed;
          elsewhereWhere = elsewhere.where ?? elsewhereWhere;
          frameLabelTextDuringWindow = elsewhere.labelText ?? frameLabelTextDuringWindow;
        }
        if (sidebarTitleUpdatedWithinWindow && newTitleVisibleElsewhere) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, uiPollMs));
      }
      const oldTitleStillVisibleInSidebarAfterWindow =
        (await sidebar.getByText(SOURCE_SLIDE_TITLE, { exact: true }).count()) > 0;

      // PHASE 6 — row-switch probe (real thumbnail activation, no reload).
      await rowCard(otherRow).locator('button').first().click();
      await expect(rowCard(otherRow)).toHaveClass(/border-violet-400/, { timeout: 15_000 });
      await rowCard(sourceRow).locator('button').first().click();
      await expect(rowCard(sourceRow)).toHaveClass(/border-violet-400/, { timeout: 15_000 });
      await expect(rowCard(otherRow)).not.toHaveClass(/border-violet-400/, { timeout: 15_000 });
      const postRowSwitchSidebarTitle = (await rowTitleSpan(sourceRow).textContent())?.trim() ?? null;
      const sidebarUpdatedAfterRowSwitch = postRowSwitchSidebarTitle === REPLACEMENT_TITLE;

      // PHASE 7 — settled persistence observation (sole derivation basis).
      const {
        settledTitle: settledPersistedTitle,
        newTitleEverAppearedDuringSettlement,
        settledFrameIds,
        observationWindowMs,
        pollingIntervalMs,
      } = await observeSettledPersistedTitle(
        supabase,
        fixture.masterPadletId!,
        sourceFrameId!,
        REPLACEMENT_TITLE,
      );
      const persistedTitleUpdated = settledPersistedTitle === REPLACEMENT_TITLE;

      // PHASE 8 — real full reload, re-identify by deterministic row order.
      await page.reload();
      await expect(page.getByTitle('Present Frames')).toBeVisible({ timeout: 60_000 });
      const sidebarAfterReload = await openPresentationSidebar(page);
      const rowsAfterReload = slideRows(sidebarAfterReload);
      await expect(rowsAfterReload).toHaveCount(2, { timeout: 30_000 });
      await expect(rowTitleSpan(rowsAfterReload.nth(0))).toHaveText(OTHER_SLIDE_TITLE, { timeout: 30_000 });
      const postReloadSidebarTitle = (await rowTitleSpan(rowsAfterReload.nth(1)).textContent())?.trim() ?? null;
      const sidebarUpdatedAfterReload = postReloadSidebarTitle === REPLACEMENT_TITLE;
      const frameNameLabelAfterReload = page.locator(`[id$="-frame-name-${sourceFrameId}"]`);
      const postReloadFrameLabelText = (await frameNameLabelAfterReload.count()) > 0
        ? (await frameNameLabelAfterReload.first().textContent().catch(() => null))?.trim() ?? null
        : null;

      // PHASE 10 — bound classification order (PATCH-078.md §3).
      const classification = !inputAcceptedRename
        ? 'rename-input-flow-broken'
        : sidebarTitleUpdatedWithinWindow
          ? 'sidebar-updates-correctly'
          : !newTitleVisibleElsewhere && !persistedTitleUpdated
            ? 'rename-not-applied-to-scene'
            : persistedTitleUpdated && sidebarUpdatedAfterReload
              ? 'count-gated-stale-sidebar-persisted'
              : !persistedTitleUpdated
                ? 'count-gated-stale-sidebar-unpersisted'
                : 'mixed-rename-state';

      const primaryAnnotation = {
        inputAcceptedRename,
        sidebarTitleUpdatedWithinWindow,
        newTitleVisibleElsewhere,
        sidebarUpdatedAfterRowSwitch,
        persistedTitleUpdated,
        sidebarUpdatedAfterReload,
        classification,
        prefix: fixture.prefix,
      };

      test.info().annotations.push({
        type: PRIMARY_ANNOTATION,
        description: JSON.stringify({
          ...primaryAnnotation,
          sourceFrameId,
          oldTitle: SOURCE_SLIDE_TITLE,
          replacementTitle: REPLACEMENT_TITLE,
          renameInputAppeared,
          renameInputValueBeforeEnter,
          seededPersistedTitle,
          immediatePersistedTitle,
          settledPersistedTitle,
          newTitleEverAppearedDuringSettlement,
          settledFrameIds,
          persistenceObservationWindowMs: observationWindowMs,
          persistencePollingIntervalMs: pollingIntervalMs,
          uiObservationWindowMs: uiWindowMs,
          uiPollingIntervalMs: uiPollMs,
          oldTitleStillVisibleInSidebarAfterWindow,
          newTitleObservedWhere: elsewhereWhere,
          frameLabelTextDuringWindow: frameLabelTextDuringWindow?.trim() ?? null,
          postRowSwitchSidebarTitle,
          postReloadSidebarTitle,
          postReloadFrameLabelText,
          postReloadRowCount: await rowsAfterReload.count(),
        }),
      });
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
        boards: 0,
        padlets: 0,
        canvasLines: 0,
      });
    }
  });
});
