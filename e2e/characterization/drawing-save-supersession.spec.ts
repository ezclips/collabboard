import { test, expect, type Locator, type Page, type ConsoleMessage } from '@playwright/test';
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
const PRIMARY_ANNOTATION = 'patch-083-save-supersession-diagnosis' as const;
const EVIDENCE_ANNOTATION = 'patch-083-save-supersession-evidence' as const;
const SAVE_ERROR_SUBSTRING = 'Failed to save drawing to master padlet' as const;
const PREFIX_A_ROOT = 'patch-064-harness-patch-083-flow-a-' as const;
const PREFIX_B_ROOT = 'patch-064-harness-patch-083-flow-b-' as const;
const PREFIX_C_ROOT = 'patch-064-harness-patch-083-flow-c-' as const;
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

type FrameSample = {
  elapsedMs: number;
  frameIds: string[];
  trackedFrames: Record<string, { childIds: string[]; childFrameIds: Array<string | null>; childLinks: Array<string | null> }>;
};

type DistinctSnapshot = {
  frameIds: string[];
  firstSeenMs: number;
  lastSeenMs: number;
  sampleCount: number;
  trackedFrames: Record<string, { childIds: string[]; childFrameIds: Array<string | null>; childLinks: Array<string | null> }>;
};

type PersistenceSeries = {
  samples: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  settledTrackedFrames: Record<string, { childIds: string[]; childFrameIds: Array<string | null>; childLinks: Array<string | null> }>;
  transientFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
};

type ConsoleCapture = {
  observed: boolean;
  count: number;
  texts: string[];
  timestampsMs: number[];
};

type VerifiedFitEvidence = {
  zoomBefore: string | null;
  zoomAfter: string | null;
  performedEmptyCanvasClick: boolean;
  performedShift1: boolean;
  applied: boolean;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  postFitFrameLabels: LiveFrameLabel[];
};

type FlowAEvidence = {
  flow: 'A';
  boardId: string;
  sourceContainerId: string;
  baselineLabelIds: string[];
  baselinePersistedFrameIds: string[];
  postActionLabelIds: string[];
  postFitLabelIds: string[];
  addFrameId: string | null;
  zoomBefore: string | null;
  zoomAfter: string | null;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  settledTrackedFrames: PersistenceSeries['settledTrackedFrames'];
  transientFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
  consoleTexts: string[];
  consoleTimestampsMs: number[];
};

type FlowBEvidence = {
  flow: 'B';
  boardId: string;
  sourceContainerId: string;
  baselineLabelIds: string[];
  baselinePersistedFrameIds: string[];
  postAddLabelIds: string[];
  postActionLabelIds: string[];
  postFitLabelIds: string[];
  addFrameId: string | null;
  duplicateFrameId: string | null;
  zoomBefore: string | null;
  zoomAfter: string | null;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  settledTrackedFrames: PersistenceSeries['settledTrackedFrames'];
  transientFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
  consoleTexts: string[];
  consoleTimestampsMs: number[];
};

type FlowCEvidence = {
  flow: 'C';
  boardId: string;
  sourceContainerId: string;
  baselineLabelIds: string[];
  baselinePersistedFrameIds: string[];
  postActionLabelIds: string[];
  postFitLabelIds: string[];
  duplicateFrameId: string | null;
  zoomBefore: string | null;
  zoomAfter: string | null;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  settledTrackedFrames: PersistenceSeries['settledTrackedFrames'];
  transientFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
  consoleTexts: string[];
  consoleTimestampsMs: number[];
};

type FlowAResult = {
  prefix: string;
  addRowAppeared: boolean;
  zoomToFitApplied: boolean;
  addFrameLiveAfterFit: boolean;
  addEverPersisted: boolean;
  addPersistedSettled: boolean;
  saveErrorObserved: boolean;
  evidence: FlowAEvidence;
};

type FlowBResult = {
  prefix: string;
  addRowAppeared: boolean;
  duplicateRowAppeared: boolean;
  zoomToFitApplied: boolean;
  addFrameLiveAfterFit: boolean;
  duplicateFrameLiveAfterFit: boolean;
  addEverPersisted: boolean;
  addPersistedSettled: boolean;
  duplicateEverPersisted: boolean;
  duplicatePersistedSettled: boolean;
  saveErrorObserved: boolean;
  evidence: FlowBEvidence;
};

type FlowCResult = {
  prefix: string;
  duplicateRowAppeared: boolean;
  zoomToFitApplied: boolean;
  duplicateFrameLiveAfterFit: boolean;
  duplicateEverPersisted: boolean;
  duplicatePersistedSettled: boolean;
  saveErrorObserved: boolean;
  evidence: FlowCEvidence;
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

function newFrameIds(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((id) => !beforeSet.has(id));
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

  return page.evaluate(({ x, y, width, height }) => {
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
}

async function performVerifiedFit(page: Page): Promise<VerifiedFitEvidence> {
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

  return {
    zoomBefore,
    zoomAfter,
    performedEmptyCanvasClick,
    performedShift1,
    applied: performedEmptyCanvasClick && performedShift1 && zoomBefore !== null && zoomAfter !== null,
    emptyCanvasPoint: emptyCanvasCandidate.point,
    emptyCanvasTargetSummary: emptyCanvasCandidate.targetSummary,
    postFitFrameLabels: await getLiveFrameLabels(page),
  };
}

function trackChildren(elements: SceneElement[], trackedFrameIds: Array<string | null>): Record<string, { childIds: string[]; childFrameIds: Array<string | null>; childLinks: Array<string | null> }> {
  const result: Record<string, { childIds: string[]; childFrameIds: Array<string | null>; childLinks: Array<string | null> }> = {};

  for (const frameId of trackedFrameIds) {
    if (!frameId) continue;
    const children = getEmbeddablesForFrame(elements, frameId);
    result[frameId] = {
      childIds: children.map((element) => element.id),
      childFrameIds: children.map((element) => element.frameId ?? null),
      childLinks: children.map((element) => element.link ?? null),
    };
  }

  return result;
}

async function observePersistedFrameSeries(
  supabase: any,
  masterPadletId: string,
  trackedFrameIds: Array<string | null>,
): Promise<PersistenceSeries> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 20_000;
  const minimumStableTailMs = 6_000;
  const startedAt = Date.now();
  const samples: FrameSample[] = [];
  const distinctSnapshots: DistinctSnapshot[] = [];
  let previousKey: string | null = null;
  let lastChangedAt = startedAt;

  while (true) {
    const now = Date.now();
    const elements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
    const sampleFrameIds = frameIds(sortedFrameOrder(elements));
    const trackedFrames = trackChildren(elements, trackedFrameIds);
    const key = JSON.stringify(sampleFrameIds);
    const elapsedMs = now - startedAt;

    samples.push({
      elapsedMs,
      frameIds: sampleFrameIds,
      trackedFrames,
    });

    if (distinctSnapshots.length === 0 || distinctSnapshots[distinctSnapshots.length - 1]!.frameIds.join('\u0000') !== sampleFrameIds.join('\u0000')) {
      distinctSnapshots.push({
        frameIds: sampleFrameIds,
        firstSeenMs: elapsedMs,
        lastSeenMs: elapsedMs,
        sampleCount: 1,
        trackedFrames,
      });
    } else {
      const lastSnapshot = distinctSnapshots[distinctSnapshots.length - 1]!;
      lastSnapshot.lastSeenMs = elapsedMs;
      lastSnapshot.sampleCount += 1;
      lastSnapshot.trackedFrames = trackedFrames;
    }

    if (key !== previousKey) {
      lastChangedAt = now;
      previousKey = key;
    }

    const observationWindowMs = now - startedAt;
    const finalStableDurationMs = now - lastChangedAt;
    if (observationWindowMs >= minimumObservationWindowMs && finalStableDurationMs >= minimumStableTailMs) {
      const settledFrameIds = sampleFrameIds;
      const settledTrackedFrames = trackedFrames;
      const transientFrameIds = [...new Set(
        samples
          .flatMap((sample) => sample.frameIds)
          .filter((frameId) => !settledFrameIds.includes(frameId)),
      )];

      return {
        samples,
        distinctSnapshots,
        settledFrameIds,
        settledTrackedFrames,
        transientFrameIds,
        observationWindowMs,
        pollingIntervalMs,
        finalStableDurationMs,
      };
    }

    await pageWait(pollingIntervalMs);
  }
}

async function pageWait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function startConsoleCapture(page: Page): { finish: () => ConsoleCapture } {
  const startedAt = Date.now();
  const texts: string[] = [];
  const timestampsMs: number[] = [];
  let finished = false;
  const handler = (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!text.includes(SAVE_ERROR_SUBSTRING)) return;
    texts.push(text);
    timestampsMs.push(Date.now() - startedAt);
  };

  page.on('console', handler);

  return {
    finish: () => {
      if (!finished) {
        page.off('console', handler);
        finished = true;
      }
      return {
        observed: texts.length > 0,
        count: texts.length,
        texts,
        timestampsMs,
      };
    },
  };
}

async function waitForNewFrameId(page: Page, baselineLiveFrameIds: string[]): Promise<{ frameId: string | null; labelIds: string[] }> {
  let finalLabelIds = baselineLiveFrameIds;

  try {
    await expect
      .poll(async () => {
        finalLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
        const diff = newFrameIds(baselineLiveFrameIds, finalLabelIds);
        return diff.length === 1 ? diff[0] : diff.length > 1 ? '__multiple__' : '';
      }, {
        timeout: 5_000,
        intervals: [250, 250, 500, 500, 1_000, 1_000, 1_000],
      })
      .not.toBe('');
  } catch {
    finalLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
  }

  const diff = newFrameIds(baselineLiveFrameIds, finalLabelIds);
  return {
    frameId: diff.length === 1 ? diff[0]! : null,
    labelIds: finalLabelIds,
  };
}

async function runFlowA(page: Page): Promise<FlowAResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-083-flow-a');
  const consoleCapture = startConsoleCapture(page);

  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);

    expect(fixture.prefix.startsWith(PREFIX_A_ROOT)).toBe(true);

    const sourceContainerId = seeded.containers[1]!.id;
    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const baselinePersistedFrameIds = frameIds(sortedFrameOrder(seededElements));

    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const addMenu = await openMenuForRow(sourceRow);
    await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });

    let addRowAppeared = false;
    try {
      await expect.poll(async () => slideRows(sidebar).count(), {
        timeout: 15_000,
        intervals: [500, 500, 1_000, 1_000, 1_000],
      }).toBe(3);
      addRowAppeared = true;
    } catch {
      addRowAppeared = false;
    }

    const addCapture = await waitForNewFrameId(page, baselineLabelIds);
    const postActionLabelIds = addCapture.labelIds;
    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const addFrameLiveAfterFit = addCapture.frameId !== null && postFitLabelIds.includes(addCapture.frameId);

    const series = await observePersistedFrameSeries(supabase, fixture.masterPadletId!, [addCapture.frameId]);
    const addEverPersisted = addCapture.frameId !== null && series.samples.some((sample) => sample.frameIds.includes(addCapture.frameId!));
    const addPersistedSettled = addCapture.frameId !== null && series.settledFrameIds.includes(addCapture.frameId);
    const saveCapture = consoleCapture.finish();

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit,
      addEverPersisted,
      addPersistedSettled,
      saveErrorObserved: saveCapture.observed,
      evidence: {
        flow: 'A',
        boardId: fixture.boardId,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postActionLabelIds,
        postFitLabelIds,
        addFrameId: addCapture.frameId,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        persistedSeries: series.samples,
        distinctSnapshots: series.distinctSnapshots,
        settledFrameIds: series.settledFrameIds,
        settledTrackedFrames: series.settledTrackedFrames,
        transientFrameIds: series.transientFrameIds,
        observationWindowMs: series.observationWindowMs,
        pollingIntervalMs: series.pollingIntervalMs,
        finalStableDurationMs: series.finalStableDurationMs,
        consoleTexts: saveCapture.texts,
        consoleTimestampsMs: saveCapture.timestampsMs,
      },
    };
  } finally {
    consoleCapture.finish();
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

async function runFlowB(page: Page): Promise<FlowBResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-083-flow-b');
  const consoleCapture = startConsoleCapture(page);

  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);

    expect(fixture.prefix.startsWith(PREFIX_B_ROOT)).toBe(true);

    const sourceContainerId = seeded.containers[1]!.id;
    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const baselinePersistedFrameIds = frameIds(sortedFrameOrder(seededElements));

    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const addMenu = await openMenuForRow(sourceRow);
    await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });

    let addRowAppeared = false;
    try {
      await expect.poll(async () => slideRows(sidebar).count(), {
        timeout: 15_000,
        intervals: [500, 500, 1_000, 1_000, 1_000],
      }).toBe(3);
      addRowAppeared = true;
    } catch {
      addRowAppeared = false;
    }

    const addCapture = await waitForNewFrameId(page, baselineLabelIds);
    let duplicateRowAppeared = false;
    let postActionLabelIds = addCapture.labelIds;

    if (addRowAppeared) {
      const sourceRowAfterAdd = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const duplicateMenu = await openMenuForRow(sourceRowAfterAdd);
      await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

      try {
        await expect.poll(async () => slideRows(sidebar).count(), {
          timeout: 15_000,
          intervals: [500, 500, 1_000, 1_000, 1_000],
        }).toBe(4);
        const titles = await listSlideTitles(sidebar);
        duplicateRowAppeared = titles.length === 4 && duplicateTitleCount(titles, SOURCE_SLIDE_TITLE) === 2;
      } catch {
        duplicateRowAppeared = false;
      }

      postActionLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    }

    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateCandidates = postFitLabelIds.filter(
      (frameId) => !baselineLabelIds.includes(frameId) && frameId !== addCapture.frameId,
    );
    const duplicateFrameId = duplicateCandidates.length === 1 ? duplicateCandidates[0]! : null;
    const addFrameLiveAfterFit = addCapture.frameId !== null && postFitLabelIds.includes(addCapture.frameId);
    const duplicateFrameLiveAfterFit = duplicateFrameId !== null && postFitLabelIds.includes(duplicateFrameId);

    const series = await observePersistedFrameSeries(supabase, fixture.masterPadletId!, [addCapture.frameId, duplicateFrameId]);
    const addEverPersisted = addCapture.frameId !== null && series.samples.some((sample) => sample.frameIds.includes(addCapture.frameId!));
    const addPersistedSettled = addCapture.frameId !== null && series.settledFrameIds.includes(addCapture.frameId);
    const duplicateEverPersisted = duplicateFrameId !== null && series.samples.some((sample) => sample.frameIds.includes(duplicateFrameId));
    const duplicatePersistedSettled = duplicateFrameId !== null && series.settledFrameIds.includes(duplicateFrameId);
    const saveCapture = consoleCapture.finish();

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit,
      duplicateFrameLiveAfterFit,
      addEverPersisted,
      addPersistedSettled,
      duplicateEverPersisted,
      duplicatePersistedSettled,
      saveErrorObserved: saveCapture.observed,
      evidence: {
        flow: 'B',
        boardId: fixture.boardId,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postAddLabelIds: addCapture.labelIds,
        postActionLabelIds,
        postFitLabelIds,
        addFrameId: addCapture.frameId,
        duplicateFrameId,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        persistedSeries: series.samples,
        distinctSnapshots: series.distinctSnapshots,
        settledFrameIds: series.settledFrameIds,
        settledTrackedFrames: series.settledTrackedFrames,
        transientFrameIds: series.transientFrameIds,
        observationWindowMs: series.observationWindowMs,
        pollingIntervalMs: series.pollingIntervalMs,
        finalStableDurationMs: series.finalStableDurationMs,
        consoleTexts: saveCapture.texts,
        consoleTimestampsMs: saveCapture.timestampsMs,
      },
    };
  } finally {
    consoleCapture.finish();
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

async function runFlowC(page: Page): Promise<FlowCResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-083-flow-c');
  const consoleCapture = startConsoleCapture(page);

  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);

    expect(fixture.prefix.startsWith(PREFIX_C_ROOT)).toBe(true);

    const sourceContainerId = seeded.containers[1]!.id;
    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const baselinePersistedFrameIds = frameIds(sortedFrameOrder(seededElements));

    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const duplicateMenu = await openMenuForRow(sourceRow);
    await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

    let duplicateRowAppeared = false;
    try {
      await expect.poll(async () => slideRows(sidebar).count(), {
        timeout: 15_000,
        intervals: [500, 500, 1_000, 1_000, 1_000],
      }).toBe(3);
      const titles = await listSlideTitles(sidebar);
      duplicateRowAppeared = titles.length === 3 && duplicateTitleCount(titles, SOURCE_SLIDE_TITLE) === 2;
    } catch {
      duplicateRowAppeared = false;
    }

    const postActionLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateCandidates = postFitLabelIds.filter((frameId) => !baselineLabelIds.includes(frameId));
    const duplicateFrameId = duplicateCandidates.length === 1 ? duplicateCandidates[0]! : null;
    const duplicateFrameLiveAfterFit = duplicateFrameId !== null && postFitLabelIds.includes(duplicateFrameId);

    const series = await observePersistedFrameSeries(supabase, fixture.masterPadletId!, [duplicateFrameId]);
    const duplicateEverPersisted = duplicateFrameId !== null && series.samples.some((sample) => sample.frameIds.includes(duplicateFrameId));
    const duplicatePersistedSettled = duplicateFrameId !== null && series.settledFrameIds.includes(duplicateFrameId);
    const saveCapture = consoleCapture.finish();

    return {
      prefix: fixture.prefix,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      duplicateFrameLiveAfterFit,
      duplicateEverPersisted,
      duplicatePersistedSettled,
      saveErrorObserved: saveCapture.observed,
      evidence: {
        flow: 'C',
        boardId: fixture.boardId,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postActionLabelIds,
        postFitLabelIds,
        duplicateFrameId,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        persistedSeries: series.samples,
        distinctSnapshots: series.distinctSnapshots,
        settledFrameIds: series.settledFrameIds,
        settledTrackedFrames: series.settledTrackedFrames,
        transientFrameIds: series.transientFrameIds,
        observationWindowMs: series.observationWindowMs,
        pollingIntervalMs: series.pollingIntervalMs,
        finalStableDurationMs: series.finalStableDurationMs,
        consoleTexts: saveCapture.texts,
        consoleTimestampsMs: saveCapture.timestampsMs,
      },
    };
  } finally {
    consoleCapture.finish();
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

test.describe('drawing scene save supersession diagnosis (PATCH-083)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes add/duplicate save supersession across three presentation flows', async ({ page }) => {
    test.setTimeout(300_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);
    const flowC = await runFlowC(page);

    expect(flowA.prefix).not.toBe(flowB.prefix);
    expect(flowA.prefix).not.toBe(flowC.prefix);
    expect(flowB.prefix).not.toBe(flowC.prefix);

    const classification =
      !flowA.addRowAppeared ||
      !flowB.addRowAppeared ||
      !flowB.duplicateRowAppeared ||
      !flowC.duplicateRowAppeared ||
      !flowA.zoomToFitApplied ||
      !flowB.zoomToFitApplied ||
      !flowC.zoomToFitApplied ||
      flowB.evidence.addFrameId === null
        ? 'supersession-observation-unsound'
        : flowA.saveErrorObserved || flowB.saveErrorObserved || flowC.saveErrorObserved
          ? 'save-error-observed'
          : (flowB.duplicateEverPersisted && !flowB.duplicatePersistedSettled) ||
              (flowC.duplicateEverPersisted && !flowC.duplicatePersistedSettled)
            ? 'duplicate-transient-then-lost'
            : flowA.addPersistedSettled && !flowB.addPersistedSettled
              ? 'add-superseded-by-rapid-duplicate'
              : flowA.addPersistedSettled &&
                  flowB.addPersistedSettled &&
                  !flowB.duplicateEverPersisted &&
                  !flowC.duplicateEverPersisted
                ? 'add-persists-duplicate-never'
                : !flowA.addPersistedSettled
                  ? 'no-new-frame-persists'
                  : 'mixed-supersession-state';

    test.info().annotations.push({
      type: PRIMARY_ANNOTATION,
      description: JSON.stringify({
        flowA_addRowAppeared: flowA.addRowAppeared,
        flowA_zoomToFitApplied: flowA.zoomToFitApplied,
        flowA_addFrameLiveAfterFit: flowA.addFrameLiveAfterFit,
        flowA_addEverPersisted: flowA.addEverPersisted,
        flowA_addPersistedSettled: flowA.addPersistedSettled,
        flowA_saveErrorObserved: flowA.saveErrorObserved,
        flowB_addRowAppeared: flowB.addRowAppeared,
        flowB_duplicateRowAppeared: flowB.duplicateRowAppeared,
        flowB_zoomToFitApplied: flowB.zoomToFitApplied,
        flowB_addFrameLiveAfterFit: flowB.addFrameLiveAfterFit,
        flowB_duplicateFrameLiveAfterFit: flowB.duplicateFrameLiveAfterFit,
        flowB_addEverPersisted: flowB.addEverPersisted,
        flowB_addPersistedSettled: flowB.addPersistedSettled,
        flowB_duplicateEverPersisted: flowB.duplicateEverPersisted,
        flowB_duplicatePersistedSettled: flowB.duplicatePersistedSettled,
        flowB_saveErrorObserved: flowB.saveErrorObserved,
        flowC_duplicateRowAppeared: flowC.duplicateRowAppeared,
        flowC_zoomToFitApplied: flowC.zoomToFitApplied,
        flowC_duplicateFrameLiveAfterFit: flowC.duplicateFrameLiveAfterFit,
        flowC_duplicateEverPersisted: flowC.duplicateEverPersisted,
        flowC_duplicatePersistedSettled: flowC.duplicatePersistedSettled,
        flowC_saveErrorObserved: flowC.saveErrorObserved,
        classification,
        prefixA: flowA.prefix,
        prefixB: flowB.prefix,
        prefixC: flowC.prefix,
      }),
    });

    test.info().annotations.push({
      type: EVIDENCE_ANNOTATION,
      description: JSON.stringify({
        flowA: flowA.evidence,
        flowB: flowB.evidence,
        flowC: flowC.evidence,
      }),
    });
  });
});
