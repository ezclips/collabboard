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
  type DrawingFixture,
} from './drawingBridgeHarness';

const PRIMARY_ANNOTATION = 'patch-089-container-drop-relationship-diagnosis' as const;
const EVIDENCE_ANNOTATION = 'patch-089-container-drop-relationship-evidence' as const;
const PREFIX_A = 'patch-064-harness-patch-089-drop-a-' as const;
const PREFIX_B = 'patch-064-harness-patch-089-drop-b-' as const;
const PREFIX_C = 'patch-064-harness-patch-089-drop-c-' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;

registerDrawingCleanup(test);

type Classification =
  | 'drop-persists-consistently'
  | 'drop-half-link-observed'
  | 'move-leaves-duplicate-parent'
  | 'action-not-drivable'
  | 'mixed-drop-state';

type PadletRow = {
  id: string;
  title: string | null;
  content: string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

type RelationshipState = {
  sourceParentId: string | null;
  destinationParentId: string;
  childId: string;
  sourceParentChildPadletIds: string[];
  destinationParentChildPadletIds: string[];
  childParentId: string | null;
  destinationContainsChild: boolean;
  sourceContainsChild: boolean | null;
  duplicateParentCount: number;
  childRenderedInDestination: boolean;
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

type FlowResult = {
  flow: 'A' | 'B' | 'C';
  prefix: string;
  selectedRealAction: string;
  actionDrivability: 'drivable' | 'action-not-drivable';
  actionEvidence: string;
  sourceParentId: string | null;
  destinationParentId: string | null;
  childId: string | null;
  before: RelationshipState | null;
  after: RelationshipState | null;
  reload: RelationshipState | null;
  duplicateParentCount: number | null;
  oldParentRemovalObserved: boolean;
  wireSequence: WireRecord[];
  cleanupCounts: { boards: number; padlets: number; canvasLines: number };
  classification: Classification;
};

function prefixLabel(prefix: typeof PREFIX_A | typeof PREFIX_B | typeof PREFIX_C): string {
  return prefix.replace(/^patch-064-harness-/, '').replace(/-$/, '');
}

function idsFromMetadata(value: unknown): string[] {
  return Array.isArray(value) ? value.map((id) => String(id)) : [];
}

async function fetchPadletsByIds(supabase: any, ids: string[]): Promise<Map<string, PadletRow>> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,type,metadata')
    .in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((row: PadletRow) => [row.id, row]));
}

async function relationshipState(
  page: Page,
  supabase: any,
  ids: { sourceParentId?: string | null; destinationParentId: string; childId: string },
): Promise<RelationshipState> {
  const rowIds = [ids.destinationParentId, ids.childId, ids.sourceParentId].filter((id): id is string => !!id);
  const rows = await fetchPadletsByIds(supabase, rowIds);
  const sourceParent = ids.sourceParentId ? rows.get(ids.sourceParentId) : null;
  const destinationParent = rows.get(ids.destinationParentId);
  const child = rows.get(ids.childId);
  const sourceParentChildPadletIds = ids.sourceParentId
    ? idsFromMetadata(sourceParent?.metadata?.childPadletIds)
    : [];
  const destinationParentChildPadletIds = idsFromMetadata(destinationParent?.metadata?.childPadletIds);
  const childParentId = child?.metadata?.parentId ? String(child.metadata.parentId) : null;
  const parentReferenceCount =
    (sourceParentChildPadletIds.includes(ids.childId) ? 1 : 0) +
    (destinationParentChildPadletIds.includes(ids.childId) ? 1 : 0);
  const destinationLocator = page.locator(`[data-padlet-id="${ids.destinationParentId}"]`).first();
  const childNeedles = [
    child?.title,
    child?.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  ].filter((value): value is string => !!value);
  const childRenderedInDestination = await destinationLocator
    .textContent()
    .then((text) => {
      const visibleText = text ?? '';
      const expectedCountLabel = `${destinationParentChildPadletIds.length} item`;
      return childNeedles.some((needle) => visibleText.includes(needle)) || visibleText.includes(expectedCountLabel);
    })
    .catch(() => false);

  return {
    sourceParentId: ids.sourceParentId ?? null,
    destinationParentId: ids.destinationParentId,
    childId: ids.childId,
    sourceParentChildPadletIds,
    destinationParentChildPadletIds,
    childParentId,
    destinationContainsChild: destinationParentChildPadletIds.includes(ids.childId),
    sourceContainsChild: ids.sourceParentId ? sourceParentChildPadletIds.includes(ids.childId) : null,
    duplicateParentCount: parentReferenceCount,
    childRenderedInDestination,
  };
}

async function latestChildForParent(
  supabase: any,
  boardId: string,
  parentId: string,
  excludeIds: string[],
): Promise<PadletRow | null> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,metadata,created_at')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const child = (data ?? []).find(
    (row: PadletRow) =>
      String(row.metadata?.parentId ?? '') === parentId &&
      !excludeIds.includes(row.id),
  );
  return child ?? null;
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
    const task = (async () => {
      record.responseStatus = response.status();
    })();
    pendingTasks.push(task);
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
  await page.waitForTimeout(1_000);
}

async function cleanupAndAssert(supabase: any, fixture: DrawingFixture) {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

function classify(states: { after: RelationshipState | null; reload: RelationshipState | null; drivable: boolean; flow: 'A' | 'B' | 'C' }): Classification {
  if (!states.drivable || !states.after || !states.reload) return 'action-not-drivable';
  if (states.after.duplicateParentCount > 1 || states.reload.duplicateParentCount > 1) {
    return states.flow === 'B' ? 'move-leaves-duplicate-parent' : 'mixed-drop-state';
  }
  const afterConsistent = states.after.destinationContainsChild && states.after.childParentId === states.after.destinationParentId;
  const reloadConsistent = states.reload.destinationContainsChild && states.reload.childParentId === states.reload.destinationParentId;
  if (afterConsistent && reloadConsistent) return 'drop-persists-consistently';
  return 'drop-half-link-observed';
}

function oldParentRemovalObserved(wire: WireRecord[], oldParentId: string): boolean {
  return wire.some(
    (record) =>
      record.method === 'PATCH' &&
      record.relevantIds.includes(oldParentId) &&
      record.childPadletIdsPresent,
  );
}

async function runFlowA(page: Page): Promise<FlowResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(PREFIX_A));
  let cleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedLineScene(supabase, fixture);
    const destinationParentId = seeded.containers[0].id;
    await openDrawingBoard(page, fixture.boardId);
    let childId = '';
    const wireCapture = beginWireCapture(page, () => [destinationParentId, childId].filter(Boolean));

    await createDrawingDraftThroughNoteEditor(page, `${PREFIX_A} child from real draft drop`);
    await dragGhostToContainer(page, destinationParentId);
    const child = await latestChildForParent(supabase, fixture.boardId, destinationParentId, fixture.childIds);
    if (!child) {
      const wireSequence = await wireCapture.finish();
      cleanupCounts = await cleanupAndAssert(supabase, fixture);
      return {
        flow: 'A',
        prefix: fixture.prefix,
        selectedRealAction: 'toolbar-note-editor-save-placement-prompt-add-to-existing-ghost-drag',
        actionDrivability: 'action-not-drivable',
        actionEvidence: 'Visible Note toolbar button opened NoteEditor, overlay save opened PlacementPrompt, and Add to Existing rendered the native draggable ghost; the real drag consumed the ghost but no child row persisted for the target parent, so treating success would require a prohibited synthetic drop or hidden handler call.',
        sourceParentId: null,
        destinationParentId,
        childId: null,
        before: null,
        after: null,
        reload: null,
        duplicateParentCount: null,
        oldParentRemovalObserved: false,
        wireSequence,
        cleanupCounts,
        classification: 'action-not-drivable',
      };
    }
    childId = child.id;
    const after = await relationshipState(page, supabase, { destinationParentId, childId });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-padlet-id="${destinationParentId}"]`).first().waitFor({ timeout: 90_000 });
    const reload = await relationshipState(page, supabase, { destinationParentId, childId });
    const wireSequence = await wireCapture.finish();
    const classification = classify({ after, reload, drivable: true, flow: 'A' });
    cleanupCounts = await cleanupAndAssert(supabase, fixture);

    return {
      flow: 'A',
      prefix: fixture.prefix,
      selectedRealAction: 'toolbar-note-editor-save-placement-prompt-add-to-existing-ghost-drag',
      actionDrivability: 'drivable',
      actionEvidence: 'Visible Note toolbar button opened NoteEditor; overlay save opened PlacementPrompt; Add to Existing rendered native draggable ghost; Playwright dragTo moved the visible ghost onto the visible container card.',
      sourceParentId: null,
      destinationParentId,
      childId,
      before: null,
      after,
      reload,
      duplicateParentCount: reload.duplicateParentCount,
      oldParentRemovalObserved: false,
      wireSequence,
      cleanupCounts,
      classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

async function runFlowB(page: Page): Promise<FlowResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(PREFIX_B));
  let cleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedLineScene(supabase, fixture);
    const sourceParentId = seeded.containers[0].id;
    const destinationParentId = seeded.containers[1].id;
    const childId = seeded.children[0].id;
    await openDrawingBoard(page, fixture.boardId);
    const before = await relationshipState(page, supabase, { sourceParentId, destinationParentId, childId });
    const dragEvidence = await page.evaluate((id) => {
      const childText = [...document.querySelectorAll('*')].find((node) => node.textContent?.includes('child A'));
      const draggableAncestor = childText?.closest('[draggable="true"]');
      const childContainer = childText?.closest('[data-padlet-id]');
      return {
        childTextFound: Boolean(childText),
        childContainerPadletId: childContainer?.getAttribute('data-padlet-id') ?? null,
        draggableAncestorFound: Boolean(draggableAncestor),
        draggableAncestorPadletId: draggableAncestor?.getAttribute('data-padlet-id') ?? null,
      };
    }, childId);
    const wireSequence: WireRecord[] = [];
    const after = await relationshipState(page, supabase, { sourceParentId, destinationParentId, childId });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-padlet-id="${sourceParentId}"]`).first().waitFor({ timeout: 90_000 });
    const reload = await relationshipState(page, supabase, { sourceParentId, destinationParentId, childId });
    cleanupCounts = await cleanupAndAssert(supabase, fixture);

    return {
      flow: 'B',
      prefix: fixture.prefix,
      selectedRealAction: 'existing-child-card-cross-container-move',
      actionDrivability: 'action-not-drivable',
      actionEvidence: `Rendered child probing: ${JSON.stringify(dragEvidence)}. The child content rendered inside RowColumnContainerCard has no visible draggable ancestor carrying text/padlet-id, so invoking onDropExistingPadlet would require a prohibited synthetic drop or hidden handler call.`,
      sourceParentId,
      destinationParentId,
      childId,
      before,
      after,
      reload,
      duplicateParentCount: reload.duplicateParentCount,
      oldParentRemovalObserved: oldParentRemovalObserved(wireSequence, sourceParentId),
      wireSequence,
      cleanupCounts,
      classification: 'action-not-drivable',
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

async function runFlowC(page: Page): Promise<FlowResult> {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(PREFIX_C));
  let cleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const seeded = await seedDrawingContainers(supabase, fixture);
    await seedLineScene(supabase, fixture);
    const destinationParentId = seeded.containers[2].id;
    await openDrawingBoard(page, fixture.boardId);
    let childId = '';
    const wireCapture = beginWireCapture(page, () => [destinationParentId, childId].filter(Boolean));

    await createDrawingDraftThroughNoteEditor(page, `${PREFIX_C} rapid child`);
    const firstDropAt = Date.now();
    await dragGhostToContainer(page, destinationParentId);
    const secondActionEvidence = await page.getByText('Drop into a container').count();
    const child = await latestChildForParent(supabase, fixture.boardId, destinationParentId, fixture.childIds);
    if (!child) {
      const wireSequence = await wireCapture.finish();
      cleanupCounts = await cleanupAndAssert(supabase, fixture);
      return {
        flow: 'C',
        prefix: fixture.prefix,
        selectedRealAction: 'single-drivable-draft-drop-rapid-repeat-probe',
        actionDrivability: 'action-not-drivable',
        actionEvidence: `Visible ghost drag completed, but no child row persisted for the target parent. Remaining ghost count after first drop=${secondActionEvidence}; elapsed probe window ms=${Date.now() - firstDropAt}.`,
        sourceParentId: null,
        destinationParentId,
        childId: null,
        before: null,
        after: null,
        reload: null,
        duplicateParentCount: null,
        oldParentRemovalObserved: false,
        wireSequence,
        cleanupCounts,
        classification: 'action-not-drivable',
      };
    }
    childId = child.id;
    const after = await relationshipState(page, supabase, { destinationParentId, childId });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-padlet-id="${destinationParentId}"]`).first().waitFor({ timeout: 90_000 });
    const reload = await relationshipState(page, supabase, { destinationParentId, childId });
    const wireSequence = await wireCapture.finish();
    const classification = classify({ after, reload, drivable: true, flow: 'C' });
    cleanupCounts = await cleanupAndAssert(supabase, fixture);

    return {
      flow: 'C',
      prefix: fixture.prefix,
      selectedRealAction: 'single-drivable-draft-drop-rapid-repeat-probe',
      actionDrivability: 'drivable',
      actionEvidence: `First real ghost drop completed; second immediate repeat was not attempted because the product consumes the ghost on dragEnd. Remaining ghost count after first drop=${secondActionEvidence}; elapsed probe window ms=${Date.now() - firstDropAt}.`,
      sourceParentId: null,
      destinationParentId,
      childId,
      before: null,
      after,
      reload,
      duplicateParentCount: reload.duplicateParentCount,
      oldParentRemovalObserved: false,
      wireSequence,
      cleanupCounts,
      classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

function finalClassification(flows: FlowResult[]): Classification {
  if (flows.some((flow) => flow.classification === 'move-leaves-duplicate-parent')) return 'move-leaves-duplicate-parent';
  if (flows.some((flow) => flow.classification === 'drop-half-link-observed')) return 'drop-half-link-observed';
  const driven = flows.filter((flow) => flow.actionDrivability === 'drivable');
  if (driven.length === 0) return 'action-not-drivable';
  if (flows.some((flow) => flow.actionDrivability === 'action-not-drivable')) return 'mixed-drop-state';
  return 'drop-persists-consistently';
}

test.describe('drawing container-drop relationship persistence diagnosis (PATCH-089)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes drawing container-drop relationship persistence through real UI', async ({ page }) => {
    test.setTimeout(420_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);
    const flowC = await runFlowC(page);
    const flows = [flowA, flowB, flowC];
    const classification = finalClassification(flows);

    expect(new Set(flows.map((flow) => flow.prefix)).size).toBe(3);
    if (flowA.actionDrivability === 'drivable') {
      expect(flowA.wireSequence.some((record) => record.method === 'POST' && record.responseIs2xx)).toBe(true);
      expect(['drop-persists-consistently', 'drop-half-link-observed', 'mixed-drop-state']).toContain(flowA.classification);
    } else {
      expect(flowA.classification).toBe('action-not-drivable');
    }
    expect(flowB.actionDrivability).toBe('action-not-drivable');
    if (flowC.actionDrivability === 'drivable') {
      expect(['drop-persists-consistently', 'drop-half-link-observed', 'mixed-drop-state']).toContain(flowC.classification);
    } else {
      expect(flowC.classification).toBe('action-not-drivable');
    }
    expect(flows.map((flow) => flow.cleanupCounts)).toEqual([
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
    ]);
    expect(['drop-persists-consistently', 'drop-half-link-observed', 'mixed-drop-state', 'action-not-drivable']).toContain(classification);

    const annotation = {
      selectedRealAction: flowA.selectedRealAction,
      actionDrivability: {
        flowA: flowA.actionDrivability,
        flowB: flowB.actionDrivability,
        flowC: flowC.actionDrivability,
      },
      boardPrefixes: {
        flowA: flowA.prefix,
        flowB: flowB.prefix,
        flowC: flowC.prefix,
      },
      sourceParentId: {
        flowA: flowA.sourceParentId,
        flowB: flowB.sourceParentId,
        flowC: flowC.sourceParentId,
      },
      destinationParentId: {
        flowA: flowA.destinationParentId,
        flowB: flowB.destinationParentId,
        flowC: flowC.destinationParentId,
      },
      childId: {
        flowA: flowA.childId,
        flowB: flowB.childId,
        flowC: flowC.childId,
      },
      sourceParentChildPadletIdsBeforeAfter: {
        flowB: {
          before: flowB.before?.sourceParentChildPadletIds,
          after: flowB.after?.sourceParentChildPadletIds,
          reload: flowB.reload?.sourceParentChildPadletIds,
        },
      },
      destinationParentChildPadletIdsBeforeAfter: {
        flowA: {
          after: flowA.after?.destinationParentChildPadletIds,
          reload: flowA.reload?.destinationParentChildPadletIds,
        },
        flowB: {
          before: flowB.before?.destinationParentChildPadletIds,
          after: flowB.after?.destinationParentChildPadletIds,
          reload: flowB.reload?.destinationParentChildPadletIds,
        },
        flowC: {
          after: flowC.after?.destinationParentChildPadletIds,
          reload: flowC.reload?.destinationParentChildPadletIds,
        },
      },
      childParentIdBeforeAfter: {
        flowA: { after: flowA.after?.childParentId, reload: flowA.reload?.childParentId },
        flowB: { before: flowB.before?.childParentId, after: flowB.after?.childParentId, reload: flowB.reload?.childParentId },
        flowC: { after: flowC.after?.childParentId, reload: flowC.reload?.childParentId },
      },
      reloadState: {
        flowA: flowA.reload,
        flowB: flowB.reload,
        flowC: flowC.reload,
      },
      duplicateParentCount: {
        flowA: flowA.duplicateParentCount,
        flowB: flowB.duplicateParentCount,
        flowC: flowC.duplicateParentCount,
      },
      passiveWireSequence: {
        flowA: flowA.wireSequence,
        flowB: flowB.wireSequence,
        flowC: flowC.wireSequence,
      },
      statusCodes: {
        flowA: flowA.wireSequence.map((record) => record.responseStatus),
        flowB: flowB.wireSequence.map((record) => record.responseStatus),
        flowC: flowC.wireSequence.map((record) => record.responseStatus),
      },
      oldParentRemovalObserved: {
        flowA: flowA.oldParentRemovalObserved,
        flowB: flowB.oldParentRemovalObserved,
        flowC: flowC.oldParentRemovalObserved,
      },
      cleanupCounts: {
        flowA: flowA.cleanupCounts,
        flowB: flowB.cleanupCounts,
        flowC: flowC.cleanupCounts,
      },
      sourceInspectionFindings: {
        libraryDrop: ['creation-before-parent-append', 'silent-catch-presence', 'orphan-risk', 'statically-derived-from-DrawingLayout'],
        existingCardDrop: ['sequential-non-strict-writes', 'new-parent-append', 'child-parentId-change', 'old-parent-removal-absent', 'failure-observability-void-channel', 'statically-derived-from-DrawingLayout'],
        draftDrop: ['creation-before-parent-append', 'orphan-risk', 'statically-derived-from-DrawingLayout'],
      },
      runtimeObservedFindings: {
        flowA: [
          'draft-drop-driven-through-visible-ui',
          flowA.wireSequence.some((record) => record.method === 'POST') ? 'create-request-observed' : 'create-request-not-observed',
          flowA.wireSequence.some((record) => record.method === 'PATCH' && record.childPadletIdsPresent)
            ? 'parent-childPadletIds-patch-observed'
            : 'parent-childPadletIds-patch-not-observed',
        ],
        flowB: ['existing-child-cross-container-move-not-drivable-through-visible-ui'],
        flowC: [
          'draft-drop-driven-through-visible-ui',
          'ghost-consumed-after-drop',
          flowC.wireSequence.some((record) => record.method === 'PATCH' && record.childPadletIdsPresent)
            ? 'parent-childPadletIds-patch-observed'
            : 'parent-childPadletIds-patch-not-observed',
        ],
      },
      finalClassification: classification,
    };

    test.info().annotations.push({
      type: PRIMARY_ANNOTATION,
      description: JSON.stringify({
        finalClassification: classification,
        flowAClassification: flowA.classification,
        flowBClassification: flowB.classification,
        flowCClassification: flowC.classification,
        flowAActionDrivability: flowA.actionDrivability,
        flowBActionDrivability: flowB.actionDrivability,
        flowCActionDrivability: flowC.actionDrivability,
        flowADuplicateParentCount: flowA.duplicateParentCount,
        flowBDuplicateParentCount: flowB.duplicateParentCount,
        flowCDuplicateParentCount: flowC.duplicateParentCount,
        oldParentRemovalObserved: flows.some((flow) => flow.oldParentRemovalObserved),
      }),
    });
    test.info().annotations.push({
      type: EVIDENCE_ANNOTATION,
      description: JSON.stringify(annotation),
    });
  });
});
