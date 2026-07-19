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
const PRIMARY_ANNOTATION = 'patch-085-duplicate-persistence-regression' as const;
const EVIDENCE_ANNOTATION = 'patch-085-duplicate-persistence-evidence' as const;
const SAVE_ERROR_SUBSTRING = 'Failed to save drawing to master padlet' as const;
const UPDATE_ERROR_SUBSTRING = 'Failed to update padlet:' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;
const PREFIX_A_ROOT = 'patch-064-harness-patch-085-fix-a-' as const;
const PREFIX_B_ROOT = 'patch-064-harness-patch-085-fix-b-' as const;
const PREFIX_C_ROOT = 'patch-064-harness-patch-085-fix-c-' as const;
const PREFIX_D_ROOT = 'patch-064-harness-patch-085-fix-d-' as const;
const SOURCE_SLIDE_TITLE = 'PATCH-064 Portrait' as const;
const OTHER_SLIDE_TITLE = 'PATCH-064 Landscape' as const;
const RAW_WRITE_STOP_THRESHOLD = 60;

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
  addIdWriteCount: number;
  duplicateIdWriteCount: number;
  addIdWriteSucceeded: boolean;
  duplicateIdWriteSucceeded: boolean;
  combinedIdsWriteAttempted: boolean;
  anyContentWriteSucceeded: boolean;
};

type CommonFlowEvidence = {
  boardId: string;
  masterPadletId: string;
  sourceContainerId: string;
  baselineLabelIds: string[];
  baselinePersistedFrameIds: string[];
  postActionLabelIds: string[];
  postFitLabelIds: string[];
  requestRecords: RequestRecord[];
  consoleEvents: ConsoleEventRecord[];
  persistedSeries: FrameSample[];
  distinctSnapshots: DistinctSnapshot[];
  settledFrameIds: string[];
  observationWindowMs: number;
  pollingIntervalMs: number;
  finalStableDurationMs: number;
  zoomBefore: string | null;
  zoomAfter: string | null;
  emptyCanvasPoint: { x: number; y: number } | null;
  emptyCanvasTargetSummary: string[] | null;
};

type FlowAEvidence = CommonFlowEvidence & {
  flow: 'A';
  addFrameId: string | null;
};

type FlowBEvidence = CommonFlowEvidence & {
  flow: 'B';
  addFrameId: string | null;
  duplicateFrameId: string | null;
  addToDuplicateIntervalMs: number | null;
};

type FlowCEvidence = CommonFlowEvidence & {
  flow: 'C';
  duplicateFrameId: string | null;
  duplicateChildRenderedAfterFit: boolean;
};

type FlowDEvidence = CommonFlowEvidence & {
  flow: 'D';
  addFrameId: string | null;
  duplicateFrameId: string | null;
  addPersistedBeforeDuplicate: boolean;
  addPersistedBeforeDuplicateFrameIds: string[];
  addToDuplicateIntervalMs: number | null;
  waitDurationMs: number;
};

type FlowAResult = {
  prefix: string;
  addRowAppeared: boolean;
  zoomToFitApplied: boolean;
  addFrameLiveAfterFit: boolean;
  addPersistedSettled: boolean;
  padletWriteCount: number;
  contentWriteCount: number;
  saveErrorLogged: boolean;
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
  addPersistedSettled: boolean;
  duplicatePersistedSettled: boolean;
  padletWriteCount: number;
  contentWriteCount: number;
  saveErrorLogged: boolean;
  wire: WireCaptureSummary;
  evidence: FlowBEvidence;
};

type FlowCResult = {
  prefix: string;
  duplicateRowAppeared: boolean;
  zoomToFitApplied: boolean;
  duplicateFrameLiveAfterFit: boolean;
  duplicateChildRenderedAfterFit: boolean;
  duplicatePersistedSettled: boolean;
  padletWriteCount: number;
  contentWriteCount: number;
  saveErrorLogged: boolean;
  wire: WireCaptureSummary;
  evidence: FlowCEvidence;
};

type FlowDResult = {
  prefix: string;
  addRowAppeared: boolean;
  addPersistedBeforeDuplicate: boolean;
  duplicateRowAppeared: boolean;
  zoomToFitApplied: boolean;
  addFrameLiveAfterFit: boolean;
  duplicateFrameLiveAfterFit: boolean;
  addPersistedSettled: boolean;
  duplicatePersistedSettled: boolean;
  padletWriteCount: number;
  contentWriteCount: number;
  saveErrorLogged: boolean;
  wire: WireCaptureSummary;
  evidence: FlowDEvidence;
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

async function captureCounts(page: Page, sourceContainerId: string): Promise<{
  sourcePadletCount: number;
  totalPadletCount: number;
  embeddableContainerCount: number;
}> {
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

async function pageWait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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

async function waitForFramePersisted(
  supabase: any,
  masterPadletId: string,
  frameId: string | null,
  minimumDelayMs = 0,
): Promise<{
  persisted: boolean;
  persistedFrameIds: string[];
  waitDurationMs: number;
  pollingIntervalMs: number;
}> {
  const pollingIntervalMs = 500;
  const timeoutMs = 20_000;
  const startedAt = Date.now();

  if (!frameId) {
    return {
      persisted: false,
      persistedFrameIds: [],
      waitDurationMs: 0,
      pollingIntervalMs,
    };
  }

  while (Date.now() - startedAt <= timeoutMs) {
    const now = Date.now();
    const persistedFrameIds = frameIds(
      sortedFrameOrder(activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId))),
    );
    const hasFrame = persistedFrameIds.includes(frameId);
    if (hasFrame && now - startedAt >= minimumDelayMs) {
      return {
        persisted: true,
        persistedFrameIds,
        waitDurationMs: now - startedAt,
        pollingIntervalMs,
      };
    }
    await pageWait(pollingIntervalMs);
  }

  const persistedFrameIds = frameIds(
    sortedFrameOrder(activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId))),
  );
  return {
    persisted: persistedFrameIds.includes(frameId),
    persistedFrameIds,
    waitDurationMs: Date.now() - startedAt,
    pollingIntervalMs,
  };
}

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
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

function summarizeWireRecords(records: RequestRecord[]): WireCaptureSummary {
  const writeRecords = records.filter((record) => isWriteMethod(record.method));
  const contentWriteRecords = writeRecords.filter((record) => record.contentFieldPresent);
  const addIdWriteRecords = contentWriteRecords.filter((record) => record.bodyContainsAddFrameId);
  const duplicateIdWriteRecords = contentWriteRecords.filter((record) => record.bodyContainsDuplicateFrameId);

  return {
    records,
    writeCount: writeRecords.length,
    contentWriteCount: contentWriteRecords.length,
    addIdWriteCount: addIdWriteRecords.length,
    duplicateIdWriteCount: duplicateIdWriteRecords.length,
    addIdWriteSucceeded: addIdWriteRecords.some((record) => record.responseIs2xx),
    duplicateIdWriteSucceeded: duplicateIdWriteRecords.some((record) => record.responseIs2xx),
    combinedIdsWriteAttempted: contentWriteRecords.some(
      (record) => record.bodyContainsAddFrameId && record.bodyContainsDuplicateFrameId,
    ),
    anyContentWriteSucceeded: contentWriteRecords.some((record) => record.responseIs2xx),
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
  let finished = false;
  const requestMap = new Map<
    PlaywrightRequest,
    {
      elapsedMs: number;
      method: string;
      pathname: string;
      queryKeys: string[];
      targetPadletIdPresent: boolean;
      rawBody: string | null;
      requestBodySnippet: string | null;
      responseStatus: number | null;
      responseBody: string | null;
    }
  >();
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
      if (!finished) {
        page.off('request', onRequest);
        page.off('response', onResponse);
        finished = true;
      }
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
      .poll(
        async () => {
          finalLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
          const diff = newFrameIds(baselineLiveFrameIds, finalLabelIds);
          return diff.length === 1 ? diff[0] : diff.length > 1 ? '__multiple__' : '';
        },
        {
          timeout: 5_000,
          intervals: [250, 250, 500, 500, 1_000, 1_000, 1_000],
        },
      )
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

async function waitForSlideCount(sidebar: Locator, count: number): Promise<boolean> {
  try {
    await expect
      .poll(async () => slideRows(sidebar).count(), {
        timeout: 15_000,
        intervals: [500, 500, 1_000, 1_000, 1_000],
      })
      .toBe(count);
    return true;
  } catch {
    return false;
  }
}

async function runFlowA(page: Page): Promise<FlowAResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-085-fix-a');
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
    expect(await listSlideTitles(sidebar)).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const addMenu = await openMenuForRow(sourceRow);
    await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });

    const addRowAppeared = await waitForSlideCount(sidebar, 3);
    const addCapture = await waitForNewFrameId(page, baselineLabelIds);
    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({ addFrameId: addCapture.frameId });
    const wire = summarizeWireRecords(requestRecords);

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit: addCapture.frameId !== null && postFitLabelIds.includes(addCapture.frameId),
      addPersistedSettled: addCapture.frameId !== null && persistence.settledFrameIds.includes(addCapture.frameId),
      padletWriteCount: wire.writeCount,
      contentWriteCount: wire.contentWriteCount,
      saveErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
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
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        addFrameId: addCapture.frameId,
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
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-085-fix-b');
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
    expect(await listSlideTitles(sidebar)).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const addMenu = await openMenuForRow(sourceRow);
    await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });
    const addActionAt = Date.now();

    const addRowAppeared = await waitForSlideCount(sidebar, 3);
    const addCapture = await waitForNewFrameId(page, baselineLabelIds);

    let duplicateRowAppeared = false;
    let postActionLabelIds = addCapture.labelIds;
    let duplicateAt: number | null = null;

    if (addRowAppeared) {
      const sourceRowAfterAdd = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const duplicateMenu = await openMenuForRow(sourceRowAfterAdd);
      await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });
      duplicateAt = Date.now();
      const countReached = await waitForSlideCount(sidebar, 4);
      if (countReached) {
        const titles = await listSlideTitles(sidebar);
        duplicateRowAppeared = titles.length === 4 && duplicateTitleCount(titles, SOURCE_SLIDE_TITLE) === 2;
      }
      postActionLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    }

    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateCandidates = postFitLabelIds.filter(
      (frameId) => !baselineLabelIds.includes(frameId) && frameId !== addCapture.frameId,
    );
    const duplicateFrameId = duplicateCandidates.length === 1 ? duplicateCandidates[0]! : null;
    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({
      addFrameId: addCapture.frameId,
      duplicateFrameId,
    });
    const wire = summarizeWireRecords(requestRecords);

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit: addCapture.frameId !== null && postFitLabelIds.includes(addCapture.frameId),
      duplicateFrameLiveAfterFit: duplicateFrameId !== null && postFitLabelIds.includes(duplicateFrameId),
      addPersistedSettled: addCapture.frameId !== null && persistence.settledFrameIds.includes(addCapture.frameId),
      duplicatePersistedSettled: duplicateFrameId !== null && persistence.settledFrameIds.includes(duplicateFrameId),
      padletWriteCount: wire.writeCount,
      contentWriteCount: wire.contentWriteCount,
      saveErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
      wire,
      evidence: {
        flow: 'B',
        boardId: fixture.boardId,
        masterPadletId: fixture.masterPadletId!,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postActionLabelIds,
        postFitLabelIds,
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        addFrameId: addCapture.frameId,
        duplicateFrameId,
        addToDuplicateIntervalMs: duplicateAt === null ? null : duplicateAt - addActionAt,
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
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-085-fix-c');
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
    expect(await listSlideTitles(sidebar)).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    const baselineCounts = await captureCounts(page, sourceContainerId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const duplicateMenu = await openMenuForRow(sourceRow);
    await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });

    let duplicateRowAppeared = false;
    const countReached = await waitForSlideCount(sidebar, 3);
    if (countReached) {
      const titles = await listSlideTitles(sidebar);
      duplicateRowAppeared = titles.length === 3 && duplicateTitleCount(titles, SOURCE_SLIDE_TITLE) === 2;
    }

    const postActionLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateCandidates = postFitLabelIds.filter((frameId) => !baselineLabelIds.includes(frameId));
    const duplicateFrameId = duplicateCandidates.length === 1 ? duplicateCandidates[0]! : null;
    const postFitCounts = await captureCounts(page, sourceContainerId);
    const duplicateChildRenderedAfterFit =
      postFitCounts.sourcePadletCount >= 2 ||
      postFitCounts.embeddableContainerCount > baselineCounts.embeddableContainerCount;
    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({ duplicateFrameId });
    const wire = summarizeWireRecords(requestRecords);

    return {
      prefix: fixture.prefix,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      duplicateFrameLiveAfterFit: duplicateFrameId !== null && postFitLabelIds.includes(duplicateFrameId),
      duplicateChildRenderedAfterFit,
      duplicatePersistedSettled: duplicateFrameId !== null && persistence.settledFrameIds.includes(duplicateFrameId),
      padletWriteCount: wire.writeCount,
      contentWriteCount: wire.contentWriteCount,
      saveErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
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
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        duplicateFrameId,
        duplicateChildRenderedAfterFit,
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

async function runFlowD(page: Page): Promise<FlowDResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard('patch-085-fix-d');
  const seeded = await seedDrawingContainers(supabase, fixture);
  await seedPresentationScene(supabase, fixture);

  expect(fixture.prefix.startsWith(PREFIX_D_ROOT)).toBe(true);

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
    expect(await listSlideTitles(sidebar)).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
    const baselineLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);

    const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
    const addMenu = await openMenuForRow(sourceRow);
    await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });
    const addActionAt = Date.now();

    const addRowAppeared = await waitForSlideCount(sidebar, 3);
    const addCapture = await waitForNewFrameId(page, baselineLabelIds);
    const addPersisted = await waitForFramePersisted(
      supabase,
      fixture.masterPadletId!,
      addCapture.frameId,
      2_500,
    );

    let duplicateRowAppeared = false;
    let duplicateAt: number | null = null;
    let postActionLabelIds = addCapture.labelIds;

    if (addRowAppeared) {
      const sourceRowAfterWait = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
      const duplicateMenu = await openMenuForRow(sourceRowAfterWait);
      await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });
      duplicateAt = Date.now();
      const countReached = await waitForSlideCount(sidebar, 4);
      if (countReached) {
        const titles = await listSlideTitles(sidebar);
        duplicateRowAppeared = titles.length === 4 && duplicateTitleCount(titles, SOURCE_SLIDE_TITLE) === 2;
      }
      postActionLabelIds = (await getLiveFrameLabels(page)).map((entry) => entry.frameId);
    }

    const fit = await performVerifiedFit(page);
    const postFitLabelIds = fit.postFitFrameLabels.map((entry) => entry.frameId);
    const duplicateCandidates = postFitLabelIds.filter(
      (frameId) => !baselineLabelIds.includes(frameId) && frameId !== addCapture.frameId,
    );
    const duplicateFrameId = duplicateCandidates.length === 1 ? duplicateCandidates[0]! : null;
    const persistence = await observePersistedFrameSeries(supabase, fixture.masterPadletId!);
    const consoleSummary = consoleCapture.finish();
    const requestRecords = await wireCapture.finish({
      addFrameId: addCapture.frameId,
      duplicateFrameId,
    });
    const wire = summarizeWireRecords(requestRecords);

    return {
      prefix: fixture.prefix,
      addRowAppeared,
      addPersistedBeforeDuplicate: addPersisted.persisted,
      duplicateRowAppeared,
      zoomToFitApplied: fit.applied,
      addFrameLiveAfterFit: addCapture.frameId !== null && postFitLabelIds.includes(addCapture.frameId),
      duplicateFrameLiveAfterFit: duplicateFrameId !== null && postFitLabelIds.includes(duplicateFrameId),
      addPersistedSettled: addCapture.frameId !== null && persistence.settledFrameIds.includes(addCapture.frameId),
      duplicatePersistedSettled: duplicateFrameId !== null && persistence.settledFrameIds.includes(duplicateFrameId),
      padletWriteCount: wire.writeCount,
      contentWriteCount: wire.contentWriteCount,
      saveErrorLogged: consoleSummary.saveErrorObserved || consoleSummary.updateErrorObserved,
      wire,
      evidence: {
        flow: 'D',
        boardId: fixture.boardId,
        masterPadletId: fixture.masterPadletId!,
        sourceContainerId,
        baselineLabelIds,
        baselinePersistedFrameIds,
        postActionLabelIds,
        postFitLabelIds,
        requestRecords,
        consoleEvents: consoleSummary.events,
        persistedSeries: persistence.samples,
        distinctSnapshots: persistence.distinctSnapshots,
        settledFrameIds: persistence.settledFrameIds,
        observationWindowMs: persistence.observationWindowMs,
        pollingIntervalMs: persistence.pollingIntervalMs,
        finalStableDurationMs: persistence.finalStableDurationMs,
        zoomBefore: fit.zoomBefore,
        zoomAfter: fit.zoomAfter,
        emptyCanvasPoint: fit.emptyCanvasPoint,
        emptyCanvasTargetSummary: fit.emptyCanvasTargetSummary,
        addFrameId: addCapture.frameId,
        duplicateFrameId,
        addPersistedBeforeDuplicate: addPersisted.persisted,
        addPersistedBeforeDuplicateFrameIds: addPersisted.persistedFrameIds,
        addToDuplicateIntervalMs: duplicateAt === null ? null : duplicateAt - addActionAt,
        waitDurationMs: addPersisted.waitDurationMs,
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

test.describe('drawing duplicate persistence regression (PATCH-085)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('persists add and duplicate drawing changes without a write storm', async ({ page }) => {
    test.setTimeout(420_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);
    const flowC = await runFlowC(page);
    const flowD = await runFlowD(page);

    expect(new Set([flowA.prefix, flowB.prefix, flowC.prefix, flowD.prefix]).size).toBe(4);

    expect(flowA.addRowAppeared).toBe(true);
    expect(flowA.zoomToFitApplied).toBe(true);
    expect(flowA.addFrameLiveAfterFit).toBe(true);
    expect(flowA.addPersistedSettled).toBe(true);
    expect(flowA.wire.addIdWriteCount).toBeGreaterThan(0);
    expect(flowA.wire.addIdWriteSucceeded).toBe(true);
    expect(flowA.contentWriteCount).toBeGreaterThan(0);
    expect(flowA.padletWriteCount).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
    expect(flowA.saveErrorLogged).toBe(false);

    expect(flowB.addRowAppeared).toBe(true);
    expect(flowB.duplicateRowAppeared).toBe(true);
    expect(flowB.zoomToFitApplied).toBe(true);
    expect(flowB.addFrameLiveAfterFit).toBe(true);
    expect(flowB.duplicateFrameLiveAfterFit).toBe(true);
    expect(flowB.addPersistedSettled).toBe(true);
    expect(flowB.duplicatePersistedSettled).toBe(true);
    expect(flowB.evidence.addToDuplicateIntervalMs).not.toBeNull();
    expect(flowB.evidence.addToDuplicateIntervalMs!).toBeLessThanOrEqual(5_000);
    expect(flowB.wire.combinedIdsWriteAttempted).toBe(true);
    expect(flowB.contentWriteCount).toBeGreaterThan(0);
    expect(flowB.padletWriteCount).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
    expect(flowB.saveErrorLogged).toBe(false);

    expect(flowC.duplicateRowAppeared).toBe(true);
    expect(flowC.zoomToFitApplied).toBe(true);
    expect(flowC.duplicateFrameLiveAfterFit).toBe(true);
    expect(flowC.duplicateChildRenderedAfterFit).toBe(true);
    expect(flowC.duplicatePersistedSettled).toBe(true);
    expect(flowC.wire.duplicateIdWriteCount).toBeGreaterThan(0);
    expect(flowC.wire.duplicateIdWriteSucceeded).toBe(true);
    expect(flowC.contentWriteCount).toBeGreaterThan(0);
    expect(flowC.padletWriteCount).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
    expect(flowC.saveErrorLogged).toBe(false);

    expect(flowD.addRowAppeared).toBe(true);
    expect(flowD.addPersistedBeforeDuplicate).toBe(true);
    expect(flowD.duplicateRowAppeared).toBe(true);
    expect(flowD.zoomToFitApplied).toBe(true);
    expect(flowD.addFrameLiveAfterFit).toBe(true);
    expect(flowD.duplicateFrameLiveAfterFit).toBe(true);
    expect(flowD.addPersistedSettled).toBe(true);
    expect(flowD.duplicatePersistedSettled).toBe(true);
    expect(flowD.evidence.waitDurationMs).toBeGreaterThanOrEqual(2_500);
    expect(flowD.wire.combinedIdsWriteAttempted).toBe(true);
    expect(flowD.contentWriteCount).toBeGreaterThan(0);
    expect(flowD.padletWriteCount).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
    expect(flowD.saveErrorLogged).toBe(false);

    test.info().annotations.push({
      type: PRIMARY_ANNOTATION,
      description: JSON.stringify({
        flowA_addRowAppeared: flowA.addRowAppeared,
        flowA_zoomToFitApplied: flowA.zoomToFitApplied,
        flowA_addFrameLiveAfterFit: flowA.addFrameLiveAfterFit,
        flowA_addPersistedSettled: flowA.addPersistedSettled,
        flowA_padletWriteCount: flowA.padletWriteCount,
        flowA_contentWriteCount: flowA.contentWriteCount,
        flowA_updateErrorLogged: flowA.saveErrorLogged,
        flowB_addRowAppeared: flowB.addRowAppeared,
        flowB_duplicateRowAppeared: flowB.duplicateRowAppeared,
        flowB_zoomToFitApplied: flowB.zoomToFitApplied,
        flowB_addFrameLiveAfterFit: flowB.addFrameLiveAfterFit,
        flowB_duplicateFrameLiveAfterFit: flowB.duplicateFrameLiveAfterFit,
        flowB_addPersistedSettled: flowB.addPersistedSettled,
        flowB_duplicatePersistedSettled: flowB.duplicatePersistedSettled,
        flowB_addToDuplicateIntervalMs: flowB.evidence.addToDuplicateIntervalMs,
        flowB_padletWriteCount: flowB.padletWriteCount,
        flowB_contentWriteCount: flowB.contentWriteCount,
        flowB_updateErrorLogged: flowB.saveErrorLogged,
        flowC_duplicateRowAppeared: flowC.duplicateRowAppeared,
        flowC_zoomToFitApplied: flowC.zoomToFitApplied,
        flowC_duplicateFrameLiveAfterFit: flowC.duplicateFrameLiveAfterFit,
        flowC_duplicateChildRenderedAfterFit: flowC.duplicateChildRenderedAfterFit,
        flowC_duplicatePersistedSettled: flowC.duplicatePersistedSettled,
        flowC_padletWriteCount: flowC.padletWriteCount,
        flowC_contentWriteCount: flowC.contentWriteCount,
        flowC_updateErrorLogged: flowC.saveErrorLogged,
        flowD_addRowAppeared: flowD.addRowAppeared,
        flowD_addPersistedBeforeDuplicate: flowD.addPersistedBeforeDuplicate,
        flowD_duplicateRowAppeared: flowD.duplicateRowAppeared,
        flowD_zoomToFitApplied: flowD.zoomToFitApplied,
        flowD_addFrameLiveAfterFit: flowD.addFrameLiveAfterFit,
        flowD_duplicateFrameLiveAfterFit: flowD.duplicateFrameLiveAfterFit,
        flowD_addPersistedSettled: flowD.addPersistedSettled,
        flowD_duplicatePersistedSettled: flowD.duplicatePersistedSettled,
        flowD_waitDurationMs: flowD.evidence.waitDurationMs,
        flowD_addToDuplicateIntervalMs: flowD.evidence.addToDuplicateIntervalMs,
        flowD_padletWriteCount: flowD.padletWriteCount,
        flowD_contentWriteCount: flowD.contentWriteCount,
        flowD_updateErrorLogged: flowD.saveErrorLogged,
        prefixA: flowA.prefix,
        prefixB: flowB.prefix,
        prefixC: flowC.prefix,
        prefixD: flowD.prefix,
      }),
    });

    test.info().annotations.push({
      type: EVIDENCE_ANNOTATION,
      description: JSON.stringify({
        flowA: flowA.evidence,
        flowB: flowB.evidence,
        flowC: flowC.evidence,
        flowD: flowD.evidence,
      }),
    });
  });
});
