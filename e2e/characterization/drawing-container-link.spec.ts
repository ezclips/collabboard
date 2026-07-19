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
  seedLineScene,
  type CleanupCounts,
  type DrawingFixture,
} from './drawingBridgeHarness';

const ANNOTATION = 'patch-090-container-link-evidence' as const;
const PREFIX_A = 'patch-064-harness-patch-090-link-a-' as const;
const PREFIX_B = 'patch-064-harness-patch-090-link-b-' as const;
const PREFIX_C = 'patch-064-harness-patch-090-link-c-' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;

registerDrawingCleanup(test);

type PadletRow = {
  id: string;
  title: string | null;
  content: string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

type WireRecord = {
  sequence: number;
  elapsedMs: number;
  method: string;
  pathname: string;
  queryKeys: string[];
  relevantIds: string[];
  parentIdPresent: boolean;
  childPadletIdsPresent: boolean;
  responseStatus: number | null;
  responseIs2xx: boolean;
};

type LinkState = {
  parentId: string;
  childIds: string[];
  parentChildPadletIds: string[];
  childParentIds: Record<string, string | null>;
  childReferenceCounts: Record<string, number>;
  duplicateReferenceCounts: Record<string, number>;
  orphanChildIds: string[];
  childRendered: Record<string, boolean>;
};

type FlowResult = {
  flow: 'A' | 'B' | 'C';
  actionType: string;
  actionDrivability: 'drivable';
  boardPrefix: string;
  parentId: string;
  childIds: string[];
  parentChildPadletIdsBefore: string[];
  parentChildPadletIdsAfter: string[];
  childParentId: Record<string, string | null>;
  duplicateReferenceCounts: Record<string, number>;
  reloadState: LinkState;
  wireOrder: WireRecord[];
  responseStatuses: (number | null)[];
  localSettlementOrdering: string;
  errorCount: number;
  cleanupCounts: CleanupCounts;
  finalClassification: 'container-link-persists-consistently';
};

function prefixLabel(prefix: typeof PREFIX_A | typeof PREFIX_B | typeof PREFIX_C): string {
  return prefix.replace(/^patch-064-harness-/, '').replace(/-$/, '');
}

function idsFromMetadata(value: unknown): string[] {
  return Array.isArray(value) ? value.map((id) => String(id)) : [];
}

async function fetchBoardPadlets(supabase: any, boardId: string): Promise<PadletRow[]> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,metadata,created_at')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function linkState(
  page: Page,
  supabase: any,
  boardId: string,
  parentId: string,
  childIds: string[],
): Promise<LinkState> {
  const rows = await fetchBoardPadlets(supabase, boardId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parent = byId.get(parentId);
  const parentChildPadletIds = idsFromMetadata(parent?.metadata?.childPadletIds);
  const childParentIds: Record<string, string | null> = {};
  const childReferenceCounts: Record<string, number> = {};
  const duplicateReferenceCounts: Record<string, number> = {};
  const childRendered: Record<string, boolean> = {};

  for (const childId of childIds) {
    const child = byId.get(childId);
    childParentIds[childId] = child?.metadata?.parentId ? String(child.metadata.parentId) : null;
    childReferenceCounts[childId] = parentChildPadletIds.filter((id) => id === childId).length;
    duplicateReferenceCounts[childId] = Math.max(0, childReferenceCounts[childId] - 1);
    const needles = [
      child?.title,
      child?.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    ].filter((value): value is string => !!value);
    childRendered[childId] = await page
      .locator(`[data-padlet-id="${parentId}"]`)
      .first()
      .textContent()
      .then((text) => needles.some((needle) => (text ?? '').includes(needle)))
      .catch(() => false);
  }

  const orphanChildIds = rows
    .filter((row) => String(row.metadata?.parentId ?? '') === parentId)
    .map((row) => row.id)
    .filter((childId) => !parentChildPadletIds.includes(childId));

  return {
    parentId,
    childIds,
    parentChildPadletIds,
    childParentIds,
    childReferenceCounts,
    duplicateReferenceCounts,
    orphanChildIds,
    childRendered,
  };
}

async function latestChildrenForParent(
  supabase: any,
  boardId: string,
  parentId: string,
  excludeIds: string[],
): Promise<PadletRow[]> {
  const rows = await fetchBoardPadlets(supabase, boardId);
  return rows.filter(
    (row) =>
      String(row.metadata?.parentId ?? '') === parentId &&
      !excludeIds.includes(row.id),
  );
}

function isPadletsEndpoint(urlText: string): boolean {
  try {
    return new URL(urlText).pathname.includes(PADLETS_ENDPOINT_PATH);
  } catch {
    return false;
  }
}

function bodyContainsField(rawBody: string | null, field: string): boolean {
  if (!rawBody) return false;
  try {
    const parsed = JSON.parse(rawBody);
    return JSON.stringify(parsed).includes(`"${field}"`);
  } catch {
    return rawBody.includes(field);
  }
}

function beginWireCapture(page: Page, relevantIds: () => string[]) {
  const startedAt = Date.now();
  let sequence = 0;
  let finished = false;
  const pendingTasks: Promise<void>[] = [];
  const records = new Map<
    PlaywrightRequest,
    {
      sequence: number;
      elapsedMs: number;
      method: string;
      pathname: string;
      queryKeys: string[];
      rawBody: string | null;
      urlText: string;
      responseStatus: number | null;
    }
  >();

  const onRequest = (request: PlaywrightRequest) => {
    if (!isPadletsEndpoint(request.url())) return;
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method())) return;
    const url = new URL(request.url());
    records.set(request, {
      sequence: ++sequence,
      elapsedMs: Date.now() - startedAt,
      method: request.method(),
      pathname: url.pathname,
      queryKeys: [...url.searchParams.keys()].sort(),
      rawBody: request.postData() ?? null,
      urlText: request.url(),
      responseStatus: null,
    });
  };

  const onResponse = (response: PlaywrightResponse) => {
    const record = records.get(response.request());
    if (!record) return;
    pendingTasks.push((async () => {
      record.responseStatus = response.status();
    })());
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    finish: async (): Promise<WireRecord[]> => {
      if (!finished) {
        page.off('request', onRequest);
        page.off('response', onResponse);
        finished = true;
      }
      await Promise.all(pendingTasks);
      const ids = relevantIds();
      return [...records.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((record) => {
          const responseStatus = record.responseStatus;
          const haystack = `${record.urlText} ${record.rawBody ?? ''}`;
          return {
            sequence: record.sequence,
            elapsedMs: record.elapsedMs,
            method: record.method,
            pathname: record.pathname,
            queryKeys: record.queryKeys,
            relevantIds: ids.filter((id) => haystack.includes(id)),
            parentIdPresent: bodyContainsField(record.rawBody, 'parentId'),
            childPadletIdsPresent: bodyContainsField(record.rawBody, 'childPadletIds'),
            responseStatus,
            responseIs2xx: responseStatus !== null && responseStatus >= 200 && responseStatus < 300,
          };
        });
    },
  };
}

async function noteTool(page: Page): Promise<Locator> {
  return page.locator('.cursor-pointer').filter({ hasText: 'Note' }).first();
}

async function createDrawingDraftThroughNoteEditor(page: Page, content: string): Promise<void> {
  await (await noteTool(page)).click();
  const editor = page.locator('.ProseMirror[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.fill(content);
  await page.mouse.click(100, 100);
  await expect(page.getByText('Where should this go?')).toBeVisible({ timeout: 30_000 });
  await page.getByText('Add to Existing', { exact: true }).click();
  await expect(page.getByText('Drop into a container')).toBeVisible({ timeout: 30_000 });
}

async function dragGhostToContainer(page: Page, containerId: string): Promise<void> {
  const ghost = page.locator('div[draggable="true"]').filter({ hasText: 'Drop into a container' }).first();
  const target = page.locator(`[data-padlet-id="${containerId}"]`).first();
  await expect(ghost).toBeVisible({ timeout: 30_000 });
  await expect(target).toBeVisible({ timeout: 30_000 });
  await ghost.dragTo(target, {
    targetPosition: { x: 160, y: 110 },
    timeout: 30_000,
  });
  await expect(ghost).toHaveCount(0, { timeout: 30_000 });
}

async function createAndDropChild(
  page: Page,
  supabase: any,
  fixture: DrawingFixture,
  parentId: string,
  content: string,
  knownChildIds: string[],
): Promise<string> {
  await createDrawingDraftThroughNoteEditor(page, content);
  await dragGhostToContainer(page, parentId);
  await expect
    .poll(async () => {
      const rows = await latestChildrenForParent(supabase, fixture.boardId, parentId, knownChildIds);
      return rows.length;
    }, { timeout: 60_000 })
    .toBeGreaterThan(0);
  const children = await latestChildrenForParent(supabase, fixture.boardId, parentId, knownChildIds);
  const child = children.at(-1);
  if (!child) throw new Error('Real ghost drop completed but no child row was created for the target parent');
  return child.id;
}

function assertLinked(state: LinkState): void {
  expect(state.orphanChildIds).toEqual([]);
  for (const childId of state.childIds) {
    expect(state.childParentIds[childId]).toBe(state.parentId);
    expect(state.childReferenceCounts[childId]).toBe(1);
    expect(state.duplicateReferenceCounts[childId]).toBe(0);
    expect(state.childRendered[childId]).toBe(true);
  }
}

function parentAppendOrder(wire: WireRecord[], childIds: string[]): string {
  const createSequences = wire
    .filter((record) => record.method === 'POST' && record.parentIdPresent && record.responseIs2xx)
    .map((record) => record.sequence);
  const appendSequences = childIds.map((childId) =>
    wire.find((record) => record.method === 'PATCH' && record.relevantIds.includes(childId) && record.childPadletIdsPresent && record.responseIs2xx)?.sequence ?? -1,
  );
  expect(createSequences.length).toBeGreaterThanOrEqual(childIds.length);
  expect(appendSequences.every((sequence) => sequence > 0)).toBe(true);
  for (let index = 0; index < childIds.length; index += 1) {
    expect(createSequences.some((sequence) => sequence < appendSequences[index])).toBe(true);
  }
  return 'child-create-2xx-before-strict-parent-append-2xx-before-post-action-relationship-read';
}

async function cleanupAndAssert(supabase: any, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

async function runFlow(
  page: Page,
  prefix: typeof PREFIX_A | typeof PREFIX_B | typeof PREFIX_C,
  flow: 'A' | 'B' | 'C',
  dropCount: number,
): Promise<FlowResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(prefix));
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedLineScene(supabase, fixture);
    const parentId = seeded.containers[0].id;
    await openDrawingBoard(page, fixture.boardId);
    const before = await linkState(page, supabase, fixture.boardId, parentId, []);
    const childIds: string[] = [];
    const consoleErrors: string[] = [];
    const onConsole = (message: { type: () => string; text: () => string }) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    };
    page.on('console', onConsole);
    const wireCapture = beginWireCapture(page, () => [parentId, ...childIds]);
    const actionStartedAt = Date.now();

    try {
      for (let index = 0; index < dropCount; index += 1) {
        const childId = await createAndDropChild(
          page,
          supabase,
          fixture,
          parentId,
          `${prefix} real draft child ${index + 1}`,
          [...fixture.childIds, ...childIds],
        );
        childIds.push(childId);
      }
    } finally {
      page.off('console', onConsole);
    }

    const after = await linkState(page, supabase, fixture.boardId, parentId, childIds);
    assertLinked(after);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-padlet-id="${parentId}"]`).first().waitFor({ timeout: 90_000 });
    const reload = await linkState(page, supabase, fixture.boardId, parentId, childIds);
    assertLinked(reload);
    const wireOrder = await wireCapture.finish();
    const localSettlementOrdering = parentAppendOrder(wireOrder, childIds);
    const expectedTail = before.parentChildPadletIds.concat(childIds);
    expect(after.parentChildPadletIds.slice(-childIds.length)).toEqual(childIds);
    expect(reload.parentChildPadletIds).toEqual(expectedTail);
    expect(new Set(childIds).size).toBe(childIds.length);
    expect(consoleErrors).toEqual([]);
    if (flow === 'C') {
      expect(Date.now() - actionStartedAt).toBeLessThanOrEqual(300_000);
    }
    cleanupCounts = await cleanupAndAssert(supabase, fixture);

    return {
      flow,
      actionType: 'toolbar-note-editor-save-placement-prompt-add-to-existing-ghost-drag',
      actionDrivability: 'drivable',
      boardPrefix: fixture.prefix,
      parentId,
      childIds,
      parentChildPadletIdsBefore: before.parentChildPadletIds,
      parentChildPadletIdsAfter: after.parentChildPadletIds,
      childParentId: after.childParentIds,
      duplicateReferenceCounts: after.duplicateReferenceCounts,
      reloadState: reload,
      wireOrder,
      responseStatuses: wireOrder.map((record) => record.responseStatus),
      localSettlementOrdering,
      errorCount: consoleErrors.length,
      cleanupCounts,
      finalClassification: 'container-link-persists-consistently',
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

test.describe('drawing container child create-and-append atomicity (PATCH-090)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('persists container child links for real draft drops', async ({ page }) => {
    test.setTimeout(420_000);

    const flowA = await runFlow(page, PREFIX_A, 'A', 1);
    const flowB = await runFlow(page, PREFIX_B, 'B', 2);
    const flowC = await runFlow(page, PREFIX_C, 'C', 2);
    const flows = [flowA, flowB, flowC];

    expect(new Set(flows.map((result) => result.boardPrefix)).size).toBe(3);
    expect(flows.map((result) => result.cleanupCounts)).toEqual([
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
    ]);

    test.info().annotations.push({
      type: ANNOTATION,
      description: JSON.stringify({
        actionType: {
          flowA: flowA.actionType,
          flowB: flowB.actionType,
          flowC: flowC.actionType,
        },
        actionDrivability: {
          flowA: flowA.actionDrivability,
          flowB: flowB.actionDrivability,
          flowC: flowC.actionDrivability,
        },
        boardPrefixes: {
          flowA: flowA.boardPrefix,
          flowB: flowB.boardPrefix,
          flowC: flowC.boardPrefix,
        },
        parentIds: {
          flowA: flowA.parentId,
          flowB: flowB.parentId,
          flowC: flowC.parentId,
        },
        childIds: {
          flowA: flowA.childIds,
          flowB: flowB.childIds,
          flowC: flowC.childIds,
        },
        parentChildPadletIdsBeforeAfter: {
          flowA: { before: flowA.parentChildPadletIdsBefore, after: flowA.parentChildPadletIdsAfter },
          flowB: { before: flowB.parentChildPadletIdsBefore, after: flowB.parentChildPadletIdsAfter },
          flowC: { before: flowC.parentChildPadletIdsBefore, after: flowC.parentChildPadletIdsAfter },
        },
        childParentId: {
          flowA: flowA.childParentId,
          flowB: flowB.childParentId,
          flowC: flowC.childParentId,
        },
        duplicateReferenceCounts: {
          flowA: flowA.duplicateReferenceCounts,
          flowB: flowB.duplicateReferenceCounts,
          flowC: flowC.duplicateReferenceCounts,
        },
        reloadState: {
          flowA: flowA.reloadState,
          flowB: flowB.reloadState,
          flowC: flowC.reloadState,
        },
        wireOrder: {
          flowA: flowA.wireOrder,
          flowB: flowB.wireOrder,
          flowC: flowC.wireOrder,
        },
        responseStatuses: {
          flowA: flowA.responseStatuses,
          flowB: flowB.responseStatuses,
          flowC: flowC.responseStatuses,
        },
        localSettlementOrdering: {
          flowA: flowA.localSettlementOrdering,
          flowB: flowB.localSettlementOrdering,
          flowC: flowC.localSettlementOrdering,
        },
        errorCount: {
          flowA: flowA.errorCount,
          flowB: flowB.errorCount,
          flowC: flowC.errorCount,
        },
        compensationInspectionResult: {
          helper: 'create succeeds before strict append; append failure compensates only created child id with best-effort onDeletePadlet; callers do not duplicate the error path; no retry or timer',
          libraryHeaderFallback: 'shares helper by source inspection',
          draftDrop: 'shares helper by source inspection',
          existingCardMove: 'out-of-scope and not involved',
        },
        cleanupCounts: {
          flowA: flowA.cleanupCounts,
          flowB: flowB.cleanupCounts,
          flowC: flowC.cleanupCounts,
        },
        finalResultClassification: {
          flowA: flowA.finalClassification,
          flowB: flowB.finalClassification,
          flowC: flowC.finalClassification,
        },
      }),
    });
  });
});
