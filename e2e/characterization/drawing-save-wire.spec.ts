import {
  test,
  expect,
  type Locator,
  type Page,
  type ConsoleMessage,
  type Request as PlaywrightRequest,
  type Response as PlaywrightResponse,
} from '@playwright/test';
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
const PRIMARY_ANNOTATION = 'patch-084-save-wire-diagnosis' as const;
const EVIDENCE_ANNOTATION = 'patch-084-save-wire-evidence' as const;
const SAVE_ERROR_SUBSTRING = 'Failed to save drawing to master padlet' as const;
const UPDATE_ERROR_SUBSTRING = 'Failed to update padlet:' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;
const PREFIX_A_ROOT = 'patch-064-harness-patch-084-wire-a-' as const;
const PREFIX_B_ROOT = 'patch-064-harness-patch-084-wire-b-' as const;
const PREFIX_C_ROOT = 'patch-064-harness-patch-084-wire-c-' as const;
const SOURCE_SLIDE_TITLE = 'PATCH-064 Portrait' as const;
const OTHER_SLIDE_TITLE = 'PATCH-064 Landscape' as const;
const SEEDED_FRAME_IDS = ['frame-landscape', 'frame-portrait'] as const;

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

type FrameSample = {
  elapsedMs: number;
  frameIds: string[];
};

type DistinctSnapshot = {
  frameIds: string[];
  firstSeenMs: number;
  lastSeenMs: number;
  sampleCount: number;
};

type PersistenceSeries = {
  samples: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
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

type ConsoleEventRecord = {
  substring: string;
  text: string;
  elapsedMs: number;
};

type ConsoleCaptureSummary = {
  saveErrorObserved: boolean;
  updateErrorObserved: boolean;
  saveErrorCount: number;
  updateErrorCount: number;
  events: ConsoleEventRecord[];
};

type RequestRecord = {
  elapsedMs: number;
  method: string;
  pathname: string;
  queryKeys: string[];
  targetPadletIdPresent: boolean;
  bodyExists: boolean;
  contentFieldPresent: boolean;
  bodyContainsSeededFrameIds: boolean;
  bodyContainsAddFrameId: boolean;
  bodyContainsDuplicateFrameId: boolean;
  bodyLength: number;
  responseStatus: number | null;
  responseIs2xx: boolean;
  responseBodyClass: string;
  responseBodySnippet: string | null;
  requestBodySnippet: string | null;
};

type WireCaptureSummary = {
  records: RequestRecord[];
  writeCount: number;
  contentWriteCount: number;
  targetIdWriteCount: number;
  targetIdWriteSucceeded: boolean;
  targetIdWriteAttempted: boolean;
  combinedIdsWriteAttempted: boolean;
  anyContentWriteSucceeded: boolean;
  lateStaleContentWriteObserved: boolean;
  anyNon2xxTargetIdWrite: boolean;
};

type FlowAEvidence = {
  flow: 'A';
  boardId: string;
  masterPadletId: string;
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
  requestRecords: RequestRecord[];
  consoleEvents: ConsoleEventRecord[];
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
};

type FlowBEvidence = {
  flow: 'B';
  boardId: string;
  masterPadletId: string;
  sourceContainerId: string;
  baselineLabelIds: string[];
  baselinePersistedFrameIds: string[];
  postAddLabelIds: string[];
  postActionLabelIds: string[];
  postFitLabelIds: string[];
  addFrameId: string | null;
  duplicateFrameId: string | null;
  addToDuplicateIntervalMs: number | null;
  duplicateChildRenderedAfterFit: boolean;
  zoomBefore: string | null;
  zoomAfter: string | null;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  requestRecords: RequestRecord[];
  consoleEvents: ConsoleEventRecord[];
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
};

type FlowCEvidence = {
  flow: 'C';
  boardId: string;
  masterPadletId: string;
  sourceContainerId: string;
  baselineLabelIds: string[];
  baselinePersistedFrameIds: string[];
  postActionLabelIds: string[];
  postFitLabelIds: string[];
  duplicateFrameId: string | null;
  duplicateChildRenderedAfterFit: boolean;
  zoomBefore: string | null;
  zoomAfter: string | null;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
  requestRecords: RequestRecord[];
  consoleEvents: ConsoleEventRecord[];
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
};

type FlowAResult = {
  prefix: string;
  addRowAppeared: boolean;
  zoomToFitApplied: boolean;
  addFrameLiveAfterFit: boolean;
  addContentWriteAttempted: boolean;
  addContentWriteSucceeded: boolean;
  lateStaleContentWriteObserved: boolean;
  addPersistedSettled: boolean;
  padletWriteCount: number;
  updateErrorLogged: boolean;
  wire: WireCaptureSummary;
  evidence: FlowAEvidence;
};

type FlowBResult = {
  prefix: string;
  addRowAppeared: boolean;
  duplicateRowAppeared: boolean;
  zoomToFitApplied: boolean;
  addFrameLiveAfterFit: boolean;
  duplicateFrameLiveAfterFit: boolean;
  addContentWriteAttempted: boolean;
  combinedContentWriteAttempted: boolean;
  anyContentWriteSucceeded: boolean;
  addPersistedSettled: boolean;
  duplicatePersistedSettled: boolean;
  padletWriteCount: number;
  updateErrorLogged: boolean;
  wire: WireCaptureSummary;
  evidence: FlowBEvidence;
};

type FlowCResult = {
  prefix: string;
  duplicateRowAppeared: boolean;
  zoomToFitApplied: boolean;
  duplicateFrameLiveAfterFit: boolean;
  duplicateContentWriteAttempted: boolean;
  duplicateContentWriteSucceeded: boolean;
  lateStaleContentWriteObserved: boolean;
  duplicatePersistedSettled: boolean;
  padletWriteCount: number;
  updateErrorLogged: boolean;
  wire: WireCaptureSummary;
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

async function observePersistedFrameSeries(supabase: any, masterPadletId: string): Promise<PersistenceSeries> {
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
    const sampleFrameIds = frameIds(sortedFrameOrder(activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId))));
    const key = JSON.stringify(sampleFrameIds);
    const elapsedMs = now - startedAt;

    samples.push({
      elapsedMs,
      frameIds: sampleFrameIds,
    });

    const lastSnapshot = distinctSnapshots[distinctSnapshots.length - 1];
    if (!lastSnapshot || lastSnapshot.frameIds.join('\u0000') !== sampleFrameIds.join('\u0000')) {
      distinctSnapshots.push({
        frameIds: sampleFrameIds,
        firstSeenMs: elapsedMs,
        lastSeenMs: elapsedMs,
        sampleCount: 1,
      });
    } else {
      lastSnapshot.lastSeenMs = elapsedMs;
      lastSnapshot.sampleCount += 1;
    }

    if (key !== previousKey) {
      lastChangedAt = now;
      previousKey = key;
    }

    const observationWindowMs = now - startedAt;
    const finalStableDurationMs = now - lastChangedAt;
    if (observationWindowMs >= minimumObservationWindowMs && finalStableDurationMs >= minimumStableTailMs) {
      return {
        samples,
        distinctSnapshots,
        settledFrameIds: sampleFrameIds,
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

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function parseJsonIfPossible(rawBody: string | null): unknown {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function bodyContainsField(rawBody: string | null, fieldName: string): boolean {
  const parsed = parseJsonIfPossible(rawBody);
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    return Object.prototype.hasOwnProperty.call(parsed, fieldName);
  }
  return Boolean(rawBody && rawBody.includes(`"${fieldName}"`));
}

function responseBodyClass(text: string | null): string {
  if (!text) return 'empty';
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<')) return 'html';
  return 'text';
}

function isPadletsEndpoint(url: string): boolean {
  return url.includes(PADLETS_ENDPOINT_PATH);
}

function isWriteMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper !== 'GET' && upper !== 'HEAD' && upper !== 'OPTIONS';
}

type LiveIdContext = {
  addFrameId?: string | null;
  duplicateFrameId?: string | null;
};

function summarizeWireRecords(
  records: RequestRecord[],
  targetFrameId: string | null,
  liveIds: LiveIdContext = {},
): WireCaptureSummary {
  const writeRecords = records.filter((record) => isWriteMethod(record.method));
  const contentWriteRecords = writeRecords.filter((record) => record.contentFieldPresent);
  const targetFrameIdInRecord = (record: RequestRecord): boolean => {
    if (!targetFrameId) return false;
    if (liveIds.addFrameId && targetFrameId === liveIds.addFrameId) {
      return record.bodyContainsAddFrameId;
    }
    if (liveIds.duplicateFrameId && targetFrameId === liveIds.duplicateFrameId) {
      return record.bodyContainsDuplicateFrameId;
    }
    return false;
  };
  const targetIdWriteRecords = targetFrameId
    ? contentWriteRecords.filter((record) => targetFrameIdInRecord(record))
    : [];

  let lateStaleContentWriteObserved = false;
  if (targetFrameId && targetIdWriteRecords.length > 0) {
    const firstTargetElapsedMs = targetIdWriteRecords[0]!.elapsedMs;
    lateStaleContentWriteObserved = contentWriteRecords.some(
      (record) => record.elapsedMs > firstTargetElapsedMs && !targetFrameIdInRecord(record),
    );
  }

  return {
    records,
    writeCount: writeRecords.length,
    contentWriteCount: contentWriteRecords.length,
    targetIdWriteCount: targetIdWriteRecords.length,
    targetIdWriteSucceeded: targetIdWriteRecords.some((record) => record.responseIs2xx),
    targetIdWriteAttempted: targetIdWriteRecords.length > 0,
    combinedIdsWriteAttempted:
      Boolean(liveIds.addFrameId) &&
      Boolean(liveIds.duplicateFrameId) &&
      contentWriteRecords.some((record) => record.bodyContainsAddFrameId && record.bodyContainsDuplicateFrameId),
    anyContentWriteSucceeded: contentWriteRecords.some((record) => record.responseIs2xx),
    lateStaleContentWriteObserved,
    anyNon2xxTargetIdWrite: targetIdWriteRecords.some((record) => record.responseStatus !== null && !record.responseIs2xx),
  };
}

function startConsoleCapture(page: Page): { finish: () => ConsoleCaptureSummary } {
  const startedAt = Date.now();
  const events: ConsoleEventRecord[] = [];
  let finished = false;

  const handler = (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const elapsedMs = Date.now() - startedAt;

    if (text.includes(SAVE_ERROR_SUBSTRING)) {
      events.push({ substring: SAVE_ERROR_SUBSTRING, text, elapsedMs });
      return;
    }
    if (text.includes(UPDATE_ERROR_SUBSTRING)) {
      events.push({ substring: UPDATE_ERROR_SUBSTRING, text, elapsedMs });
    }
  };

  page.on('console', handler);

  return {
    finish: () => {
      if (!finished) {
        page.off('console', handler);
        finished = true;
      }

      const saveEvents = events.filter((event) => event.substring === SAVE_ERROR_SUBSTRING);
      const updateEvents = events.filter((event) => event.substring === UPDATE_ERROR_SUBSTRING);
      return {
        saveErrorObserved: saveEvents.length > 0,
        updateErrorObserved: updateEvents.length > 0,
        saveErrorCount: saveEvents.length,
        updateErrorCount: updateEvents.length,
        events,
      };
    },
  };
}

function startPadletWireCapture(
  page: Page,
  targetPadletId: string,
): { begin: () => void; finish: (liveIds?: LiveIdContext) => Promise<RequestRecord[]> } {
  let observationStartedAt: number | null = null;
  const requestMap = new Map<PlaywrightRequest, {
    elapsedMs: number;
    method: string;
    pathname: string;
    queryKeys: string[];
    targetPadletIdPresent: boolean;
    rawBody: string | null;
    requestBodySnippet: string | null;
    responseStatus: number | null;
    responseBody: string | null;
  }>();
  const pendingTasks: Promise<void>[] = [];

  const onRequest = (request: PlaywrightRequest) => {
    if (observationStartedAt === null) return;
    if (!isPadletsEndpoint(request.url())) return;
    const url = new URL(request.url());
    const rawBody = request.postData() ?? null;
    requestMap.set(request, {
      elapsedMs: Date.now() - observationStartedAt,
      method: request.method(),
      pathname: url.pathname,
      queryKeys: [...url.searchParams.keys()].sort(),
      targetPadletIdPresent: request.url().includes(targetPadletId) || (rawBody?.includes(targetPadletId) ?? false),
      rawBody,
      requestBodySnippet: truncateText(rawBody, 2_000),
      responseStatus: null,
      responseBody: null,
    });
  };

  const onResponse = (response: PlaywrightResponse) => {
    const request = response.request();
    if (!requestMap.has(request)) return;
    const entry = requestMap.get(request)!;
    const task = (async () => {
      entry.responseStatus = response.status();
      try {
        entry.responseBody = truncateText(await response.text(), 500);
      } catch {
        entry.responseBody = null;
      }
    })();
    pendingTasks.push(task);
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    begin: () => {
      observationStartedAt = Date.now();
    },
    finish: async (liveIds: LiveIdContext = {}) => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      await Promise.all(pendingTasks);

      return [...requestMap.values()]
        .sort((left, right) => left.elapsedMs - right.elapsedMs)
        .map((entry) => {
          const rawBody = entry.rawBody;
          const addFrameId = liveIds.addFrameId ?? null;
          const duplicateFrameId = liveIds.duplicateFrameId ?? null;
          const responseStatus = entry.responseStatus;
          const responseIs2xx = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

          return {
            elapsedMs: entry.elapsedMs,
            method: entry.method,
            pathname: entry.pathname,
            queryKeys: entry.queryKeys,
            targetPadletIdPresent: entry.targetPadletIdPresent,
            bodyExists: rawBody !== null,
            contentFieldPresent: bodyContainsField(rawBody, 'content'),
            bodyContainsSeededFrameIds: SEEDED_FRAME_IDS.every((frameId) => rawBody?.includes(frameId) ?? false),
            bodyContainsAddFrameId: addFrameId !== null && (rawBody?.includes(addFrameId) ?? false),
            bodyContainsDuplicateFrameId: duplicateFrameId !== null && (rawBody?.includes(duplicateFrameId) ?? false),
            bodyLength: rawBody?.length ?? 0,
            responseStatus,
            responseIs2xx,
            responseBodyClass: responseBodyClass(entry.responseBody),
            responseBodySnippet: entry.responseBody,
            requestBodySnippet: entry.requestBodySnippet,
          };
        });
    },
  };
}

async function waitForNewFrameId(
  page: Page,
  baselineLiveFrameIds: string[],
): Promise<{ frameId: string | null; labelIds: string[] }> {
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
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-084-wire-a');
  const seeded = await seedDrawingContainers(supabase, fixture);
  await seedPresentationScene(supabase, fixture);

  expect(fixture.prefix.startsWith(PREFIX_A_ROOT)).toBe(true);

  const sourceContainerId = seeded.containers[1]!.id;
  const consoleCapture = startConsoleCapture(page);
  const wireCapture = startPadletWireCapture(page, fixture.masterPadletId!);

  try {
    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const baselinePersistedFrameIds = frameIds(sortedFrameOrder(seededElements));

    wireCapture.begin();
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
    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const addFrameLiveAfterFit = addCapture.frameId !== null && postFitLabelIds.includes(addCapture.frameId);

    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({ addFrameId: addCapture.frameId });
    const wire = summarizeWireRecords(requestRecords, addCapture.frameId, { addFrameId: addCapture.frameId });

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit,
      addContentWriteAttempted: wire.targetIdWriteAttempted,
      addContentWriteSucceeded: wire.targetIdWriteSucceeded,
      lateStaleContentWriteObserved: wire.lateStaleContentWriteObserved,
      addPersistedSettled: addCapture.frameId !== null && persistence.settledFrameIds.includes(addCapture.frameId),
      padletWriteCount: wire.writeCount,
      updateErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
      wire,
      evidence: {
        flow: 'A',
        boardId: fixture.boardId,
        masterPadletId: fixture.masterPadletId!,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postActionLabelIds: addCapture.labelIds,
        postFitLabelIds,
        addFrameId: addCapture.frameId,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
      },
    };
  } finally {
    consoleCapture.finish();
    await wireCapture.finish();
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

async function runFlowB(page: Page): Promise<FlowBResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-084-wire-b');
  const seeded = await seedDrawingContainers(supabase, fixture);
  await seedPresentationScene(supabase, fixture);

  expect(fixture.prefix.startsWith(PREFIX_B_ROOT)).toBe(true);

  const sourceContainerId = seeded.containers[1]!.id;
  const consoleCapture = startConsoleCapture(page);
  const wireCapture = startPadletWireCapture(page, fixture.masterPadletId!);

  try {
    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const baselinePersistedFrameIds = frameIds(sortedFrameOrder(seededElements));

    wireCapture.begin();
    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    const baselineCounts = await captureCounts(page, sourceContainerId);

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

    const addAppearedAt = Date.now();
    const addCapture = await waitForNewFrameId(page, baselineLabelIds);
    let duplicateRowAppeared = false;
    let postActionLabelIds = addCapture.labelIds;
    let duplicateAt: number | null = null;

    if (addRowAppeared) {
      const sourceRowAfterAdd = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const duplicateMenu = await openMenuForRow(sourceRowAfterAdd);
      await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });
      duplicateAt = Date.now();

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
    const postFitCounts = await captureCounts(page, sourceContainerId);
    const duplicateChildRenderedAfterFit =
      postFitCounts.sourcePadletCount >= 2 ||
      postFitCounts.embeddableContainerCount > baselineCounts.embeddableContainerCount;

    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({
      addFrameId: addCapture.frameId,
      duplicateFrameId,
    });
    const wire = summarizeWireRecords(requestRecords, addCapture.frameId, {
      addFrameId: addCapture.frameId,
      duplicateFrameId,
    });

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit,
      duplicateFrameLiveAfterFit,
      addContentWriteAttempted: wire.targetIdWriteAttempted,
      combinedContentWriteAttempted: wire.combinedIdsWriteAttempted,
      anyContentWriteSucceeded: wire.anyContentWriteSucceeded,
      addPersistedSettled: addCapture.frameId !== null && persistence.settledFrameIds.includes(addCapture.frameId),
      duplicatePersistedSettled: duplicateFrameId !== null && persistence.settledFrameIds.includes(duplicateFrameId),
      padletWriteCount: wire.writeCount,
      updateErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
      wire,
      evidence: {
        flow: 'B',
        boardId: fixture.boardId,
        masterPadletId: fixture.masterPadletId!,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postAddLabelIds: addCapture.labelIds,
        postActionLabelIds,
        postFitLabelIds,
        addFrameId: addCapture.frameId,
        duplicateFrameId,
        addToDuplicateIntervalMs: duplicateAt === null ? null : duplicateAt - addAppearedAt,
        duplicateChildRenderedAfterFit,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
      },
    };
  } finally {
    consoleCapture.finish();
    await wireCapture.finish();
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

async function runFlowC(page: Page): Promise<FlowCResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-084-wire-c');
  const seeded = await seedDrawingContainers(supabase, fixture);
  await seedPresentationScene(supabase, fixture);

  expect(fixture.prefix.startsWith(PREFIX_C_ROOT)).toBe(true);

  const sourceContainerId = seeded.containers[1]!.id;
  const consoleCapture = startConsoleCapture(page);
  const wireCapture = startPadletWireCapture(page, fixture.masterPadletId!);

  try {
    const seededElements = activeSceneElements(await fetchMasterPadletRow(supabase, fixture.masterPadletId!));
    const baselinePersistedFrameIds = frameIds(sortedFrameOrder(seededElements));

    wireCapture.begin();
    const visitedUrl = await openDrawingBoard(page, fixture.boardId);
    expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
    const sidebar = await openPresentationSidebar(page);

    await expect(slideRows(sidebar)).toHaveCount(2, { timeout: 30_000 });
    const baselineTitles = await listSlideTitles(sidebar);
    expect(baselineTitles).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    const baselineCounts = await captureCounts(page, sourceContainerId);

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
    const postFitCounts = await captureCounts(page, sourceContainerId);
    const duplicateChildRenderedAfterFit =
      postFitCounts.sourcePadletCount >= 2 ||
      postFitCounts.embeddableContainerCount > baselineCounts.embeddableContainerCount;

    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({ duplicateFrameId });
    const wire = summarizeWireRecords(requestRecords, duplicateFrameId, { duplicateFrameId });

    return {
      prefix: fixture.prefix,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      duplicateFrameLiveAfterFit,
      duplicateContentWriteAttempted: wire.targetIdWriteAttempted,
      duplicateContentWriteSucceeded: wire.targetIdWriteSucceeded,
      lateStaleContentWriteObserved: wire.lateStaleContentWriteObserved,
      duplicatePersistedSettled: duplicateFrameId !== null && persistence.settledFrameIds.includes(duplicateFrameId),
      padletWriteCount: wire.writeCount,
      updateErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
      wire,
      evidence: {
        flow: 'C',
        boardId: fixture.boardId,
        masterPadletId: fixture.masterPadletId!,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postActionLabelIds,
        postFitLabelIds,
        duplicateFrameId,
        duplicateChildRenderedAfterFit,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
      },
    };
  } finally {
    consoleCapture.finish();
    await wireCapture.finish();
    await cleanupDrawingFixture(supabase, fixture);
    await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
      boards: 0,
      padlets: 0,
      canvasLines: 0,
    });
  }
}

test.describe('drawing save wire-level diagnosis (PATCH-084)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes drawing save wire-level behavior across add and duplicate flows', async ({ page }) => {
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
      !flowA.addFrameLiveAfterFit ||
      !flowB.addFrameLiveAfterFit ||
      !flowB.duplicateFrameLiveAfterFit ||
      !flowC.duplicateFrameLiveAfterFit ||
      flowB.evidence.addFrameId === null ||
      flowA.padletWriteCount === 0
        ? 'wire-observation-unsound'
        : !flowA.addContentWriteAttempted
          ? 'control-content-write-missing'
          : !flowC.duplicateContentWriteAttempted
            ? 'duplicate-save-never-sent'
            : flowC.wire.anyNon2xxTargetIdWrite
              ? 'duplicate-save-rejected'
              : flowC.duplicateContentWriteSucceeded && flowC.lateStaleContentWriteObserved
                ? 'duplicate-save-accepted-then-overwritten'
                : flowC.duplicateContentWriteSucceeded && !flowC.lateStaleContentWriteObserved && !flowC.duplicatePersistedSettled
                  ? 'duplicate-save-accepted-but-lost'
                  : 'mixed-wire-state';

    test.info().annotations.push({
      type: PRIMARY_ANNOTATION,
      description: JSON.stringify({
        flowA_addRowAppeared: flowA.addRowAppeared,
        flowA_zoomToFitApplied: flowA.zoomToFitApplied,
        flowA_addFrameLiveAfterFit: flowA.addFrameLiveAfterFit,
        flowA_addContentWriteAttempted: flowA.addContentWriteAttempted,
        flowA_addContentWriteSucceeded: flowA.addContentWriteSucceeded,
        flowA_lateStaleContentWriteObserved: flowA.lateStaleContentWriteObserved,
        flowA_addPersistedSettled: flowA.addPersistedSettled,
        flowA_padletWriteCount: flowA.padletWriteCount,
        flowA_updateErrorLogged: flowA.updateErrorLogged,
        flowB_addRowAppeared: flowB.addRowAppeared,
        flowB_duplicateRowAppeared: flowB.duplicateRowAppeared,
        flowB_zoomToFitApplied: flowB.zoomToFitApplied,
        flowB_addFrameLiveAfterFit: flowB.addFrameLiveAfterFit,
        flowB_duplicateFrameLiveAfterFit: flowB.duplicateFrameLiveAfterFit,
        flowB_addContentWriteAttempted: flowB.addContentWriteAttempted,
        flowB_combinedContentWriteAttempted: flowB.combinedContentWriteAttempted,
        flowB_anyContentWriteSucceeded: flowB.anyContentWriteSucceeded,
        flowB_addPersistedSettled: flowB.addPersistedSettled,
        flowB_duplicatePersistedSettled: flowB.duplicatePersistedSettled,
        flowB_padletWriteCount: flowB.padletWriteCount,
        flowB_updateErrorLogged: flowB.updateErrorLogged,
        flowC_duplicateRowAppeared: flowC.duplicateRowAppeared,
        flowC_zoomToFitApplied: flowC.zoomToFitApplied,
        flowC_duplicateFrameLiveAfterFit: flowC.duplicateFrameLiveAfterFit,
        flowC_duplicateContentWriteAttempted: flowC.duplicateContentWriteAttempted,
        flowC_duplicateContentWriteSucceeded: flowC.duplicateContentWriteSucceeded,
        flowC_lateStaleContentWriteObserved: flowC.lateStaleContentWriteObserved,
        flowC_duplicatePersistedSettled: flowC.duplicatePersistedSettled,
        flowC_padletWriteCount: flowC.padletWriteCount,
        flowC_updateErrorLogged: flowC.updateErrorLogged,
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
