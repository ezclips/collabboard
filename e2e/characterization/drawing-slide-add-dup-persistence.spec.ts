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
const DUPLICATE_ITEM_INDEX = 3;
const ADD_BELOW_ITEM_INDEX = 5;
const PRIMARY_ANNOTATION = 'patch-080-adddup-persistence-diagnosis' as const;
const PATCH_080_PREFIX = 'patch-064-harness-patch-080-adddup-' as const;
const SOURCE_SLIDE_TITLE = 'PATCH-064 Portrait' as const;
const OTHER_SLIDE_TITLE = 'PATCH-064 Landscape' as const;

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
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
};

type FrameOrderEntry = {
  id: string;
  title: string | null;
  x: number;
  y: number;
};

type LiveFrameLabel = {
  frameId: string;
  title: string | null;
};

type SlideRowRef = {
  row: Locator;
  title: string;
  titleIndex: number;
};

type PersistenceObservation = {
  settledElements: SceneElement[];
  settledFrameOrder: FrameOrderEntry[];
  observedFrameId: string | null;
  observedFrameAppearedDuringSettlement: boolean;
  observationWindowMs: number;
  pollingIntervalMs: number;
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

function sortedFrameOrder(elements: SceneElement[]): FrameOrderEntry[] {
  return elements
    .filter((element) => element.type === 'frame')
    .map((element) => ({
      id: element.id,
      title: element.name ?? null,
      x: element.x ?? 0,
      y: element.y ?? 0,
    }))
    .sort((left, right) => {
      if (left.y !== right.y) return left.y - right.y;
      if (left.x !== right.x) return left.x - right.x;
      return left.id.localeCompare(right.id);
    });
}

function frameIds(order: FrameOrderEntry[]): string[] {
  return order.map((entry) => entry.id);
}

function frameTitles(order: FrameOrderEntry[]): string[] {
  return order.map((entry) => entry.title ?? '');
}

function sourceFrameIdFromSeededElements(elements: SceneElement[]): string {
  const sourceFrame = elements.find((element) => element.type === 'frame' && element.name === SOURCE_SLIDE_TITLE);
  expect(sourceFrame).toBeTruthy();
  return sourceFrame!.id;
}

function frameIndex(frameOrder: FrameOrderEntry[], frameId: string | null): number {
  if (!frameId) return -1;
  return frameOrder.findIndex((entry) => entry.id === frameId);
}

function getEmbeddablesForFrame(elements: SceneElement[], frameId: string): SceneElement[] {
  return elements.filter((element) => element.type === 'embeddable' && element.frameId === frameId);
}

function findSourceEmbeddable(elements: SceneElement[], sourceFrameId: string, sourceContainerId: string): SceneElement | undefined {
  return getEmbeddablesForFrame(elements, sourceFrameId).find((element) => element.link === `padlet://${sourceContainerId}`);
}

async function getLiveFrameLabels(page: Page): Promise<LiveFrameLabel[]> {
  const labels = await page.locator('[id*="-frame-name-"]').evaluateAll((nodes) => {
    const marker = '-frame-name-';
    return nodes
      .map((node) => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
          return null;
        }
        const id = element.id ?? '';
        const markerIndex = id.lastIndexOf(marker);
        if (markerIndex === -1) return null;
        return {
          frameId: id.slice(markerIndex + marker.length),
          title: element.textContent?.trim() ?? null,
        };
      })
      .filter((value) => value !== null);
  });
  return labels as LiveFrameLabel[];
}

function newFrameId(before: string[], after: string[]): string | null {
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const diff = [...afterSet].filter((id) => !beforeSet.has(id));
  return diff.length === 1 ? diff[0] : null;
}

function duplicateTitleCount(titles: string[], expectedTitle: string): number {
  return titles.filter((title) => title === expectedTitle).length;
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

async function listSlideTitles(sidebar: Locator): Promise<string[]> {
  const rows = slideRows(sidebar);
  const count = await rows.count();
  const titles: string[] = [];
  for (let i = 0; i < count; i++) {
    titles.push(((await rowTitleSpan(rows.nth(i)).textContent()) ?? '').trim());
  }
  return titles;
}

async function getSlideRowByTitleIndex(sidebar: Locator, slideTitle: string, titleIndex: number): Promise<SlideRowRef> {
  const rows = sidebar
    .getByText(slideTitle, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"group")][1]');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(titleIndex);
  return {
    row: rows.nth(titleIndex),
    title: slideTitle,
    titleIndex,
  };
}

async function openMenuForRow(rowRef: SlideRowRef): Promise<{ menu: Locator; items: Locator[] }> {
  const menuTrigger = rowRef.row.locator('div.relative.flex-shrink-0.self-end.mb-2 > button').first();
  await expect(menuTrigger).toBeVisible({ timeout: 60_000 });

  const menu = rowRef.row.locator('div.absolute.right-0.w-52');
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

async function observeSettledFramePersistence(
  supabase: any,
  masterPadletId: string,
  observedFrameId: string | null,
): Promise<PersistenceObservation> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 6_000;
  const startedAt = Date.now();
  let settledElements: SceneElement[] = [];
  let settledFrameOrder: FrameOrderEntry[] = [];
  let observedFrameAppearedDuringSettlement = false;

  do {
    settledElements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
    settledFrameOrder = sortedFrameOrder(settledElements);
    observedFrameAppearedDuringSettlement ||= observedFrameId !== null && frameIds(settledFrameOrder).includes(observedFrameId);

    if (Date.now() - startedAt >= minimumObservationWindowMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  } while (true);

  return {
    settledElements,
    settledFrameOrder,
    observedFrameId,
    observedFrameAppearedDuringSettlement,
    observationWindowMs: Date.now() - startedAt,
    pollingIntervalMs,
  };
}

test.describe('drawing slide add/duplicate persistence boundary diagnosis (PATCH-080)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes add-slide and duplicate-slide persistence through the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-080-adddup');

    try {
      const seeded = await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      expect(fixture.prefix.startsWith(PATCH_080_PREFIX)).toBe(true);

      const sourceContainerId = seeded.containers[1].id;
      const sourceChildTitle = seeded.children[1].title;
      const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
      const sourceFrameId = sourceFrameIdFromSeededElements(seededElements);
      const sourceEmbeddable = findSourceEmbeddable(seededElements, sourceFrameId, sourceContainerId);
      expect(sourceEmbeddable).toBeTruthy();
      const sourceChildSceneId = sourceEmbeddable!.id;
      const sourceLinkValue = sourceEmbeddable!.link ?? null;
      const initialPersistedFrameOrder = sortedFrameOrder(seededElements);
      const initialPersistedFrameIds = frameIds(initialPersistedFrameOrder);
      const initialPersistedFrameTitles = frameTitles(initialPersistedFrameOrder);

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
      const sidebar = await openPresentationSidebar(page);

      await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
      const initialVisibleRowCount = await slideRows(sidebar).count();
      const initialVisibleTitles = await listSlideTitles(sidebar);
      expect(initialVisibleTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
      const initialLiveFrameLabels = await getLiveFrameLabels(page);
      const initialLiveFrameIds = initialLiveFrameLabels.map((entry) => entry.frameId);

      const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const sourceRowIndex = 1;
      const addMenu = await openMenuForRow(sourceRow);
      await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });

      await expect.poll(async () => slideRows(sidebar).count(), { timeout: 15_000, intervals: [500, 500, 1_000, 1_000, 1_000] }).toBe(3);
      const postAddVisibleRowCount = await slideRows(sidebar).count();
      const postAddVisibleTitles = await listSlideTitles(sidebar);
      const postAddLiveFrameLabels = await getLiveFrameLabels(page);
      const postAddLiveFrameIds = postAddLiveFrameLabels.map((entry) => entry.frameId);
      const addFrameId = newFrameId(initialLiveFrameIds, postAddLiveFrameIds);
      const addRowIndex = postAddVisibleRowCount - 1;
      const addSlideVisible = postAddVisibleRowCount === 3 && addRowIndex === sourceRowIndex + 1;
      const addRowTitle = postAddVisibleTitles[addRowIndex] ?? null;

      const immediateAddElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
      const immediateAddFrameOrder = sortedFrameOrder(immediateAddElements);
      const immediateAddFrameIds = frameIds(immediateAddFrameOrder);
      const immediateAddFrameTitles = frameTitles(immediateAddFrameOrder);
      const immediateAddFramePresent = addFrameId !== null && immediateAddFrameIds.includes(addFrameId);

      const addPersistenceObservation = await observeSettledFramePersistence(
        supabase,
        fixture.masterPadletId!,
        addFrameId,
      );
      const settledAddFrameIds = frameIds(addPersistenceObservation.settledFrameOrder);
      const settledAddFrameTitles = frameTitles(addPersistenceObservation.settledFrameOrder);
      const settledAddFrameEntry = addFrameId
        ? addPersistenceObservation.settledFrameOrder.find((entry) => entry.id === addFrameId) ?? null
        : null;
      const addSlidePersisted =
        addFrameId !== null &&
        settledAddFrameIds.includes(addFrameId) &&
        frameIndex(addPersistenceObservation.settledFrameOrder, addFrameId) === frameIndex(addPersistenceObservation.settledFrameOrder, sourceFrameId) + 1;

      const sourceRowAfterAdd = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const preDuplicateVisibleRowCount = await slideRows(sidebar).count();
      const preDuplicateVisibleTitles = await listSlideTitles(sidebar);
      const preDuplicateLiveFrameLabels = await getLiveFrameLabels(page);
      const preDuplicateLiveFrameIds = preDuplicateLiveFrameLabels.map((entry) => entry.frameId);
      const duplicateMenu = await openMenuForRow(sourceRowAfterAdd);
      await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

      await expect.poll(async () => slideRows(sidebar).count(), { timeout: 15_000, intervals: [500, 500, 1_000, 1_000, 1_000] }).toBe(4);
      const postDuplicateVisibleRowCount = await slideRows(sidebar).count();
      const postDuplicateVisibleTitles = await listSlideTitles(sidebar);
      const postDuplicateLiveFrameLabels = await getLiveFrameLabels(page);
      const postDuplicateLiveFrameIds = postDuplicateLiveFrameLabels.map((entry) => entry.frameId);
      const duplicateFrameId = newFrameId(preDuplicateLiveFrameIds, postDuplicateLiveFrameIds);
      const duplicateSlideVisible = postDuplicateVisibleRowCount === 4 && duplicateTitleCount(postDuplicateVisibleTitles, SOURCE_SLIDE_TITLE) === 2;

      let duplicateRendersSourceChild = false;
      try {
        await expect
          .poll(async () => page.locator(`[data-padlet-id="${sourceContainerId}"]`).count(), {
            timeout: 15_000,
            intervals: [500, 500, 1_000, 1_000, 1_000],
          })
          .toBe(2);
        duplicateRendersSourceChild = true;
      } catch {
        duplicateRendersSourceChild = false;
      }
      const liveRenderedSourcePadletCount = await page.locator(`[data-padlet-id="${sourceContainerId}"]`).count();

      const immediateDuplicateElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
      const immediateDuplicateFrameOrder = sortedFrameOrder(immediateDuplicateElements);
      const immediateDuplicateFrameIds = frameIds(immediateDuplicateFrameOrder);
      const immediateDuplicateFrameTitles = frameTitles(immediateDuplicateFrameOrder);
      const immediateDuplicateFramePresent = duplicateFrameId !== null && immediateDuplicateFrameIds.includes(duplicateFrameId);
      const immediateDuplicateChildLinks = duplicateFrameId
        ? getEmbeddablesForFrame(immediateDuplicateElements, duplicateFrameId).map((element) => element.link ?? null)
        : [];
      const immediateDuplicateChildSceneIds = duplicateFrameId
        ? getEmbeddablesForFrame(immediateDuplicateElements, duplicateFrameId).map((element) => element.id)
        : [];

      const duplicatePersistenceObservation = await observeSettledFramePersistence(
        supabase,
        fixture.masterPadletId!,
        duplicateFrameId,
      );
      const settledDuplicateFrameIds = frameIds(duplicatePersistenceObservation.settledFrameOrder);
      const settledDuplicateFrameTitles = frameTitles(duplicatePersistenceObservation.settledFrameOrder);
      const settledDuplicateFrameEntry = duplicateFrameId
        ? duplicatePersistenceObservation.settledFrameOrder.find((entry) => entry.id === duplicateFrameId) ?? null
        : null;
      const settledDuplicateChildren = duplicateFrameId
        ? getEmbeddablesForFrame(duplicatePersistenceObservation.settledElements, duplicateFrameId)
        : [];
      const settledDuplicateChildLinks = settledDuplicateChildren.map((element) => element.link ?? null);
      const settledDuplicateChildSceneIds = settledDuplicateChildren.map((element) => element.id);
      const sharedSettledDuplicateLinkCount = sourceLinkValue === null
        ? 0
        : duplicatePersistenceObservation.settledElements.filter((element) => element.type === 'embeddable' && element.link === sourceLinkValue).length;
      const duplicateSlidePersisted =
        duplicateFrameId !== null &&
        settledDuplicateFrameIds.includes(duplicateFrameId) &&
        settledDuplicateChildren.length > 0;

      await page.reload();
      await expect(page.getByTitle('Present Frames')).toBeVisible({ timeout: 60_000 });
      const sidebarAfterReload = await openPresentationSidebar(page);
      const postReloadVisibleRowCount = await slideRows(sidebarAfterReload).count();
      const postReloadVisibleTitles = await listSlideTitles(sidebarAfterReload);
      const postReloadLiveFrameLabels = await getLiveFrameLabels(page);
      const postReloadLiveFrameIds = postReloadLiveFrameLabels.map((entry) => entry.frameId);
      const addSlideSurvivedReload = addFrameId !== null && postReloadLiveFrameIds.includes(addFrameId);
      const duplicateSurvivedReload = duplicateFrameId !== null && postReloadLiveFrameIds.includes(duplicateFrameId);
      const sourceChildRenderCountAfterReload = await page.locator(`[data-padlet-id="${sourceContainerId}"]`).count();

      const addPersistenceConsistent = !addSlidePersisted || addSlideSurvivedReload;
      const duplicatePersistenceConsistent = !duplicateSlidePersisted || duplicateSurvivedReload;
      const classification =
        !addSlideVisible ||
        !duplicateSlideVisible ||
        !duplicateRendersSourceChild ||
        !addPersistenceConsistent ||
        !duplicatePersistenceConsistent
          ? 'mixed-slide-persistence-state'
          : addSlidePersisted && !duplicateSlidePersisted
            ? 'add-persists-duplicate-does-not'
            : !addSlidePersisted && !duplicateSlidePersisted
              ? 'neither-add-nor-duplicate-persists'
              : addSlidePersisted && duplicateSlidePersisted
                ? 'both-add-and-duplicate-persist'
                : 'add-does-not-persist-duplicate-persists';

      const primaryAnnotation = {
        addSlideVisible,
        addSlidePersisted,
        addSlideSurvivedReload,
        duplicateSlideVisible,
        duplicateRendersSourceChild,
        duplicateSlidePersisted,
        duplicateSurvivedReload,
        classification,
        prefix: fixture.prefix,
      };

      test.info().annotations.push({
        type: PRIMARY_ANNOTATION,
        description: JSON.stringify({
          ...primaryAnnotation,
          sourceFrameId,
          sourceContainerId,
          sourceChildTitle,
          sourceChildSceneId,
          sourceLinkValue,
          initialVisibleRowCount,
          initialVisibleTitles,
          initialLiveFrameIds,
          initialPersistedFrameIds,
          initialPersistedFrameTitles,
          postAddVisibleRowCount,
          postAddVisibleTitles,
          postAddLiveFrameIds,
          addFrameId,
          addRowIndex,
          sourceRowIndex,
          addRowTitle,
          immediateAddFrameIds,
          immediateAddFrameTitles,
          immediateAddFramePresent,
          settledAddFrameIds,
          settledAddFrameTitles,
          settledAddFrameTitle: settledAddFrameEntry?.title ?? null,
          addFrameAppearedDuringSettlement: addPersistenceObservation.observedFrameAppearedDuringSettlement,
          addPersistenceObservationWindowMs: addPersistenceObservation.observationWindowMs,
          addPersistencePollingIntervalMs: addPersistenceObservation.pollingIntervalMs,
          preDuplicateVisibleRowCount,
          preDuplicateVisibleTitles,
          preDuplicateLiveFrameIds,
          postDuplicateVisibleRowCount,
          postDuplicateVisibleTitles,
          postDuplicateLiveFrameIds,
          duplicateFrameId,
          liveRenderedSourcePadletCount,
          immediateDuplicateFrameIds,
          immediateDuplicateFrameTitles,
          immediateDuplicateFramePresent,
          immediateDuplicateChildSceneIds,
          immediateDuplicateChildLinks,
          settledDuplicateFrameIds,
          settledDuplicateFrameTitles,
          settledDuplicateFrameTitle: settledDuplicateFrameEntry?.title ?? null,
          settledDuplicateChildSceneIds,
          settledDuplicateChildLinks,
          sharedSettledDuplicateLinkCount,
          duplicateFrameAppearedDuringSettlement: duplicatePersistenceObservation.observedFrameAppearedDuringSettlement,
          duplicatePersistenceObservationWindowMs: duplicatePersistenceObservation.observationWindowMs,
          duplicatePersistencePollingIntervalMs: duplicatePersistenceObservation.pollingIntervalMs,
          postReloadVisibleRowCount,
          postReloadVisibleTitles,
          postReloadLiveFrameIds,
          sourceChildRenderCountAfterReload,
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
