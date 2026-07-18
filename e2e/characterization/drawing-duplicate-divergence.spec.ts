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
const PRIMARY_ANNOTATION = 'patch-082-duplicate-divergence-diagnosis' as const;
const EVIDENCE_ANNOTATION = 'patch-082-duplicate-divergence-evidence' as const;
const PATCH_082_PREFIX = 'patch-064-harness-patch-082-divergence-' as const;
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

type CountSnapshot = {
  sourcePadletCount: number;
  totalPadletCount: number;
  embeddableContainerCount: number;
};

type VerifiedFitEvidence = {
  zoomBefore: string | null;
  zoomAfter: string | null;
  zoomReadableBefore: boolean;
  zoomReadableAfter: boolean;
  performedEmptyCanvasClick: boolean;
  performedShift1: boolean;
  applied: boolean;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  postFitFrameLabels: LiveFrameLabel[];
  postFitCounts: CountSnapshot;
};

type FlowResult = {
  prefix: string;
  duplicateRowAppeared: boolean;
  addRowAppeared?: boolean;
  zoomToFitApplied: boolean;
  duplicateFrameLabelAfterFit: boolean;
  duplicateChildRenderAfterFit: boolean;
  duplicatePersistedSettled: boolean;
  evidence: Record<string, unknown>;
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

function duplicateTitleCount(titles: string[], expectedTitle: string): number {
  return titles.filter((title) => title === expectedTitle).length;
}

function newFrameId(before: string[], after: string[]): string | null {
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const diff = [...afterSet].filter((id) => !beforeSet.has(id));
  return diff.length === 1 ? diff[0] : null;
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

async function captureCounts(page: Page, sourceContainerId: string): Promise<CountSnapshot> {
  return {
    sourcePadletCount: await page.locator(`[data-padlet-id="${sourceContainerId}"]`).count(),
    totalPadletCount: await page.locator('[data-padlet-id]').count(),
    embeddableContainerCount: await page.locator('.excalidraw__embeddable-container').count(),
  };
}

async function readZoomDisplay(page: Page): Promise<string | null> {
  const zoomButton = page.locator('button[title="Reset zoom"]').last();
  try {
    await expect(zoomButton).toBeVisible({ timeout: 30_000 });
    const text = await zoomButton.textContent();
    return text?.trim() ?? null;
  } catch {
    return null;
  }
}

async function findEmptyCanvasPoint(page: Page): Promise<{
  point: { x: number; y: number } | null;
  targetSummary: string[] | null;
}> {
  const canvas = page.locator('canvas.excalidraw__canvas.interactive').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const canvasBox = box!;

  const candidate = await page.evaluate(({ x, y, width, height }) => {
    const fractionsX = [0.12, 0.22, 0.32, 0.42, 0.52, 0.62];
    const fractionsY = [0.18, 0.3, 0.42, 0.54, 0.66, 0.78];
    const summarize = (node: Element) => {
      const id = (node as HTMLElement).id || '';
      const className = typeof (node as HTMLElement).className === 'string' ? (node as HTMLElement).className : '';
      const dataPadletId = (node as HTMLElement).getAttribute('data-padlet-id');
      return `${node.tagName.toLowerCase()}#${id}.${className}${dataPadletId ? `[data-padlet-id=${dataPadletId}]` : ''}`;
    };

    for (const fx of fractionsX) {
      for (const fy of fractionsY) {
        const px = Math.round(x + width * fx);
        const py = Math.round(y + height * fy);
        const stack = document.elementsFromPoint(px, py);
        const summary = stack.slice(0, 6).map(summarize);
        const inSidebar = stack.some((node) => node.closest('.fixed.top-0.right-0.bottom-0.w-80'));
        const hitsPadlet = stack.some((node) => (node as HTMLElement).hasAttribute('data-padlet-id'));
        const hitsFrameLabel = stack.some((node) => ((node as HTMLElement).id || '').includes('-frame-name-'));
        const hitsZoomControls = stack.some((node) => node.closest('[title="Reset zoom"]'));
        const first = stack[0] as HTMLElement | undefined;
        const firstIsCanvas = Boolean(first?.classList.contains('excalidraw__canvas'));
        if (!inSidebar && !hitsPadlet && !hitsFrameLabel && !hitsZoomControls && firstIsCanvas) {
          return {
            point: { x: px, y: py },
            targetSummary: summary,
          };
        }
      }
    }
    return { point: null, targetSummary: null };
  }, canvasBox);

  return candidate;
}

async function performVerifiedFit(
  page: Page,
  sourceContainerId: string,
): Promise<VerifiedFitEvidence> {
  const zoomBefore = await readZoomDisplay(page);
  const emptyCanvasCandidate = await findEmptyCanvasPoint(page);

  let performedEmptyCanvasClick = false;
  if (emptyCanvasCandidate.point) {
    await page.mouse.click(emptyCanvasCandidate.point.x, emptyCanvasCandidate.point.y, { button: 'left' });
    performedEmptyCanvasClick = true;
  }

  let performedShift1 = false;
  if (performedEmptyCanvasClick) {
    await page.keyboard.press('Shift+1');
    performedShift1 = true;
  }

  await page.waitForTimeout(750);

  const zoomAfter = await readZoomDisplay(page);
  const postFitFrameLabels = await getLiveFrameLabels(page);
  const postFitCounts = await captureCounts(page, sourceContainerId);

  return {
    zoomBefore,
    zoomAfter,
    zoomReadableBefore: zoomBefore !== null,
    zoomReadableAfter: zoomAfter !== null,
    performedEmptyCanvasClick,
    performedShift1,
    applied: performedEmptyCanvasClick && performedShift1 && zoomBefore !== null && zoomAfter !== null,
    emptyCanvasPoint: emptyCanvasCandidate.point,
    emptyCanvasTargetSummary: emptyCanvasCandidate.targetSummary,
    postFitFrameLabels,
    postFitCounts,
  };
}

async function observeSettledPersistedFrameIds(
  supabase: any,
  masterPadletId: string,
): Promise<{
  settledFrameIds: string[];
  settledFrameOrder: FrameOrderEntry[];
  observationWindowMs: number;
  pollingIntervalMs: number;
}> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 6_000;
  const startedAt = Date.now();
  let settledFrameOrder: FrameOrderEntry[] = [];

  do {
    const settledElements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
    settledFrameOrder = sortedFrameOrder(settledElements);

    if (Date.now() - startedAt >= minimumObservationWindowMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  } while (true);

  return {
    settledFrameIds: frameIds(settledFrameOrder),
    settledFrameOrder,
    observationWindowMs: Date.now() - startedAt,
    pollingIntervalMs,
  };
}

async function runFlowA(page: Page): Promise<FlowResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-082-divergence');

  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);

    expect(fixture.prefix.startsWith(PATCH_082_PREFIX)).toBe(true);

    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const seededFrameIds = frameIds(sortedFrameOrder(seededElements));
    const sourceContainerId = seeded.containers[1].id;

    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLiveFrameLabels = await getLiveFrameLabels(page);
    const baselineLiveFrameIds = baselineLiveFrameLabels.map((entry) => entry.frameId);
    const baselineCounts = await captureCounts(page, sourceContainerId);
    const baselineZoom = await readZoomDisplay(page);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const duplicateMenu = await openMenuForRow(sourceRow);
    await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

    await expect.poll(async () => slideRows(sidebar).count(), {
      timeout: 15_000,
      intervals: [500, 500, 1_000, 1_000, 1_000],
    }).toBe(3);

    const postDuplicateTitles = await listSlideTitles(sidebar);
    const duplicateRowAppeared =
      postDuplicateTitles.length === 3 && duplicateTitleCount(postDuplicateTitles, SOURCE_SLIDE_TITLE) === 2;
    const preFitFrameLabels = await getLiveFrameLabels(page);
    const preFitCounts = await captureCounts(page, sourceContainerId);

    const fit = await performVerifiedFit(page, sourceContainerId);
    const postFitFrameIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateFrameLabelAfterFit = newFrameId(baselineLiveFrameIds, postFitFrameIds) !== null;
    const duplicateChildRenderAfterFit =
      fit.postFitCounts.sourcePadletCount >= 2 ||
      fit.postFitCounts.embeddableContainerCount > baselineCounts.embeddableContainerCount;

    const settled = await observeSettledPersistedFrameIds(supabase, fixture.masterPadletId!);
    const duplicatePersistedSettled = settled.settledFrameIds.some((frameId) => !seededFrameIds.includes(frameId));

    return {
      prefix: fixture.prefix,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      duplicateFrameLabelAfterFit,
      duplicateChildRenderAfterFit,
      duplicatePersistedSettled,
      evidence: {
        flow: 'A',
        boardId: fixture.boardId,
        sourceContainerId,
        baselineTitles,
        baselineLiveFrameIds,
        baselineCounts,
        baselineZoom,
        postDuplicateTitles,
        preFitFrameIds: preFitFrameLabels.map((entry) => entry.frameId),
        preFitCounts,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        postFitFrameIds,
        postFitFrameLabels: fit.postFitFrameLabels,
        postFitCounts: fit.postFitCounts,
        settledFrameIds: settled.settledFrameIds,
        settledFrameOrder: settled.settledFrameOrder,
        settledObservationWindowMs: settled.observationWindowMs,
        settledPollingIntervalMs: settled.pollingIntervalMs,
      },
    };
  } finally {
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

async function runFlowB(page: Page): Promise<FlowResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-082-divergence');

  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);

    expect(fixture.prefix.startsWith(PATCH_082_PREFIX)).toBe(true);

    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const seededFrameIds = frameIds(sortedFrameOrder(seededElements));
    const sourceContainerId = seeded.containers[1].id;

    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLiveFrameLabels = await getLiveFrameLabels(page);
    const baselineLiveFrameIds = baselineLiveFrameLabels.map((entry) => entry.frameId);
    const baselineCounts = await captureCounts(page, sourceContainerId);
    const baselineZoom = await readZoomDisplay(page);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const addMenu = await openMenuForRow(sourceRow);
    await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });

    await expect.poll(async () => slideRows(sidebar).count(), {
      timeout: 15_000,
      intervals: [500, 500, 1_000, 1_000, 1_000],
    }).toBe(3);

    const postAddTitles = await listSlideTitles(sidebar);
    const addRowAppeared = postAddTitles.length === 3;
    const postAddLiveFrameLabels = await getLiveFrameLabels(page);
    const postAddLiveFrameIds = postAddLiveFrameLabels.map((entry) => entry.frameId);
    const addFrameId = newFrameId(baselineLiveFrameIds, postAddLiveFrameIds);

    const sourceRowAfterAdd = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const duplicateMenu = await openMenuForRow(sourceRowAfterAdd);
    await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

    await expect.poll(async () => slideRows(sidebar).count(), {
      timeout: 15_000,
      intervals: [500, 500, 1_000, 1_000, 1_000],
    }).toBe(4);

    const postDuplicateTitles = await listSlideTitles(sidebar);
    const duplicateRowAppeared =
      postDuplicateTitles.length === 4 && duplicateTitleCount(postDuplicateTitles, SOURCE_SLIDE_TITLE) === 2;
    const preFitFrameLabels = await getLiveFrameLabels(page);
    const preFitCounts = await captureCounts(page, sourceContainerId);

    const fit = await performVerifiedFit(page, sourceContainerId);
    const postFitFrameIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateFrameLabelAfterFit =
      postFitFrameIds.some((frameId) => !baselineLiveFrameIds.includes(frameId) && frameId !== addFrameId);
    const duplicateChildRenderAfterFit =
      fit.postFitCounts.sourcePadletCount >= 2 ||
      fit.postFitCounts.embeddableContainerCount > baselineCounts.embeddableContainerCount;

    const settled = await observeSettledPersistedFrameIds(supabase, fixture.masterPadletId!);
    const duplicatePersistedSettled = settled.settledFrameIds.some(
      (frameId) => !seededFrameIds.includes(frameId) && frameId !== addFrameId,
    );

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      duplicateFrameLabelAfterFit,
      duplicateChildRenderAfterFit,
      duplicatePersistedSettled,
      evidence: {
        flow: 'B',
        boardId: fixture.boardId,
        sourceContainerId,
        baselineTitles,
        baselineLiveFrameIds,
        baselineCounts,
        baselineZoom,
        postAddTitles,
        postAddLiveFrameIds,
        addFrameId,
        postDuplicateTitles,
        preFitFrameIds: preFitFrameLabels.map((entry) => entry.frameId),
        preFitCounts,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        postFitFrameIds,
        postFitFrameLabels: fit.postFitFrameLabels,
        postFitCounts: fit.postFitCounts,
        settledFrameIds: settled.settledFrameIds,
        settledFrameOrder: settled.settledFrameOrder,
        settledObservationWindowMs: settled.observationWindowMs,
        settledPollingIntervalMs: settled.pollingIntervalMs,
      },
    };
  } finally {
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

test.describe('drawing duplicate outer-state/live-scene divergence diagnosis (PATCH-082)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes duplicate divergence across duplicate-only and add-then-duplicate flows', async ({ page }) => {
    test.setTimeout(240_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);

    expect(flowA.prefix).not.toBe(flowB.prefix);

    const classification =
      !flowA.duplicateRowAppeared ||
      !flowB.addRowAppeared ||
      !flowB.duplicateRowAppeared ||
      !flowA.zoomToFitApplied ||
      !flowB.zoomToFitApplied
        ? 'divergence-observation-unsound'
        : flowA.duplicatePersistedSettled || flowB.duplicatePersistedSettled
          ? 'unexpected-duplicate-persistence'
          : !flowA.duplicateFrameLabelAfterFit && flowB.duplicateFrameLabelAfterFit
            ? 'prior-add-enables-live-frame'
            : !flowA.duplicateFrameLabelAfterFit && !flowB.duplicateFrameLabelAfterFit
              ? 'no-live-frame-in-either-flow'
              : flowA.duplicateFrameLabelAfterFit && flowB.duplicateFrameLabelAfterFit
                ? 'live-frame-in-both-flows'
                : flowA.duplicateFrameLabelAfterFit && !flowB.duplicateFrameLabelAfterFit
                  ? 'inverse-state-dependence'
                  : 'mixed-divergence-state';

    test.info().annotations.push({
      type: PRIMARY_ANNOTATION,
      description: JSON.stringify({
        flowA_duplicateRowAppeared: flowA.duplicateRowAppeared,
        flowA_zoomToFitApplied: flowA.zoomToFitApplied,
        flowA_duplicateFrameLabelAfterFit: flowA.duplicateFrameLabelAfterFit,
        flowA_duplicateChildRenderAfterFit: flowA.duplicateChildRenderAfterFit,
        flowA_duplicatePersistedSettled: flowA.duplicatePersistedSettled,
        flowB_addRowAppeared: flowB.addRowAppeared ?? false,
        flowB_duplicateRowAppeared: flowB.duplicateRowAppeared,
        flowB_zoomToFitApplied: flowB.zoomToFitApplied,
        flowB_duplicateFrameLabelAfterFit: flowB.duplicateFrameLabelAfterFit,
        flowB_duplicateChildRenderAfterFit: flowB.duplicateChildRenderAfterFit,
        flowB_duplicatePersistedSettled: flowB.duplicatePersistedSettled,
        classification,
        prefixA: flowA.prefix,
        prefixB: flowB.prefix,
      }),
    });

    test.info().annotations.push({
      type: EVIDENCE_ANNOTATION,
      description: JSON.stringify({
        flowA: flowA.evidence,
        flowB: flowB.evidence,
      }),
    });
  });
});
