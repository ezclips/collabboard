import {
  test,
  expect,
  type Locator,
  type Page,
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
const REMOVE_ITEM_INDEX = 6;
const SOURCE_SLIDE_TITLE = 'PATCH-064 Portrait' as const;
const OTHER_SLIDE_TITLE = 'PATCH-064 Landscape' as const;
const RAW_WRITE_STOP_THRESHOLD = 60;
const PRIMARY_ANNOTATION = 'patch-086-duplicate-deep-clone-regression' as const;
const EVIDENCE_ANNOTATION = 'patch-086-duplicate-deep-clone-evidence' as const;
const PREFIX_A_ROOT = 'patch-064-harness-patch-086-clone-a-' as const;
const PREFIX_B_ROOT = 'patch-064-harness-patch-086-clone-b-' as const;
const PREFIX_C_ROOT = 'patch-064-harness-patch-086-clone-c-' as const;
const PREFIX_D_ROOT = 'patch-064-harness-patch-086-clone-d-' as const;

registerDrawingCleanup(test);

type BoardPadletRow = {
  id: string;
  title: string;
  content: string | null;
  type: string;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  metadata: Record<string, any> | null;
};

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

type SlideRowRef = {
  row: Locator;
  title: string;
  titleIndex: number;
};

type WireSummary = {
  rawWrites: number;
  contentWrites: number;
  records: WireRecord[];
};

type WireRecord = {
  requestElapsedMs: number;
  responseElapsedMs: number | null;
  method: string;
  sanitizedPath: string;
  idsPresent: string[];
  childPadletIdsFieldPresent: boolean;
  contentFieldPresent: boolean;
  status: number | null;
  responseIs2xx: boolean;
};

type RewireWireEvidence = {
  observed: boolean;
  status: number | null;
  responseIs2xx: boolean;
  clonedContainerIdPresent: boolean;
  childPadletIdsFieldPresent: boolean;
  clonedChildIdsPresent: boolean;
  requestElapsedMs: number | null;
  responseElapsedMs: number | null;
  settlementAcceptedAtMs: number;
  responseBeforeSettlementAccepted: boolean;
};

type CloneSnapshot = {
  sourceFrameId: string;
  duplicateFrameId: string;
  sourceChildElementIds: string[];
  duplicateChildElementIds: string[];
  sourceContainerId: string;
  duplicateContainerId: string;
  sourceChildRowIds: string[];
  duplicateChildRowIds: string[];
  sourceChildContents: string[];
  duplicateChildContents: string[];
  sourceChildTitles: string[];
  duplicateChildTitles: string[];
  sharedSourceLinkCount: number;
  metadataTreatment: {
    duplicateContainerChildPadletIdsMatch: boolean;
    duplicateContainerParentIdAbsent: boolean;
    duplicateChildParentIdsMatch: boolean;
    childOrderPreserved: boolean;
    filePointersCopied: boolean;
    uploadStorageDuplicated: boolean;
    detachedRelationsNotMigrated: boolean;
  };
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
    .select('id,title,content,type,position_x,position_y,width,height,file_url,file_name,file_type,file_size,metadata')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchPadletById(supabase: any, id: string): Promise<BoardPadletRow | null> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,file_url,file_name,file_type,file_size,metadata')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function getFrame(elements: SceneElement[], frameId: string): SceneElement {
  const frame = elements.find((element) => element.id === frameId && element.type === 'frame');
  expect(frame).toBeTruthy();
  return frame!;
}

function getSourceFrameId(elements: SceneElement[]): string {
  const frame = elements.find((element) => element.type === 'frame' && element.name === SOURCE_SLIDE_TITLE);
  expect(frame).toBeTruthy();
  return frame!.id;
}

function getFrameEmbeddables(elements: SceneElement[], frameId: string): SceneElement[] {
  return elements.filter((element) => element.type === 'embeddable' && element.frameId === frameId);
}

function linkedPadletId(element: SceneElement): string {
  expect(element.link?.startsWith('padlet://')).toBe(true);
  return element.link!.replace('padlet://', '');
}

function rowMap(rows: BoardPadletRow[]): Map<string, BoardPadletRow> {
  return new Map(rows.map((row) => [row.id, row] as const));
}

function childIdsFrom(row: BoardPadletRow): string[] {
  return Array.isArray(row.metadata?.childPadletIds)
    ? row.metadata!.childPadletIds.map((id: unknown) => String(id))
    : [];
}

function sortedFrames(elements: SceneElement[]): SceneElement[] {
  return elements
    .filter((element) => element.type === 'frame')
    .sort((left, right) => {
      if ((left.y ?? 0) !== (right.y ?? 0)) return (left.y ?? 0) - (right.y ?? 0);
      if ((left.x ?? 0) !== (right.x ?? 0)) return (left.x ?? 0) - (right.x ?? 0);
      return left.id.localeCompare(right.id);
    });
}

function findDuplicateFrame(elements: SceneElement[], sourceFrameId: string): SceneElement {
  const source = getFrame(elements, sourceFrameId);
  const duplicate = sortedFrames(elements).find(
    (frame) => frame.name === SOURCE_SLIDE_TITLE && frame.id !== sourceFrameId && (frame.x ?? 0) > (source.x ?? 0),
  );
  expect(duplicate).toBeTruthy();
  return duplicate!;
}

function inspectClone(elements: SceneElement[], rows: BoardPadletRow[], sourceFrameId: string, sourceContainerId: string): CloneSnapshot {
  const rowsById = rowMap(rows);
  const duplicateFrame = findDuplicateFrame(elements, sourceFrameId);
  const sourceChildren = getFrameEmbeddables(elements, sourceFrameId);
  const duplicateChildren = getFrameEmbeddables(elements, duplicateFrame.id);
  expect(sourceChildren.length).toBeGreaterThan(0);
  expect(duplicateChildren).toHaveLength(sourceChildren.length);
  const duplicateContainerId = linkedPadletId(duplicateChildren[0]!);
  const sourceContainer = rowsById.get(sourceContainerId);
  const duplicateContainer = rowsById.get(duplicateContainerId);
  expect(sourceContainer).toBeTruthy();
  expect(duplicateContainer).toBeTruthy();
  const sourceChildRowIds = childIdsFrom(sourceContainer!);
  const duplicateChildRowIds = childIdsFrom(duplicateContainer!);
  const sourceChildRows = sourceChildRowIds.map((id) => rowsById.get(id));
  const duplicateChildRows = duplicateChildRowIds.map((id) => rowsById.get(id));
  expect(sourceChildRows.every(Boolean)).toBe(true);
  expect(duplicateChildRows.every(Boolean)).toBe(true);
  const duplicateContainerMetadata = duplicateContainer!.metadata ?? {};
  return {
    sourceFrameId,
    duplicateFrameId: duplicateFrame.id,
    sourceChildElementIds: sourceChildren.map((element) => element.id),
    duplicateChildElementIds: duplicateChildren.map((element) => element.id),
    sourceContainerId,
    duplicateContainerId,
    sourceChildRowIds,
    duplicateChildRowIds,
    sourceChildContents: sourceChildRows.map((row) => row!.content ?? ''),
    duplicateChildContents: duplicateChildRows.map((row) => row!.content ?? ''),
    sourceChildTitles: sourceChildRows.map((row) => row!.title),
    duplicateChildTitles: duplicateChildRows.map((row) => row!.title),
    sharedSourceLinkCount: elements.filter((element) => element.type === 'embeddable' && element.link === `padlet://${sourceContainerId}`).length,
    metadataTreatment: {
      duplicateContainerChildPadletIdsMatch: JSON.stringify(duplicateContainerMetadata.childPadletIds ?? []) === JSON.stringify(duplicateChildRowIds),
      duplicateContainerParentIdAbsent: !Object.prototype.hasOwnProperty.call(duplicateContainerMetadata, 'parentId'),
      duplicateChildParentIdsMatch: duplicateChildRows.every((row) => row!.metadata?.parentId === duplicateContainerId),
      childOrderPreserved: JSON.stringify(duplicateChildRows.map((row) => row!.title)) === JSON.stringify(sourceChildRows.map((row) => row!.title)),
      filePointersCopied: duplicateChildRows.every((row, index) => {
        const source = sourceChildRows[index]!;
        return row!.file_url === source.file_url &&
          row!.file_name === source.file_name &&
          row!.file_type === source.file_type &&
          row!.file_size === source.file_size;
      }),
      uploadStorageDuplicated: false,
      detachedRelationsNotMigrated: duplicateChildRows.every((row) => !row!.metadata?.detachedComments),
    },
  };
}

async function observeSettledScene(supabase: any, masterPadletId: string): Promise<{
  elements: SceneElement[];
  observationWindowMs: number;
  finalStableDurationMs: number;
  pollingIntervalMs: number;
}> {
  const pollingIntervalMs = 1_000;
  const minimumObservationWindowMs = 20_000;
  const minimumStableTailMs = 6_000;
  const startedAt = Date.now();
  let lastChangedAt = startedAt;
  let previousKey: string | null = null;
  let elements: SceneElement[] = [];

  while (true) {
    elements = activeSceneElements(await fetchMasterPadletRow(supabase, masterPadletId));
    const key = JSON.stringify(elements.map((element) => ({
      id: element.id,
      frameId: element.frameId ?? null,
      link: element.link ?? null,
      isDeleted: element.isDeleted ?? false,
    })));
    if (key !== previousKey) {
      previousKey = key;
      lastChangedAt = Date.now();
    }
    const observationWindowMs = Date.now() - startedAt;
    const finalStableDurationMs = Date.now() - lastChangedAt;
    if (observationWindowMs >= minimumObservationWindowMs && finalStableDurationMs >= minimumStableTailMs) {
      return { elements, observationWindowMs, finalStableDurationMs, pollingIntervalMs };
    }
    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  }
}

async function waitForPadletContentIncludes(supabase: any, id: string, expected: string): Promise<string> {
  let latest: string | null = null;
  return expect.poll(async () => {
    const row = await fetchPadletById(supabase, id);
    latest = row?.content ?? null;
    return latest?.includes(expected) ?? false;
  }, { timeout: 30_000, intervals: [500, 500, 1_000, 1_000, 1_000] }).toBe(true).then(() => latest!);
}

async function expectStablePadletPresence(supabase: any, id: string): Promise<BoardPadletRow> {
  const stabilityWindowMs = 2_000;
  const timeoutMs = 15_000;
  const startedAt = Date.now();
  let stableSince: number | null = null;
  let latest: BoardPadletRow | null = null;
  while (Date.now() - startedAt <= timeoutMs) {
    latest = await fetchPadletById(supabase, id);
    if (latest) {
      stableSince ??= Date.now();
      if (Date.now() - stableSince >= stabilityWindowMs) return latest;
    } else {
      stableSince = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(latest).toBeTruthy();
  return latest!;
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
  return { menu, items };
}

async function duplicateSlide(sidebar: Locator, titleIndex = 0): Promise<void> {
  const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, titleIndex);
  const duplicateMenu = await openMenuForRow(sourceRow);
  await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });
  await expect.poll(async () => sidebar.getByText(SOURCE_SLIDE_TITLE, { exact: true }).count(), {
    timeout: 60_000,
    intervals: [500, 500, 1_000, 1_000, 1_000],
  }).toBe(titleIndex === 0 ? 2 : 3);
}

async function activateSlide(sidebar: Locator, titleIndex: number): Promise<void> {
  const row = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, titleIndex);
  await row.row.click();
  await expect(row.row).toBeVisible({ timeout: 30_000 });
}

async function expectChildTextVisible(page: Page, containerId: string, text: string): Promise<void> {
  const container = page.locator(`[data-padlet-id="${containerId}"]`).first();
  await expect(container).toBeVisible({ timeout: 90_000 });
  await expect(container.getByText(new RegExp(escapeRegex(text)))).toBeVisible({ timeout: 30_000 });
}

async function removeSlide(page: Page, sidebar: Locator, titleIndex: number, expectedPortraitCount: number): Promise<void> {
  const row = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, titleIndex);
  pageAcceptNextDialog(page);
  const menu = await openMenuForRow(row);
  await menu.items[REMOVE_ITEM_INDEX].click({ timeout: 3_000 });
  await expect.poll(async () => sidebar.getByText(SOURCE_SLIDE_TITLE, { exact: true }).count(), {
    timeout: 60_000,
    intervals: [500, 500, 1_000, 1_000, 1_000],
  }).toBe(expectedPortraitCount);
}

function pageAcceptNextDialog(page: Page): void {
  page.once('dialog', (dialog) => dialog.accept());
}

async function addSlideBelowThenDuplicate(page: Page, sidebar: Locator): Promise<number> {
  const sourceRow = await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0);
  const addMenu = await openMenuForRow(sourceRow);
  await addMenu.items[ADD_BELOW_ITEM_INDEX].click({ timeout: 3_000 });
  const addAt = Date.now();
  await expect(slideRows(sidebar)).toHaveCount(3, { timeout: 60_000 });
  const duplicateMenu = await openMenuForRow(await getSlideRowByTitleIndex(sidebar, SOURCE_SLIDE_TITLE, 0));
  await duplicateMenu.items[DUPLICATE_ITEM_INDEX].click({ timeout: 3_000 });
  const duplicateAt = Date.now();
  await expect(slideRows(sidebar)).toHaveCount(4, { timeout: 60_000 });
  return duplicateAt - addAt;
}

async function editFirstChildThroughUi(page: Page, containerId: string, childTitle: string, nextContent: string): Promise<void> {
  const container = page.locator(`[data-padlet-id="${containerId}"]`).first();
  await expect(container).toBeVisible({ timeout: 90_000 });
  await container.hover();
  const editButton = page.locator(`[data-padlet-id="${containerId}"] button[data-post-menu-trigger="true"][title="Edit"]`).first();
  await editButton.click({ button: 'right', timeout: 15_000 });
  await page.getByRole('button', { name: new RegExp(`Edit\\s+${escapeRegex(childTitle)}`) }).first().click({ timeout: 15_000 });
  const editor = page.locator('.ProseMirror[contenteditable="true"]').first();
  await editor.waitFor({ state: 'visible', timeout: 15_000 });
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type(nextContent);
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.click(viewport.width - 8, 8);
  await expect(editor).toHaveCount(0, { timeout: 15_000 });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findRewireWireEvidence(wire: WireSummary, clone: CloneSnapshot, settlementAcceptedAtMs: number): RewireWireEvidence {
  const record = wire.records.find((entry) =>
    entry.method === 'PATCH' &&
    entry.responseIs2xx &&
    entry.idsPresent.includes(clone.duplicateContainerId) &&
    entry.childPadletIdsFieldPresent &&
    clone.duplicateChildRowIds.every((childId) => entry.idsPresent.includes(childId)) &&
    entry.responseElapsedMs !== null &&
    entry.responseElapsedMs <= settlementAcceptedAtMs
  ) ?? null;

  return {
    observed: record !== null,
    status: record?.status ?? null,
    responseIs2xx: record?.responseIs2xx ?? false,
    clonedContainerIdPresent: record?.idsPresent.includes(clone.duplicateContainerId) ?? false,
    childPadletIdsFieldPresent: record?.childPadletIdsFieldPresent ?? false,
    clonedChildIdsPresent: record ? clone.duplicateChildRowIds.every((childId) => record.idsPresent.includes(childId)) : false,
    requestElapsedMs: record?.requestElapsedMs ?? null,
    responseElapsedMs: record?.responseElapsedMs ?? null,
    settlementAcceptedAtMs,
    responseBeforeSettlementAccepted: record !== null && record.responseElapsedMs !== null && record.responseElapsedMs <= settlementAcceptedAtMs,
  };
}

function startPadletWriteCapture(page: Page): { elapsedMs: () => number; finish: () => WireSummary } {
  const startedAt = Date.now();
  const records = new Map<PlaywrightRequest, WireRecord>();
  const requestListener = (request: PlaywrightRequest) => {
    const url = new URL(request.url());
    if (!url.pathname.includes('/rest/v1/padlets')) return;
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method())) return;
    const body = request.postData() ?? '';
    const sanitizedPath = `${url.pathname}${url.search}`;
    const idsPresent = Array.from(new Set(`${sanitizedPath} ${body}`.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []));
    records.set(request, {
      requestElapsedMs: Date.now() - startedAt,
      responseElapsedMs: null,
      method: request.method(),
      sanitizedPath,
      idsPresent,
      childPadletIdsFieldPresent: body.includes('childPadletIds'),
      contentFieldPresent: body.includes('"content"'),
      status: null,
      responseIs2xx: false,
    });
  };
  const responseListener = (response: PlaywrightResponse) => {
    const record = records.get(response.request());
    if (!record) return;
    record.responseElapsedMs = Date.now() - startedAt;
    record.status = response.status();
    record.responseIs2xx = response.status() >= 200 && response.status() < 300;
  };
  page.on('request', requestListener);
  page.on('response', responseListener);
  return {
    elapsedMs: () => Date.now() - startedAt,
    finish: () => {
      page.off('request', requestListener);
      page.off('response', responseListener);
      const allRecords = [...records.values()];
      return {
        rawWrites: allRecords.length,
        contentWrites: allRecords.filter((record) => record.contentFieldPresent).length,
        records: allRecords,
      };
    },
  };
}

async function assertLocalCleanup(supabase: any, fixture: { boardId: string; prefix: string; lineIds: string[] }): Promise<{ boards: number; padlets: number; canvasLines: number }> {
  await cleanupDrawingFixture(supabase, fixture as any);
  const counts = await assertDrawingFixtureCleanup(supabase, fixture as any);
  expect(counts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
  return counts;
}

test.describe('drawing duplicate slide deep-clone regression (PATCH-086)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('duplicates slide-linked rows as independent one-level clones', async ({ page }) => {
    test.setTimeout(420_000);

    const flowK = {
      rowsCreatedBeforeSceneMutation: true,
      sceneMutationAfterAllRowsExist: true,
      compensatingDeletesAreNarrow: true,
      visibleConsoleError: true,
      sourceRowsUntouchedOnFailure: true,
      runtimeFailureInjection: 'not-used-page-route-prohibited',
    };

    const { supabase: supabaseA, fixture: fixtureA } = await createDisposableDrawingBoard('patch-086-clone-a');
    let flowA: any;
    try {
      const seeded = await seedDrawingContainers(supabaseA, fixtureA);
      await seedPresentationScene(supabaseA, fixtureA);
      expect(fixtureA.prefix.startsWith(PREFIX_A_ROOT)).toBe(true);
      const sourceContainerId = seeded.containers[1]!.id;
      const sourceFrameId = getSourceFrameId(activeSceneElements(await fetchMasterPadletRow(supabaseA, fixtureA.masterPadletId!)));
      const wire = startPadletWriteCapture(page);
      await openDrawingBoard(page, fixtureA.boardId);
      const sidebar = await openPresentationSidebar(page);
      expect(await listSlideTitles(sidebar)).toEqual([OTHER_SLIDE_TITLE, SOURCE_SLIDE_TITLE]);
      await duplicateSlide(sidebar, 0);
      const settled = await observeSettledScene(supabaseA, fixtureA.masterPadletId!);
      const settlementAcceptedAtMs = wire.elapsedMs();
      const rows = await fetchBoardPadlets(supabaseA, fixtureA.boardId);
      const clone = inspectClone(settled.elements, rows, sourceFrameId, sourceContainerId);
      const writes = wire.finish();
      const rewireWireEvidence = findRewireWireEvidence(writes, clone, settlementAcceptedAtMs);
      expect(clone.duplicateFrameId).not.toBe(clone.sourceFrameId);
      expect(clone.duplicateChildElementIds.every((id) => !clone.sourceChildElementIds.includes(id))).toBe(true);
      expect(clone.duplicateContainerId).not.toBe(clone.sourceContainerId);
      expect(clone.duplicateChildRowIds.every((id) => !clone.sourceChildRowIds.includes(id))).toBe(true);
      expect(clone.sharedSourceLinkCount).toBe(1);
      expect(clone.duplicateChildContents).toEqual(clone.sourceChildContents);
      expect(clone.duplicateChildTitles).toEqual(clone.sourceChildTitles);
      expect(clone.metadataTreatment).toEqual({
        duplicateContainerChildPadletIdsMatch: true,
        duplicateContainerParentIdAbsent: true,
        duplicateChildParentIdsMatch: true,
        childOrderPreserved: true,
        filePointersCopied: true,
        uploadStorageDuplicated: false,
        detachedRelationsNotMigrated: true,
      });
      await activateSlide(sidebar, 0);
      await expectChildTextVisible(page, clone.sourceContainerId, clone.sourceChildContents[0]!);
      await activateSlide(sidebar, 1);
      await expectChildTextVisible(page, clone.duplicateContainerId, clone.duplicateChildContents[0]!);
      expect(rewireWireEvidence).toMatchObject({
        observed: true,
        responseIs2xx: true,
        clonedContainerIdPresent: true,
        childPadletIdsFieldPresent: true,
        clonedChildIdsPresent: true,
        responseBeforeSettlementAccepted: true,
      });
      expect(writes.rawWrites).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
      expect(writes.contentWrites).toBeGreaterThan(0);
      flowA = { prefix: fixtureA.prefix, clone, writes, rewireWireEvidence, settled };
    } finally {
      const cleanup = await assertLocalCleanup(supabaseA, fixtureA);
      flowA = { ...flowA, cleanup };
    }

    const { supabase: supabaseB, fixture: fixtureB } = await createDisposableDrawingBoard('patch-086-clone-b');
    let flowB: any;
    try {
      const seeded = await seedDrawingContainers(supabaseB, fixtureB);
      await seedPresentationScene(supabaseB, fixtureB);
      expect(fixtureB.prefix.startsWith(PREFIX_B_ROOT)).toBe(true);
      const sourceContainerId = seeded.containers[1]!.id;
      const sourceFrameId = getSourceFrameId(activeSceneElements(await fetchMasterPadletRow(supabaseB, fixtureB.masterPadletId!)));
      const wire = startPadletWriteCapture(page);
      await openDrawingBoard(page, fixtureB.boardId);
      const sidebar = await openPresentationSidebar(page);
      await duplicateSlide(sidebar, 0);
      const settledAfterDuplicate = await observeSettledScene(supabaseB, fixtureB.masterPadletId!);
      const clone = inspectClone(settledAfterDuplicate.elements, await fetchBoardPadlets(supabaseB, fixtureB.boardId), sourceFrameId, sourceContainerId);
      const sourceChildId = clone.sourceChildRowIds[0]!;
      const duplicateChildId = clone.duplicateChildRowIds[0]!;
      const duplicateEdit = `${fixtureB.prefix} duplicate edit`;
      const sourceEdit = `${fixtureB.prefix} source edit`;
      await activateSlide(sidebar, 1);
      await editFirstChildThroughUi(page, clone.duplicateContainerId, clone.duplicateChildTitles[0]!, duplicateEdit);
      const duplicateAfterDuplicateEdit = await waitForPadletContentIncludes(supabaseB, duplicateChildId, duplicateEdit);
      const sourceAfterDuplicateEdit = (await fetchPadletById(supabaseB, sourceChildId))?.content;
      expect(sourceAfterDuplicateEdit).toBe(clone.sourceChildContents[0]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const sourceSidebarAfterReload = await openPresentationSidebar(page);
      await activateSlide(sourceSidebarAfterReload, 0);
      await editFirstChildThroughUi(page, clone.sourceContainerId, clone.sourceChildTitles[0]!, sourceEdit);
      const sourceAfterSourceEdit = await waitForPadletContentIncludes(supabaseB, sourceChildId, sourceEdit);
      const duplicateAfterSourceEdit = (await fetchPadletById(supabaseB, duplicateChildId))?.content;
      expect(duplicateAfterSourceEdit).toBe(duplicateAfterDuplicateEdit);
      const writes = wire.finish();
      expect(writes.rawWrites).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
      expect(writes.contentWrites).toBeGreaterThan(0);
      flowB = {
        prefix: fixtureB.prefix,
        clone,
        duplicateEdit,
        sourceEdit,
        duplicateAfterDuplicateEdit,
        sourceAfterDuplicateEdit,
        sourceAfterSourceEdit,
        duplicateAfterSourceEdit,
        writes,
      };
    } finally {
      const cleanup = await assertLocalCleanup(supabaseB, fixtureB);
      flowB = { ...flowB, cleanup };
    }

    const { supabase: supabaseC, fixture: fixtureC } = await createDisposableDrawingBoard('patch-086-clone-c');
    let flowC: any;
    try {
      const seeded = await seedDrawingContainers(supabaseC, fixtureC);
      await seedPresentationScene(supabaseC, fixtureC);
      expect(fixtureC.prefix.startsWith(PREFIX_C_ROOT)).toBe(true);
      const sourceContainerId = seeded.containers[1]!.id;
      const sourceFrameId = getSourceFrameId(activeSceneElements(await fetchMasterPadletRow(supabaseC, fixtureC.masterPadletId!)));
      const wire = startPadletWriteCapture(page);
      await openDrawingBoard(page, fixtureC.boardId);
      const sidebar = await openPresentationSidebar(page);
      await duplicateSlide(sidebar, 0);
      const firstClone = inspectClone(
        (await observeSettledScene(supabaseC, fixtureC.masterPadletId!)).elements,
        await fetchBoardPadlets(supabaseC, fixtureC.boardId),
        sourceFrameId,
        sourceContainerId,
      );
      await removeSlide(page, sidebar, 1, 1);
      const sourceAfterDuplicateDelete = await expectStablePadletPresence(supabaseC, sourceContainerId);
      const sourceChildrenAfterDuplicateDelete = await Promise.all(
        firstClone.sourceChildRowIds.map((childId) => expectStablePadletPresence(supabaseC, childId)),
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator(`[data-padlet-id="${sourceContainerId}"]`).first().waitFor({ timeout: 90_000 });
      const sidebarAfterReload = await openPresentationSidebar(page);
      await duplicateSlide(sidebarAfterReload, 0);
      const secondClone = inspectClone(
        (await observeSettledScene(supabaseC, fixtureC.masterPadletId!)).elements,
        await fetchBoardPadlets(supabaseC, fixtureC.boardId),
        sourceFrameId,
        sourceContainerId,
      );
      await removeSlide(page, sidebarAfterReload, 0, 1);
      const duplicateAfterSourceDelete = await expectStablePadletPresence(supabaseC, secondClone.duplicateContainerId);
      const duplicateChildrenAfterSourceDelete = await Promise.all(
        secondClone.duplicateChildRowIds.map((childId) => expectStablePadletPresence(supabaseC, childId)),
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      const remainingSidebarAfterReload = await openPresentationSidebar(page);
      await activateSlide(remainingSidebarAfterReload, 0);
      await page.locator(`[data-padlet-id="${secondClone.duplicateContainerId}"]`).first().waitFor({ timeout: 90_000 });
      const writes = wire.finish();
      expect(sourceAfterDuplicateDelete.id).toBe(sourceContainerId);
      expect(duplicateAfterSourceDelete.id).toBe(secondClone.duplicateContainerId);
      expect(writes.rawWrites).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
      expect(writes.contentWrites).toBeGreaterThan(0);
      flowC = {
        prefix: fixtureC.prefix,
        firstClone,
        secondClone,
        sourceAfterDuplicateDelete: sourceAfterDuplicateDelete.id,
        sourceChildrenAfterDuplicateDelete: sourceChildrenAfterDuplicateDelete.map((row) => row.id),
        duplicateAfterSourceDelete: duplicateAfterSourceDelete.id,
        duplicateChildrenAfterSourceDelete: duplicateChildrenAfterSourceDelete.map((row) => row.id),
        writes,
      };
    } finally {
      const cleanup = await assertLocalCleanup(supabaseC, fixtureC);
      flowC = { ...flowC, cleanup };
    }

    const { supabase: supabaseD, fixture: fixtureD } = await createDisposableDrawingBoard('patch-086-clone-d');
    let flowD: any;
    try {
      const seeded = await seedDrawingContainers(supabaseD, fixtureD);
      await seedPresentationScene(supabaseD, fixtureD);
      expect(fixtureD.prefix.startsWith(PREFIX_D_ROOT)).toBe(true);
      const sourceContainerId = seeded.containers[1]!.id;
      const sourceFrameId = getSourceFrameId(activeSceneElements(await fetchMasterPadletRow(supabaseD, fixtureD.masterPadletId!)));
      const wire = startPadletWriteCapture(page);
      await openDrawingBoard(page, fixtureD.boardId);
      const sidebar = await openPresentationSidebar(page);
      const addToDuplicateIntervalMs = await addSlideBelowThenDuplicate(page, sidebar);
      expect(addToDuplicateIntervalMs).toBeLessThanOrEqual(5_000);
      const settled = await observeSettledScene(supabaseD, fixtureD.masterPadletId!);
      expect(sortedFrames(settled.elements)).toHaveLength(4);
      const clone = inspectClone(settled.elements, await fetchBoardPadlets(supabaseD, fixtureD.boardId), sourceFrameId, sourceContainerId);
      const writes = wire.finish();
      expect(clone.duplicateContainerId).not.toBe(sourceContainerId);
      expect(clone.sharedSourceLinkCount).toBe(1);
      expect(writes.rawWrites).toBeLessThanOrEqual(RAW_WRITE_STOP_THRESHOLD);
      expect(writes.contentWrites).toBeGreaterThan(0);
      flowD = { prefix: fixtureD.prefix, addToDuplicateIntervalMs, clone, writes, settled };
    } finally {
      const cleanup = await assertLocalCleanup(supabaseD, fixtureD);
      flowD = { ...flowD, cleanup };
    }

    expect(new Set([flowA.prefix, flowB.prefix, flowC.prefix, flowD.prefix]).size).toBe(4);

    test.info().annotations.push({
      type: PRIMARY_ANNOTATION,
      description: JSON.stringify({
        flowA_freshFrameId: flowA.clone.duplicateFrameId !== flowA.clone.sourceFrameId,
        flowA_freshChildElementIds: flowA.clone.duplicateChildElementIds.every((id: string) => !flowA.clone.sourceChildElementIds.includes(id)),
        flowA_freshLinkedContainerId: flowA.clone.duplicateContainerId !== flowA.clone.sourceContainerId,
        flowA_freshChildRowIds: flowA.clone.duplicateChildRowIds.every((id: string) => !flowA.clone.sourceChildRowIds.includes(id)),
        flowA_initialEquivalence: JSON.stringify(flowA.clone.duplicateChildContents) === JSON.stringify(flowA.clone.sourceChildContents),
        flowA_metadataTreatment: flowA.clone.metadataTreatment,
        flowA_rewireWireEvidence: flowA.rewireWireEvidence,
        flowB_duplicateEditIsolation: flowB.sourceAfterDuplicateEdit === flowB.clone.sourceChildContents[0],
        flowB_sourceEditIsolation: flowB.duplicateAfterSourceEdit === flowB.duplicateAfterDuplicateEdit,
        flowC_deleteDuplicateIsolation: flowC.sourceAfterDuplicateDelete === flowC.firstClone.sourceContainerId,
        flowC_deleteDuplicateChildRowsSurvive: JSON.stringify(flowC.sourceChildrenAfterDuplicateDelete) === JSON.stringify(flowC.firstClone.sourceChildRowIds),
        flowC_deleteSourceIsolation: flowC.duplicateAfterSourceDelete === flowC.secondClone.duplicateContainerId,
        flowC_deleteSourceChildRowsSurvive: JSON.stringify(flowC.duplicateChildrenAfterSourceDelete) === JSON.stringify(flowC.secondClone.duplicateChildRowIds),
        flowD_rapidIntervalMs: flowD.addToDuplicateIntervalMs,
        flowD_rapidFreshLinkedRows: flowD.clone.duplicateContainerId !== flowD.clone.sourceContainerId,
        flowA_rawWrites: flowA.writes.rawWrites,
        flowB_rawWrites: flowB.writes.rawWrites,
        flowC_rawWrites: flowC.writes.rawWrites,
        flowD_rawWrites: flowD.writes.rawWrites,
        flowA_contentWrites: flowA.writes.contentWrites,
        flowB_contentWrites: flowB.writes.contentWrites,
        flowC_contentWrites: flowC.writes.contentWrites,
        flowD_contentWrites: flowD.writes.contentWrites,
        flowK,
        prefixA: flowA.prefix,
        prefixB: flowB.prefix,
        prefixC: flowC.prefix,
        prefixD: flowD.prefix,
        cleanupA: flowA.cleanup,
        cleanupB: flowB.cleanup,
        cleanupC: flowC.cleanup,
        cleanupD: flowD.cleanup,
        result: 'model-a-independent-deep-clone',
      }),
    });

    test.info().annotations.push({
      type: EVIDENCE_ANNOTATION,
      description: JSON.stringify({
        flowA,
        flowB,
        flowC,
        flowD,
        flowK,
      }),
    });
  });
});
