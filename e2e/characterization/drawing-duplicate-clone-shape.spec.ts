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
const PRIMARY_ANNOTATION = 'patch-081-duplicate-clone-shape-diagnosis' as const;
const PATCH_081_PREFIX = 'patch-064-harness-patch-081-dupshape-' as const;
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

type LiveSignalSnapshot = {
  sourcePadletCount: number;
  totalPadletCount: number;
  embeddableContainerCount: number;
};

type SettledPersistenceObservation = {
  settledElements: SceneElement[];
  settledFrameOrder: FrameOrderEntry[];
  immediateFrameIds: string[];
  immediateChildIds: string[];
  immediateChildFrameIds: string[];
  immediateChildLinks: Array<string | null>;
  settledChildIds: string[];
  settledChildFrameIds: string[];
  settledChildLinks: Array<string | null>;
  duplicateFrameAppearedDuringSettlement: boolean;
  duplicateChildrenAppearedDuringSettlement: boolean;
  observationWindowMs: number;
  pollingIntervalMs: number;
};

type ImmediateLiveObservation = {
  finalFrameLabels: LiveFrameLabel[];
  finalSignals: LiveSignalSnapshot;
  duplicateFrameId: string | null;
  duplicateFrameInLiveSceneImmediate: boolean;
  duplicateChildRenderedImmediate: boolean;
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

function getEmbeddablesForFrame(elements: SceneElement[], frameId: string): SceneElement[] {
  return elements.filter((element) => element.type === 'embeddable' && element.frameId === frameId);
}

function sourceFrameIdFromSeededElements(elements: SceneElement[]): string {
  const sourceFrame = elements.find((element) => element.type === 'frame' && element.name === SOURCE_SLIDE_TITLE);
  expect(sourceFrame).toBeTruthy();
  return sourceFrame!.id;
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

async function captureLiveSignals(page: Page, sourceContainerId: string): Promise<LiveSignalSnapshot> {
  return {
    sourcePadletCount: await page.locator(`[data-padlet-id="${sourceContainerId}"]`).count(),
    totalPadletCount: await page.locator('[data-padlet-id]').count(),
    embeddableContainerCount: await page.locator('.excalidraw__embeddable-container').count(),
  };
}

async function observeImmediateLiveState(
  page: Page,
  sourceContainerId: string,
  baselineLiveFrameIds: string[],
  baselineSignals: LiveSignalSnapshot,
): Promise<ImmediateLiveObservation> {
  const intervalsMs = [250, 500, 500, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000];
  let finalFrameLabels = await getLiveFrameLabels(page);
  let finalSignals = await captureLiveSignals(page, sourceContainerId);
  let duplicateFrameId = newFrameId(baselineLiveFrameIds, finalFrameLabels.map((entry) => entry.frameId));
  let duplicateFrameInLiveSceneImmediate = duplicateFrameId !== null;
  let duplicateChildRenderedImmediate =
    finalSignals.sourcePadletCount >= 2 ||
    finalSignals.embeddableContainerCount > baselineSignals.embeddableContainerCount;

  if (duplicateFrameInLiveSceneImmediate && duplicateChildRenderedImmediate) {
    return {
      finalFrameLabels,
      finalSignals,
      duplicateFrameId,
      duplicateFrameInLiveSceneImmediate,
      duplicateChildRenderedImmediate,
    };
  }

  for (const delayMs of intervalsMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    finalFrameLabels = await getLiveFrameLabels(page);
    finalSignals = await captureLiveSignals(page, sourceContainerId);

    const candidateFrameId = newFrameId(baselineLiveFrameIds, finalFrameLabels.map((entry) => entry.frameId));
    duplicateFrameId ??= candidateFrameId;
    duplicateFrameInLiveSceneImmediate ||= candidateFrameId !== null;
    duplicateChildRenderedImmediate ||=
      finalSignals.sourcePadletCount >= 2 ||
      finalSignals.embeddableContainerCount > baselineSignals.embeddableContainerCount;

    if (duplicateFrameInLiveSceneImmediate && duplicateChildRenderedImmediate) {
      break;
    }
  }

  return {
    finalFrameLabels,
    finalSignals,
    duplicateFrameId,
    duplicateFrameInLiveSceneImmediate,
    duplicateChildRenderedImmediate,
  };
}

async function observeSettledPersistence(
  supabase: any,
  masterPadletId: string,
  duplicateFrameId: string | null,
): Promise<SettledPersistenceObservation> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 6_000;
  const startedAt = Date.now();

  const immediateElements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
  const immediateFrameOrder = sortedFrameOrder(immediateElements);
  const immediateDuplicateChildren = duplicateFrameId ? getEmbeddablesForFrame(immediateElements, duplicateFrameId) : [];

  let settledElements = immediateElements;
  let settledFrameOrder = immediateFrameOrder;
  let duplicateFrameAppearedDuringSettlement =
    duplicateFrameId !== null && frameIds(immediateFrameOrder).includes(duplicateFrameId);
  let duplicateChildrenAppearedDuringSettlement = immediateDuplicateChildren.length > 0;

  do {
    settledElements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
    settledFrameOrder = sortedFrameOrder(settledElements);
    const settledDuplicateChildrenNow = duplicateFrameId ? getEmbeddablesForFrame(settledElements, duplicateFrameId) : [];

    duplicateFrameAppearedDuringSettlement ||= duplicateFrameId !== null && frameIds(settledFrameOrder).includes(duplicateFrameId);
    duplicateChildrenAppearedDuringSettlement ||= settledDuplicateChildrenNow.length > 0;

    if (Date.now() - startedAt >= minimumObservationWindowMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  } while (true);

  const settledDuplicateChildren = duplicateFrameId ? getEmbeddablesForFrame(settledElements, duplicateFrameId) : [];

  return {
    settledElements,
    settledFrameOrder,
    immediateFrameIds: frameIds(immediateFrameOrder),
    immediateChildIds: immediateDuplicateChildren.map((element) => element.id),
    immediateChildFrameIds: immediateDuplicateChildren.map((element) => element.frameId ?? ''),
    immediateChildLinks: immediateDuplicateChildren.map((element) => element.link ?? null),
    settledChildIds: settledDuplicateChildren.map((element) => element.id),
    settledChildFrameIds: settledDuplicateChildren.map((element) => element.frameId ?? ''),
    settledChildLinks: settledDuplicateChildren.map((element) => element.link ?? null),
    duplicateFrameAppearedDuringSettlement,
    duplicateChildrenAppearedDuringSettlement,
    observationWindowMs: Date.now() - startedAt,
    pollingIntervalMs,
  };
}

test.describe('drawing duplicate slide live clone shape diagnosis (PATCH-081)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes duplicate-slide live clone shape through the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-081-dupshape');

    try {
      const seeded = await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      expect(fixture.prefix.startsWith(PATCH_081_PREFIX)).toBe(true);

      const sourceContainerId = seeded.containers[1].id;
      const sourceChildTitle = seeded.children[1].title;
      const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
      const sourceFrameId = sourceFrameIdFromSeededElements(seededElements);
      const sourceEmbeddable = findSourceEmbeddable(seededElements, sourceFrameId, sourceContainerId);
      expect(sourceEmbeddable).toBeTruthy();
      const sourceChildSceneId = sourceEmbeddable!.id;
      const sourceChildFrameId = sourceEmbeddable!.frameId ?? null;
      const sourceLinkValue = sourceEmbeddable!.link ?? null;
      const baselinePersistedFrameOrder = sortedFrameOrder(seededElements);
      const baselinePersistedFrameIds = frameIds(baselinePersistedFrameOrder);
      const baselinePersistedChildIds = getEmbeddablesForFrame(seededElements, sourceFrameId).map((element) => element.id);
      const baselinePersistedSourceLinkCount = sourceLinkValue === null
        ? 0
        : seededElements.filter((element) => element.type === 'embeddable' && element.link === sourceLinkValue).length;

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
      const sidebar = await openPresentationSidebar(page);

      await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
      const baselineVisibleRowCount = await slideRows(sidebar).count();
      const baselineVisibleTitles = await listSlideTitles(sidebar);
      expect(baselineVisibleTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
      const baselineLiveFrameLabels = await getLiveFrameLabels(page);
      const baselineLiveFrameIds = baselineLiveFrameLabels.map((entry) => entry.frameId);
      const baselineSignals = await captureLiveSignals(page, sourceContainerId);
      expect(baselineSignals.sourcePadletCount).toBe(1);
      expect(baselinePersistedSourceLinkCount).toBe(1);

      const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const duplicateMenu = await openMenuForRow(sourceRow);
      await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

      await expect.poll(async () => slideRows(sidebar).count(), {
        timeout: 15_000,
        intervals: [500, 500, 1_000, 1_000, 1_000],
      }).toBe(3);

      const postDuplicateVisibleRowCount = await slideRows(sidebar).count();
      const postDuplicateVisibleTitles = await listSlideTitles(sidebar);
      const duplicateRowAppeared =
        postDuplicateVisibleRowCount === 3 && duplicateTitleCount(postDuplicateVisibleTitles, SOURCE_SLIDE_TITLE) === 2;

      const immediateObservation = await observeImmediateLiveState(
        page,
        sourceContainerId,
        baselineLiveFrameIds,
        baselineSignals,
      );

      const postDuplicateLiveFrameLabels = immediateObservation.finalFrameLabels;
      const postDuplicateLiveFrameIds = postDuplicateLiveFrameLabels.map((entry) => entry.frameId);
      const duplicateFrameId = immediateObservation.duplicateFrameId;
      const duplicateFrameInLiveSceneImmediate = immediateObservation.duplicateFrameInLiveSceneImmediate;
      const immediateSignals = immediateObservation.finalSignals;
      const duplicateChildRenderedImmediate = immediateObservation.duplicateChildRenderedImmediate;
      const sourceChildStillRenderedImmediate = immediateSignals.sourcePadletCount >= 1;

      const immediatePersistedElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
      const immediatePersistedFrameIds = frameIds(sortedFrameOrder(immediatePersistedElements));
      const immediatePersistedDuplicateChildren = duplicateFrameId ? getEmbeddablesForFrame(immediatePersistedElements, duplicateFrameId) : [];

      const persistenceObservation = await observeSettledPersistence(
        supabase,
        fixture.masterPadletId!,
        duplicateFrameId,
      );

      const settledPersistedFrameIds = frameIds(persistenceObservation.settledFrameOrder);
      const duplicatePersistedSettled =
        duplicateFrameId !== null && settledPersistedFrameIds.includes(duplicateFrameId);
      const duplicateChildrenPersistedSettled =
        duplicateFrameId !== null && persistenceObservation.settledChildIds.length > 0;
      const sourceFrameSurvivedSettlement = settledPersistedFrameIds.includes(sourceFrameId);
      const sourceChildSurvivedSettlement =
        persistenceObservation.settledElements.some((element) => element.id === sourceChildSceneId);
      const settledSharedLinkCount = sourceLinkValue === null
        ? 0
        : persistenceObservation.settledElements.filter((element) => element.type === 'embeddable' && element.link === sourceLinkValue).length;
      const duplicateChildIdsAreFresh =
        persistenceObservation.settledChildIds.length > 0 &&
        persistenceObservation.settledChildIds.every((id) => id !== sourceChildSceneId);
      const duplicateChildrenShareSourceIdentity =
        persistenceObservation.settledChildIds.length > 0 &&
        persistenceObservation.settledChildIds.every((id) => baselinePersistedChildIds.includes(id));

      const stableLiveFrameLabels = await getLiveFrameLabels(page);
      const stableLiveFrameIds = stableLiveFrameLabels.map((entry) => entry.frameId);
      const stableSignals = await captureLiveSignals(page, sourceContainerId);
      const stableVisibleRowCount = await slideRows(sidebar).count();
      const stableVisibleTitles = await listSlideTitles(sidebar);
      const duplicateFrameLiveStable = duplicateFrameId !== null && stableLiveFrameIds.includes(duplicateFrameId);
      const duplicateChildRenderedStable =
        stableSignals.sourcePadletCount >= 2 ||
        stableSignals.embeddableContainerCount > baselineSignals.embeddableContainerCount;
      const sourceChildStillRendered = stableSignals.sourcePadletCount === 1;

      const classification =
        !duplicateRowAppeared
          ? 'mixed-duplicate-clone-state'
          : !duplicateFrameInLiveSceneImmediate
            ? 'sidebar-only-duplicate'
            : duplicatePersistedSettled &&
                duplicateChildrenPersistedSettled &&
                duplicateChildrenShareSourceIdentity
              ? 'frame-with-shared-child-identities'
              : duplicateChildRenderedStable && !duplicatePersistedSettled
                ? 'complete-live-clone-unpersisted'
                : duplicateChildRenderedImmediate && !duplicateChildRenderedStable
                  ? 'frame-with-cloned-children-unpersisted'
                  : !duplicateChildRenderedImmediate && !duplicatePersistedSettled
                    ? 'frame-only-duplicate'
                    : 'mixed-duplicate-clone-state';

      const primaryAnnotation = {
        duplicateRowAppeared,
        duplicateFrameInLiveSceneImmediate,
        duplicateChildRenderedImmediate,
        duplicateFrameLiveStable,
        duplicateChildRenderedStable,
        sourceChildStillRendered,
        duplicatePersistedSettled,
        duplicateChildrenPersistedSettled,
        classification,
        prefix: fixture.prefix,
      };

      test.info().annotations.push({
        type: PRIMARY_ANNOTATION,
        description: JSON.stringify({
          ...primaryAnnotation,
          sourceContainerId,
          sourceChildTitle,
          sourceFrameId,
          sourceChildSceneId,
          sourceChildFrameId,
          sourceLinkValue,
          baselineVisibleRowCount,
          baselineVisibleTitles,
          baselineLiveFrameIds,
          baselinePersistedFrameIds,
          baselinePersistedChildIds,
          baselinePersistedSourceLinkCount,
          baselineSignals,
          postDuplicateVisibleRowCount,
          postDuplicateVisibleTitles,
          postDuplicateLiveFrameIds,
          duplicateFrameId,
          immediateSignals,
          sourceChildStillRenderedImmediate,
          immediatePersistedFrameIds,
          immediatePersistedDuplicateChildIds: immediatePersistedDuplicateChildren.map((element) => element.id),
          immediatePersistedDuplicateChildFrameIds: immediatePersistedDuplicateChildren.map((element) => element.frameId ?? ''),
          immediatePersistedDuplicateChildLinks: immediatePersistedDuplicateChildren.map((element) => element.link ?? null),
          settledPersistedFrameIds,
          settledPersistedDuplicateChildIds: persistenceObservation.settledChildIds,
          settledPersistedDuplicateChildFrameIds: persistenceObservation.settledChildFrameIds,
          settledPersistedDuplicateChildLinks: persistenceObservation.settledChildLinks,
          duplicateFrameAppearedDuringSettlement: persistenceObservation.duplicateFrameAppearedDuringSettlement,
          duplicateChildrenAppearedDuringSettlement: persistenceObservation.duplicateChildrenAppearedDuringSettlement,
          sourceFrameSurvivedSettlement,
          sourceChildSurvivedSettlement,
          settledSharedLinkCount,
          duplicateChildIdsAreFresh,
          stableSignals,
          stableVisibleRowCount,
          stableVisibleTitles,
          stableLiveFrameIds,
          observationWindowMs: persistenceObservation.observationWindowMs,
          pollingIntervalMs: persistenceObservation.pollingIntervalMs,
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
