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
import { resolveSlidePadlets } from '@/components/presentation/slide-renderer/resolveSlidePadlets';
import { planSlideComposition } from '@/components/presentation/slide-renderer/planSlideComposition';

const MENU_ITEM_NAMES = [
  'Start presentation',
  'Share presentation',
  'Preview slide',
  'Duplicate slide',
  'Rename slide',
  'Add slide below',
  'Remove slide',
] as const;
const PRIMARY_ANNOTATION = 'patch-076-slide-duplication-diagnosis' as const;
const PATCH_076_PREFIX = 'patch-064-harness-patch-076-dup-' as const;
const SOURCE_SLIDE_TITLE = 'PATCH-064 Portrait' as const;
const LANDSCAPE_SLIDE_TITLE = 'PATCH-064 Landscape' as const;

registerDrawingCleanup(test);

type MasterPadletRow = {
  id: string;
  content: string | null;
};

type BoardPadletRow = {
  id: string;
  title: string;
  content: string | null;
  type: string;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown> | null;
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

type SlideRowRef = {
  row: Locator;
  title: string;
  titleIndex: number;
};

type PersistedDuplicateObservation = {
  persistedPortraitFrameIds: string[];
  duplicateSlideId: string | null;
  duplicateChildSceneId: string | null;
  duplicateLinkValue: string | null;
  sharedLinkEmbeddableCount: number;
  duplicateAppearedInPersistence: boolean;
};

type SettledRemovalSnapshot = {
  finalSourceBackingRow: BoardPadletRow | null;
  finalBoardPadlets: BoardPadletRow[];
  stabilityObservationDurationMs: number;
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

async function fetchBoardPadlets(supabase: any, boardId: string): Promise<BoardPadletRow[]> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,metadata')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchBoardPadletById(supabase: any, id: string): Promise<BoardPadletRow | null> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,metadata')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function observeSettledRemovalState(
  supabase: any,
  boardId: string,
  sourceContainerId: string,
): Promise<SettledRemovalSnapshot> {
  const stabilityWindowMs = 2_000;
  const overallTimeoutMs = 5_000;
  const pollIntervalMs = 500;
  const startedAt = Date.now();
  let stableAbsenceStartedAt: number | null = null;
  let latestSnapshot: SettledRemovalSnapshot | null = null;

  while (Date.now() - startedAt <= overallTimeoutMs) {
    const finalSourceBackingRow = await fetchBoardPadletById(supabase, sourceContainerId);
    const finalBoardPadlets = await fetchBoardPadlets(supabase, boardId);
    const sourceBackingRowAbsentFromBoard = !finalBoardPadlets.some((row) => row.id === sourceContainerId);
    latestSnapshot = {
      finalSourceBackingRow,
      finalBoardPadlets,
      stabilityObservationDurationMs: stableAbsenceStartedAt === null ? 0 : Date.now() - stableAbsenceStartedAt,
    };

    if (finalSourceBackingRow === null && sourceBackingRowAbsentFromBoard) {
      stableAbsenceStartedAt ??= Date.now();
      const stabilityObservationDurationMs = Date.now() - stableAbsenceStartedAt;
      if (stabilityObservationDurationMs >= stabilityWindowMs) {
        return {
          finalSourceBackingRow,
          finalBoardPadlets,
          stabilityObservationDurationMs,
        };
      }
    } else {
      stableAbsenceStartedAt = null;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (latestSnapshot?.finalSourceBackingRow === null) {
    throw new Error('PATCH-076 removal state never proved stable absence across the bounded post-poll window');
  }

  return latestSnapshot ?? {
    finalSourceBackingRow: null,
    finalBoardPadlets: [],
    stabilityObservationDurationMs: 0,
  };
}

function getFrameById(elements: SceneElement[], frameId: string): SceneElement {
  const frame = elements.find((element) => element.id === frameId && element.type === 'frame');
  expect(frame).toBeTruthy();
  return frame!;
}

function getEmbeddablesForFrame(elements: SceneElement[], frameId: string): SceneElement[] {
  return elements.filter((element) => element.type === 'embeddable' && element.frameId === frameId);
}

function getVisibleTextPattern(expectedChildText: string): RegExp {
  return new RegExp(expectedChildText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

function inspectPersistedDuplicateObservation(
  elements: SceneElement[],
  sourceFrameId: string,
  sourceSlideTitle: string,
  sourceLinkValue: string | null,
): PersistedDuplicateObservation {
  const persistedPortraitFrames = elements
    .filter((element) => element.type === 'frame' && element.name === sourceSlideTitle)
    .sort((left, right) => (left.x ?? 0) - (right.x ?? 0));
  const duplicateFrame = persistedPortraitFrames.find((frame) => frame.id !== sourceFrameId) ?? null;
  const duplicateEmbeddables = duplicateFrame ? getEmbeddablesForFrame(elements, duplicateFrame.id) : [];
  const duplicateEmbeddable = duplicateEmbeddables[0] ?? null;
  const sharedLinkEmbeddableCount = sourceLinkValue === null
    ? 0
    : elements.filter((element) => element.type === 'embeddable' && element.link === sourceLinkValue).length;
  const duplicateAppearedInPersistence = duplicateFrame !== null || (
    sourceLinkValue !== null &&
    elements.some((element) =>
      element.type === 'embeddable' &&
      element.link === sourceLinkValue &&
      element.frameId !== sourceFrameId,
    )
  );

  return {
    persistedPortraitFrameIds: persistedPortraitFrames.map((frame) => frame.id),
    duplicateSlideId: duplicateFrame?.id ?? null,
    duplicateChildSceneId: duplicateEmbeddable?.id ?? null,
    duplicateLinkValue: duplicateEmbeddable?.link ?? null,
    sharedLinkEmbeddableCount,
    duplicateAppearedInPersistence,
  };
}

async function observeSettledPersistence(
  supabase: any,
  masterPadletId: string,
  sourceFrameId: string,
  sourceSlideTitle: string,
  sourceLinkValue: string | null,
): Promise<{
  settledElements: SceneElement[];
  settledObservation: PersistedDuplicateObservation;
  duplicateEverAppearedDuringSettlement: boolean;
  observationWindowMs: number;
  pollingIntervalMs: number;
}> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 6_000;
  const startedAt = Date.now();
  let duplicateEverAppearedDuringSettlement = false;
  let settledElements: SceneElement[] = [];
  let settledObservation: PersistedDuplicateObservation = {
    persistedPortraitFrameIds: [],
    duplicateSlideId: null,
    duplicateChildSceneId: null,
    duplicateLinkValue: null,
    sharedLinkEmbeddableCount: 0,
    duplicateAppearedInPersistence: false,
  };

  do {
    const master = await fetchMasterPadletRow(supabase, masterPadletId);
    settledElements = activeSceneElements(master);
    settledObservation = inspectPersistedDuplicateObservation(
      settledElements,
      sourceFrameId,
      sourceSlideTitle,
      sourceLinkValue,
    );
    duplicateEverAppearedDuringSettlement ||= settledObservation.duplicateAppearedInPersistence;

    if (Date.now() - startedAt >= minimumObservationWindowMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  } while (true);

  return {
    settledElements,
    settledObservation,
    duplicateEverAppearedDuringSettlement,
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

async function listSlideTitles(sidebar: Locator): Promise<string[]> {
  return sidebar.getByText(/PATCH-064 (Landscape|Portrait)/).allTextContents();
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

async function startPresentationFromRow(page: Page, rowRef: SlideRowRef, expectedCounter: string, expectedChildText: string): Promise<void> {
  const { items } = await openMenuForRow(rowRef);
  await items[0].click({ timeout: 3_000 });
  await expect(page.getByText(expectedCounter, { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => {
    const nodes = await page.getByText(getVisibleTextPattern(expectedChildText)).evaluateAll((elements) =>
      elements.map((element) => {
        const node = element as HTMLElement;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }),
    );
    return nodes.some(Boolean);
  }, { timeout: 60_000 }).toBe(true);
  await page.getByText('End presentation', { exact: true }).click();
  await expect(page.getByText(expectedCounter, { exact: true })).toHaveCount(0);
}

async function presentationShowsChildContent(
  page: Page,
  rowRef: SlideRowRef,
  expectedCounter: string,
  expectedChildText: string,
): Promise<boolean> {
  const { items } = await openMenuForRow(rowRef);
  await items[0].click({ timeout: 3_000 });
  await expect(page.getByText(expectedCounter, { exact: true })).toBeVisible({ timeout: 60_000 });
  const childVisible = await page.getByText(getVisibleTextPattern(expectedChildText)).evaluateAll((elements) =>
    elements.some((element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }),
  ).catch(() => false);
  await page.getByText('End presentation', { exact: true }).click();
  await expect(page.getByText(expectedCounter, { exact: true })).toHaveCount(0);
  return childVisible;
}

test.describe('drawing slide duplication shared-reference diagnosis (PATCH-076)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes duplicate-slide shared padlet link behavior through the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-076-dup');

    try {
      const seeded = await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      expect(fixture.prefix.startsWith(PATCH_076_PREFIX)).toBe(true);
      const sourceContainerId = seeded.containers[1].id;
      const sourceChildTitle = seeded.children[1].title;

      const padletsBeforeDuplicate = await fetchBoardPadlets(supabase, fixture.boardId);
      const padletIdsBeforeDuplicate = new Set(padletsBeforeDuplicate.map((row) => row.id));
      const rowsPresentBeforeDuplicate = padletsBeforeDuplicate.length;
      const masterBeforeDuplicate = await fetchMasterPadletRow(supabase, fixture.masterPadletId!);
      const elementsBeforeDuplicate = activeSceneElements(masterBeforeDuplicate);
      const sourceFrameBeforeDuplicate = fixture.frameIds.find((frameId) => {
        const frame = getFrameById(elementsBeforeDuplicate, frameId);
        return frame.name === SOURCE_SLIDE_TITLE;
      });
      expect(sourceFrameBeforeDuplicate).toBeTruthy();
      const sourceFrameId = sourceFrameBeforeDuplicate!;
      const sourceFrameBefore = getFrameById(elementsBeforeDuplicate, sourceFrameId);
      const sourceEmbeddableBefore = getEmbeddablesForFrame(elementsBeforeDuplicate, sourceFrameId).find(
        (element) => element.link === `padlet://${sourceContainerId}`,
      );
      expect(sourceEmbeddableBefore).toBeTruthy();
      const sourceChildSceneId = sourceEmbeddableBefore!.id;
      const sourceLinkValue = sourceEmbeddableBefore!.link ?? null;

      const initialComposition = resolveSlidePadlets(sourceFrameBefore as any, elementsBeforeDuplicate, padletsBeforeDuplicate as any);
      expect(initialComposition.map((entry) => String(entry.padlet.id))).toContain(sourceContainerId);

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
      const sidebar = await openPresentationSidebar(page);

      const titlesBeforeDuplicate = await listSlideTitles(sidebar);
      expect(titlesBeforeDuplicate).toEqual([LANDSCAPE_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
      const sourceRowBeforeDuplicate = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const duplicateMenu = await openMenuForRow(sourceRowBeforeDuplicate);
      await duplicateMenu.items[3].click({ timeout: 3_000 });

      await expect.poll(async () => sidebar.getByText(SOURCE_SLIDE_TITLE, { exact: true }).count(), { timeout: 60_000 }).toBe(2);
      const titlesAfterDuplicate = await listSlideTitles(sidebar);
      expect(titlesAfterDuplicate).toEqual([LANDSCAPE_SLIDE_TITLE, SOURCE_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);

      const padletsAfterDuplicate = await fetchBoardPadlets(supabase, fixture.boardId);
      const rowsPresentAfterDuplicate = padletsAfterDuplicate.length;
      const newPadletRowsAfterDuplicate = padletsAfterDuplicate.filter((row) => !padletIdsBeforeDuplicate.has(row.id)).length;

      const immediatePersistedElementsAfterDuplicate = activeSceneElements(
        await fetchMasterPadletRow(supabase, fixture.masterPadletId!),
      );
      const immediatePersistedObservation = inspectPersistedDuplicateObservation(
        immediatePersistedElementsAfterDuplicate,
        sourceFrameId,
        SOURCE_SLIDE_TITLE,
        sourceLinkValue,
      );
      const {
        settledElements: settledPersistedElementsAfterDuplicate,
        settledObservation,
        duplicateEverAppearedDuringSettlement,
        observationWindowMs,
        pollingIntervalMs,
      } = await observeSettledPersistence(
        supabase,
        fixture.masterPadletId!,
        sourceFrameId,
        SOURCE_SLIDE_TITLE,
        sourceLinkValue,
      );
      const sourceFrameAfterDuplicate = settledPersistedElementsAfterDuplicate.find(
        (frame) => frame.id === sourceFrameId && frame.type === 'frame',
      );
      expect(sourceFrameAfterDuplicate).toBeTruthy();
      const duplicateSlideId = settledObservation.duplicateSlideId;
      const settledDuplicateFrameAfterDuplicate = duplicateSlideId
        ? settledPersistedElementsAfterDuplicate.find((frame) => frame.id === duplicateSlideId && frame.type === 'frame') ?? null
        : null;
      const duplicateObservedTitle = titlesAfterDuplicate[2] ?? SOURCE_SLIDE_TITLE;
      const sourceEmbeddablesAfterDuplicate = getEmbeddablesForFrame(settledPersistedElementsAfterDuplicate, sourceFrameId);
      const duplicateEmbeddablesAfterDuplicate = duplicateSlideId
        ? getEmbeddablesForFrame(settledPersistedElementsAfterDuplicate, duplicateSlideId)
        : [];
      expect(sourceEmbeddablesAfterDuplicate).toHaveLength(1);
      const duplicateChildSceneId = settledObservation.duplicateChildSceneId;
      const duplicateLinkValue = settledObservation.duplicateLinkValue;
      const duplicatePersistedToDatabase =
        duplicateSlideId !== null &&
        duplicateChildSceneId !== null &&
        duplicateLinkValue !== null;
      const sharedLinkEmbeddableCount = settledObservation.sharedLinkEmbeddableCount;

      const sourceResolvedAfterDuplicate = resolveSlidePadlets(sourceFrameAfterDuplicate as any, settledPersistedElementsAfterDuplicate, padletsAfterDuplicate as any);
      const duplicateResolvedAfterDuplicate = settledDuplicateFrameAfterDuplicate
        ? resolveSlidePadlets(settledDuplicateFrameAfterDuplicate as any, settledPersistedElementsAfterDuplicate, padletsAfterDuplicate as any)
        : [];
      const sourcePlannedAfterDuplicate = planSlideComposition(sourceFrameAfterDuplicate as any, settledPersistedElementsAfterDuplicate, padletsAfterDuplicate as any);
      const duplicatePlannedAfterDuplicate = settledDuplicateFrameAfterDuplicate
        ? planSlideComposition(settledDuplicateFrameAfterDuplicate as any, settledPersistedElementsAfterDuplicate, padletsAfterDuplicate as any)
        : { resolvedPadlets: [] as Array<{ padlet: { id: string } }> };

      const sourceResolvedPadletIds = sourceResolvedAfterDuplicate.map((entry) => String(entry.padlet.id));
      const duplicateResolvedPadletIds = duplicateResolvedAfterDuplicate.map((entry) => String(entry.padlet.id));

      await startPresentationFromRow(page, await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0), 'Slide 2 / 3', sourceChildTitle);
      const duplicateRendersSameChild = await presentationShowsChildContent(
        page,
        await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 1),
        'Slide 3 / 3',
        sourceChildTitle,
      );
      expect(duplicateRendersSameChild).toBe(true);

      const duplicateRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 1);
      page.once('dialog', (dialog) => dialog.accept());
      const removeMenu = await openMenuForRow(duplicateRow);
      await removeMenu.items[6].click({ timeout: 3_000 });

      await expect.poll(async () => sidebar.getByText(SOURCE_SLIDE_TITLE, { exact: true }).count(), { timeout: 60_000 }).toBe(1);
      const titlesAfterRemove = await listSlideTitles(sidebar);
      expect(titlesAfterRemove).toEqual([LANDSCAPE_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);

      let exactBackingRowPollResult: 'deleted-within-timeout' | 'still-present-after-timeout' = 'still-present-after-timeout';
      try {
        await expect.poll(
          async () => (await fetchBoardPadletById(supabase, sourceContainerId)) === null,
          {
            timeout: 15_000,
            intervals: [500, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000],
          },
        ).toBe(true);
        exactBackingRowPollResult = 'deleted-within-timeout';
      } catch (error) {
        const sharedRowAfterBoundedPoll = await fetchBoardPadletById(supabase, sourceContainerId);
        if (sharedRowAfterBoundedPoll === null) {
          exactBackingRowPollResult = 'deleted-within-timeout';
        } else if (error instanceof Error && /Timeout/i.test(error.message)) {
          exactBackingRowPollResult = 'still-present-after-timeout';
        } else {
          throw error;
        }
      }
      const {
        finalSourceBackingRow,
        finalBoardPadlets,
        stabilityObservationDurationMs,
      } = await observeSettledRemovalState(supabase, fixture.boardId, sourceContainerId);
      const finalBoardRowIds = finalBoardPadlets.map((row) => row.id);
      const rowsPresentAfterDuplicateRemoval = finalBoardPadlets.length;
      const removedPadletIds = padletsAfterDuplicate
        .map((row) => row.id)
        .filter((rowId) => !finalBoardRowIds.includes(rowId));
      const rowsRemovedByIntentionalAction = removedPadletIds.length;
      const removeDuplicateDeletedSharedRow =
        finalSourceBackingRow === null &&
        !finalBoardRowIds.includes(sourceContainerId);

      const persistedElementsAfterRemove = activeSceneElements(
        await fetchMasterPadletRow(supabase, fixture.masterPadletId!),
      );
      const sourceFrameAfterRemove = persistedElementsAfterRemove.find((element) => element.id === sourceFrameId && element.type === 'frame');
      expect(sourceFrameAfterRemove).toBeTruthy();
      const sourceEmbeddablesAfterRemove = getEmbeddablesForFrame(persistedElementsAfterRemove, sourceFrameId);
      const sourceContainerStillLinkedInScene = sourceEmbeddablesAfterRemove.some((element) => element.link === sourceLinkValue);
      const sourceResolvedAfterRemove = resolveSlidePadlets(
        sourceFrameAfterRemove as any,
        persistedElementsAfterRemove,
        finalBoardPadlets as any,
      );
      const sourcePlannedAfterRemove = planSlideComposition(
        sourceFrameAfterRemove as any,
        persistedElementsAfterRemove,
        finalBoardPadlets as any,
      );
      const remainingPortraitRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const remainingPresentationShowsChild = await presentationShowsChildContent(
        page,
        remainingPortraitRow,
        'Slide 2 / 2',
        sourceChildTitle,
      );
      const originalContainerLostAfterRemove =
        !sourceContainerStillLinkedInScene ||
        sourceResolvedAfterRemove.every((entry) => String(entry.padlet.id) !== sourceContainerId) ||
        !remainingPresentationShowsChild;

      const classification =
        newPadletRowsAfterDuplicate > 0
          ? 'independent-clone'
          : removeDuplicateDeletedSharedRow && originalContainerLostAfterRemove
            ? duplicatePersistedToDatabase
              ? 'shared-reference-with-deletion-cascade'
              : 'unpersisted-duplicate-with-deletion-cascade'
            : 'shared-reference-deletion-guarded';

      const primaryAnnotation = {
        newPadletRowsAfterDuplicate,
        sharedLinkEmbeddableCount,
        duplicateRendersSameChild,
        duplicatePersistedToDatabase,
        removeDuplicateDeletedSharedRow,
        originalContainerLostAfterRemove,
        classification,
        prefix: fixture.prefix,
      };

      test.info().annotations.push(
        {
          type: PRIMARY_ANNOTATION,
          description: JSON.stringify({
            ...primaryAnnotation,
            observedTitle: duplicateObservedTitle,
            sourceSlideId: sourceFrameId,
            duplicateSlideId,
            sourceChildSceneId,
            duplicateChildSceneId,
            sourceLinkValue,
            duplicateLinkValue,
            rowsPresentBeforeDuplicate,
            rowsPresentAfterDuplicate,
            rowsPresentAfterDuplicateRemoval,
            rowsRemovedByIntentionalAction,
            immediatePersistedPortraitFrameIdsAfterDuplicate: immediatePersistedObservation.persistedPortraitFrameIds,
            settledPersistedPortraitFrameIdsAfterDuplicate: settledObservation.persistedPortraitFrameIds,
            duplicateEverAppearedDuringSettlement,
            observationWindowMs,
            pollingIntervalMs,
            immediateDuplicateSlideId: immediatePersistedObservation.duplicateSlideId,
            settledDuplicateSlideId: duplicateSlideId,
            immediateDuplicateChildSceneId: immediatePersistedObservation.duplicateChildSceneId,
            settledDuplicateChildSceneId: duplicateChildSceneId,
            immediateDuplicateLinkValue: immediatePersistedObservation.duplicateLinkValue,
            settledDuplicateLinkValue: duplicateLinkValue,
            exactBackingRowPollResult,
            finalSourceBackingRowId: finalSourceBackingRow?.id ?? null,
            finalBoardScopedRowIds: finalBoardRowIds,
            stabilityObservationDurationMs,
            resolverObservation: {
              sourceAfterDuplicate: sourceResolvedPadletIds,
              duplicateAfterDuplicate: duplicateResolvedPadletIds,
              sourceAfterRemove: sourceResolvedAfterRemove.map((entry) => String(entry.padlet.id)),
            },
            plannerObservation: {
              sourceAfterDuplicate: sourcePlannedAfterDuplicate.resolvedPadlets.map((entry) => String(entry.padlet.id)),
              duplicateAfterDuplicate: duplicatePlannedAfterDuplicate.resolvedPadlets.map((entry) => String(entry.padlet.id)),
              sourceAfterRemove: sourcePlannedAfterRemove.resolvedPadlets.map((entry) => String(entry.padlet.id)),
            },
            sourceContainerStillLinkedInScene,
            remainingPresentationShowsChild,
            persistedSourceContainerStillLinkedInScene: getEmbeddablesForFrame(
              persistedElementsAfterRemove,
              sourceFrameId,
            ).some((element) => element.link === sourceLinkValue),
          }),
        },
      );
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
