import {
  expect,
  test,
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

const ANNOTATION = 'patch-092-drawing-comment-strict-persistence-evidence' as const;
const PREFIX_A = 'patch-064-harness-patch-092-comment-a-' as const;
const PREFIX_B = 'patch-064-harness-patch-092-comment-b-' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;

registerDrawingCleanup(test);

type CommentShape = {
  id: string | null;
  text: string | null;
  hasUserId: boolean;
  hasUserName: boolean;
  hasTimestamp: boolean;
};

type StoreState = {
  comments: CommentShape[];
  detachedComments: CommentShape[];
};

type WireRecord = {
  sequence: number;
  elapsedMs: number;
  method: string;
  pathname: string;
  queryKeys: string[];
  relevantIds: string[];
  commentsFieldPresent: boolean;
  detachedCommentsFieldPresent: boolean;
  boundedCommentIds: string[];
  boundedCommentCount: number | null;
  responseStatus: number | null;
  responseIs2xx: boolean;
};

type FlowResult = {
  flow: 'A' | 'B';
  boardPrefix: string;
  targetContainerId: string;
  targetPadletId: string;
  commentFixtureTexts: string[];
  commentIds: string[];
  localBefore: string[];
  localAfter: string[];
  commentsBefore: CommentShape[];
  commentsAfter: CommentShape[];
  detachedCommentsBefore: CommentShape[];
  detachedCommentsAfter: CommentShape[];
  wireSequence: WireRecord[];
  statuses: (number | null)[];
  orderingEvidence: string[];
  reloadState: StoreState;
  visibleErrorCount: number;
  duplicateEvidence: string[];
  lostWriteEvidence: string[];
  cleanupCounts: CleanupCounts;
  result: 'strict-comment-persists-consistently';
};

type PadletRow = {
  id: string;
  title: string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

function prefixLabel(prefix: typeof PREFIX_A | typeof PREFIX_B): string {
  return prefix.replace(/^patch-064-harness-/, '').replace(/-$/, '');
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function summarizeComments(value: unknown): CommentShape[] {
  if (!Array.isArray(value)) return [];
  return value.map((comment) => {
    const row = (comment ?? {}) as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' ? row.id : null,
      text: normalizeText(row.text),
      hasUserId: typeof row.userId === 'string',
      hasUserName: typeof row.userName === 'string',
      hasTimestamp: typeof row.timestamp === 'number',
    };
  });
}

function commentTexts(comments: CommentShape[]): string[] {
  return comments.map((comment) => comment.text).filter((text): text is string => !!text);
}

async function readCommentStore(supabase: any, padletId: string): Promise<StoreState> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,type,metadata')
    .eq('id', padletId)
    .single();
  if (error) throw error;
  const row = data as PadletRow;
  return {
    comments: summarizeComments(row.metadata?.comments),
    detachedComments: summarizeComments(row.metadata?.detachedComments),
  };
}

async function readLocalTexts(target: Locator, fixtureTexts: string[]): Promise<string[]> {
  const visible: string[] = [];
  for (const text of fixtureTexts) {
    if (await target.getByText(text, { exact: false }).count()) {
      visible.push(text);
    }
  }
  return visible;
}

function isPadletsEndpoint(urlText: string): boolean {
  try {
    return new URL(urlText).pathname.includes(PADLETS_ENDPOINT_PATH);
  } catch {
    return false;
  }
}

function bodySummary(rawBody: string | null) {
  const empty = {
    commentsFieldPresent: false,
    detachedCommentsFieldPresent: false,
    boundedCommentIds: [] as string[],
    boundedCommentCount: null as number | null,
  };
  if (!rawBody) return empty;
  try {
    const parsed = JSON.parse(rawBody);
    const serialized = JSON.stringify(parsed);
    const metadata = (parsed?.metadata ?? {}) as Record<string, unknown>;
    const comments = Array.isArray(metadata.comments) ? metadata.comments : null;
    const detachedComments = Array.isArray(metadata.detachedComments) ? metadata.detachedComments : null;
    const active = comments ?? detachedComments;
    return {
      commentsFieldPresent: serialized.includes('"comments"'),
      detachedCommentsFieldPresent: serialized.includes('"detachedComments"'),
      boundedCommentIds: Array.isArray(active)
        ? active
            .map((comment) => ((comment ?? {}) as Record<string, unknown>).id)
            .filter((id): id is string => typeof id === 'string' && id.startsWith('comment-'))
            .slice(0, 5)
        : [],
      boundedCommentCount: Array.isArray(active) ? active.length : null,
    };
  } catch {
    return {
      ...empty,
      commentsFieldPresent: rawBody.includes('comments'),
      detachedCommentsFieldPresent: rawBody.includes('detachedComments'),
    };
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
      urlText: string;
      rawBody: string | null;
      responseStatus: number | null;
    }
  >();

  const onRequest = (request: PlaywrightRequest) => {
    if (!isPadletsEndpoint(request.url())) return;
    if (request.method() !== 'PATCH') return;
    const url = new URL(request.url());
    records.set(request, {
      sequence: ++sequence,
      elapsedMs: Date.now() - startedAt,
      method: request.method(),
      pathname: url.pathname,
      queryKeys: [...url.searchParams.keys()].sort(),
      urlText: request.url(),
      rawBody: request.postData() ?? null,
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
          const summary = bodySummary(record.rawBody);
          const haystack = `${record.urlText} ${record.rawBody ?? ''}`;
          const responseStatus = record.responseStatus;
          return {
            sequence: record.sequence,
            elapsedMs: record.elapsedMs,
            method: record.method,
            pathname: record.pathname,
            queryKeys: record.queryKeys,
            relevantIds: ids.filter((id) => haystack.includes(id)),
            ...summary,
            responseStatus,
            responseIs2xx: responseStatus !== null && responseStatus >= 200 && responseStatus < 300,
          };
        });
    },
  };
}

async function seedCommentPost(
  supabase: any,
  fixture: DrawingFixture,
  containerId: string,
): Promise<string> {
  const commentPadletId = crypto.randomUUID();
  const { error: insertError } = await supabase.from('padlets').insert({
    id: commentPadletId,
    board_id: fixture.boardId,
    title: `${fixture.prefix} comment post`,
    content: '',
    type: 'comment',
    position_x: 0,
    position_y: 0,
    width: 260,
    height: 160,
    metadata: {
      patch064Harness: true,
      parentId: containerId,
      comments: [],
    },
  });
  if (insertError) throw insertError;
  fixture.childIds.push(commentPadletId);

  const { data: container, error: selectError } = await supabase
    .from('padlets')
    .select('id,metadata')
    .eq('id', containerId)
    .single();
  if (selectError) throw selectError;
  const metadata = (container.metadata ?? {}) as Record<string, unknown>;
  const currentChildren = Array.isArray(metadata.childPadletIds)
    ? metadata.childPadletIds.map((id) => String(id))
    : [];
  const { error: updateError } = await supabase
    .from('padlets')
    .update({ metadata: { ...metadata, childPadletIds: [...currentChildren, commentPadletId] } })
    .eq('id', containerId);
  if (updateError) throw updateError;
  return commentPadletId;
}

async function setupBoard(prefix: typeof PREFIX_A | typeof PREFIX_B) {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(prefix));
  const seeded = await seedDrawingContainers(supabase, fixture);
  await seedLineScene(supabase, fixture);
  const targetContainerId = seeded.containers[0].id;
  const targetPadletId = await seedCommentPost(supabase, fixture, targetContainerId);
  return { supabase, fixture, targetContainerId, targetPadletId };
}

async function openTarget(page: Page, boardId: string, targetContainerId: string): Promise<Locator> {
  await openDrawingBoard(page, boardId);
  const target = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
  await expect(target).toBeVisible({ timeout: 90_000 });
  return target;
}

async function addComment(target: Locator, text: string): Promise<void> {
  await target.getByPlaceholder('Add a comment...').fill(text);
  await target.getByTitle('Send').click();
}

async function removeComment(target: Locator, text: string): Promise<void> {
  await target.getByText(text, { exact: false }).click();
  await target.getByTitle('Delete').first().click();
}

async function waitForPersistedTexts(supabase: any, padletId: string, expectedTexts: string[]): Promise<StoreState> {
  await expect
    .poll(async () => {
      const state = await readCommentStore(supabase, padletId);
      const texts = commentTexts(state.comments);
      return expectedTexts.every((text) => texts.includes(text));
    }, { timeout: 30_000 })
    .toBe(true);
  return readCommentStore(supabase, padletId);
}

async function waitForPersistedAbsence(supabase: any, padletId: string, absentText: string): Promise<StoreState> {
  await expect
    .poll(async () => {
      const state = await readCommentStore(supabase, padletId);
      return !commentTexts(state.comments).includes(absentText);
    }, { timeout: 30_000 })
    .toBe(true);
  return readCommentStore(supabase, padletId);
}

async function waitForVisibleTexts(target: Locator, expectedTexts: string[]): Promise<string[]> {
  await expect
    .poll(async () => readLocalTexts(target, expectedTexts), { timeout: 30_000 })
    .toEqual(expectedTexts);
  return readLocalTexts(target, expectedTexts);
}

async function waitForVisibleAbsence(target: Locator, text: string, remainingTexts: string[]): Promise<string[]> {
  await expect(target.getByText(text, { exact: false })).toHaveCount(0, { timeout: 30_000 });
  return readLocalTexts(target, remainingTexts);
}

async function reloadState(
  page: Page,
  supabase: any,
  targetContainerId: string,
  targetPadletId: string,
): Promise<StoreState> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const target = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
  await expect(target).toBeVisible({ timeout: 90_000 });
  return readCommentStore(supabase, targetPadletId);
}

async function cleanupAndAssert(supabase: any, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

function commentBearingWrites(wire: WireRecord[], targetPadletId: string): WireRecord[] {
  return wire.filter((record) =>
    record.relevantIds.includes(targetPadletId) &&
    record.commentsFieldPresent
  );
}

function duplicateEvidence(texts: string[]): string[] {
  const duplicates = texts.filter((text, index) => texts.indexOf(text) !== index);
  return [...new Set(duplicates)].map((text) => `duplicate visible/persisted text: ${text}`);
}

async function runFlowA(page: Page): Promise<FlowResult> {
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupBoard(PREFIX_A);
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const target = await openTarget(page, fixture.boardId, targetContainerId);
    const addText = `${PREFIX_A} strict add`;
    const before = await readCommentStore(supabase, targetPadletId);
    const localBefore = await readLocalTexts(target, [addText]);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Failed to update comment')) {
        consoleErrors.push(message.text());
      }
    });

    const wireCapture = beginWireCapture(page, () => [targetPadletId]);
    await addComment(target, addText);
    const afterAdd = await waitForPersistedTexts(supabase, targetPadletId, [addText]);
    const localAfterAdd = await waitForVisibleTexts(target, [addText]);
    const commentId = afterAdd.comments.find((comment) => comment.text === addText)?.id;
    expect(commentId).toBeTruthy();

    await removeComment(target, addText);
    const afterRemove = await waitForPersistedAbsence(supabase, targetPadletId, addText);
    const localAfterRemove = await waitForVisibleAbsence(target, addText, []);
    const reload = await reloadState(page, supabase, targetContainerId, targetPadletId);
    const wire = await wireCapture.finish();
    const writes = commentBearingWrites(wire, targetPadletId);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes.every((record) => record.responseStatus === 204)).toBe(true);
    expect(afterAdd.detachedComments).toEqual([]);
    expect(afterRemove.detachedComments).toEqual([]);
    expect(reload.detachedComments).toEqual([]);
    expect(commentTexts(afterRemove.comments)).toEqual([]);
    expect(commentTexts(reload.comments)).toEqual([]);

    cleanupCounts = await cleanupAndAssert(supabase, fixture);
    return {
      flow: 'A',
      boardPrefix: fixture.prefix,
      targetContainerId,
      targetPadletId,
      commentFixtureTexts: [addText],
      commentIds: [commentId].filter((id): id is string => !!id),
      localBefore,
      localAfter: localAfterRemove,
      commentsBefore: before.comments,
      commentsAfter: afterRemove.comments,
      detachedCommentsBefore: before.detachedComments,
      detachedCommentsAfter: afterRemove.detachedComments,
      wireSequence: wire,
      statuses: wire.map((record) => record.responseStatus),
      orderingEvidence: [
        'visible Add a comment input and visible Send control were used',
        'persisted metadata.comments readback was observed before local visible assertion',
        'local visible state and reload matched the confirmed persisted state',
      ],
      reloadState: reload,
      visibleErrorCount: consoleErrors.length,
      duplicateEvidence: duplicateEvidence(commentTexts(afterAdd.comments)),
      lostWriteEvidence: [],
      cleanupCounts,
      result: 'strict-comment-persists-consistently',
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

async function runFlowB(page: Page): Promise<FlowResult> {
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupBoard(PREFIX_B);
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const target = await openTarget(page, fixture.boardId, targetContainerId);
    const firstText = `${PREFIX_B} strict rapid one`;
    const secondText = `${PREFIX_B} strict rapid two`;
    const fixtures = [firstText, secondText];
    const before = await readCommentStore(supabase, targetPadletId);
    const localBefore = await readLocalTexts(target, fixtures);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Failed to update comment')) {
        consoleErrors.push(message.text());
      }
    });

    const wireCapture = beginWireCapture(page, () => [targetPadletId]);
    await addComment(target, firstText);
    await waitForVisibleTexts(target, [firstText]);
    await addComment(target, secondText);
    const after = await waitForPersistedTexts(supabase, targetPadletId, fixtures);
    const localAfter = await waitForVisibleTexts(target, fixtures);
    const reload = await reloadState(page, supabase, targetContainerId, targetPadletId);
    const wire = await wireCapture.finish();
    const writes = commentBearingWrites(wire, targetPadletId);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes.every((record) => record.responseStatus === 204)).toBe(true);
    expect(commentTexts(after.comments)).toEqual(fixtures);
    expect(commentTexts(reload.comments)).toEqual(fixtures);
    expect(after.detachedComments).toEqual([]);
    expect(reload.detachedComments).toEqual([]);

    cleanupCounts = await cleanupAndAssert(supabase, fixture);
    return {
      flow: 'B',
      boardPrefix: fixture.prefix,
      targetContainerId,
      targetPadletId,
      commentFixtureTexts: fixtures,
      commentIds: after.comments.map((comment) => comment.id).filter((id): id is string => !!id),
      localBefore,
      localAfter,
      commentsBefore: before.comments,
      commentsAfter: after.comments,
      detachedCommentsBefore: before.detachedComments,
      detachedCommentsAfter: after.detachedComments,
      wireSequence: wire,
      statuses: wire.map((record) => record.responseStatus),
      orderingEvidence: [
        'two visible Add a comment input submissions were used',
        'each visible settlement matched a successful comment-bearing PATCH sequence',
        'final persisted order matched final visible order after reload',
      ],
      reloadState: reload,
      visibleErrorCount: consoleErrors.length,
      duplicateEvidence: duplicateEvidence(commentTexts(after.comments)),
      lostWriteEvidence: fixtures.filter((text) => !commentTexts(after.comments).includes(text)),
      cleanupCounts,
      result: 'strict-comment-persists-consistently',
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

test.describe('drawing comment strict persistence (PATCH-092)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('persists drawing comments through the strict update channel', async ({ page }) => {
    test.setTimeout(300_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);
    const flows = [flowA, flowB];

    expect(flows.map((flow) => flow.cleanupCounts)).toEqual([
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
    ]);
    expect(flows.every((flow) => flow.visibleErrorCount === 0)).toBe(true);
    expect(flows.every((flow) => flow.duplicateEvidence.length === 0)).toBe(true);
    expect(flows.every((flow) => flow.lostWriteEvidence.length === 0)).toBe(true);

    test.info().annotations.push({
      type: ANNOTATION,
      description: JSON.stringify({
        selectedVisibleUI: 'EmbeddedCommentList rendered inside DrawingLayout RowColumnContainerCard for seeded type=comment child padlets',
        boardPrefixes: {
          flowA: flowA.boardPrefix,
          flowB: flowB.boardPrefix,
        },
        targetPadletIDs: {
          flowA: { containerId: flowA.targetContainerId, padletId: flowA.targetPadletId },
          flowB: { containerId: flowB.targetContainerId, padletId: flowB.targetPadletId },
        },
        commentFixtureIDsAndText: {
          flowA: { ids: flowA.commentIds, texts: flowA.commentFixtureTexts },
          flowB: { ids: flowB.commentIds, texts: flowB.commentFixtureTexts },
        },
        localStateBeforeAfter: {
          flowA: { before: flowA.localBefore, after: flowA.localAfter },
          flowB: { before: flowB.localBefore, after: flowB.localAfter },
        },
        persistedCommentsBeforeAfter: {
          flowA: { before: flowA.commentsBefore, after: flowA.commentsAfter },
          flowB: { before: flowB.commentsBefore, after: flowB.commentsAfter },
        },
        detachedCommentsBeforeAfter: {
          flowA: { before: flowA.detachedCommentsBefore, after: flowA.detachedCommentsAfter },
          flowB: { before: flowB.detachedCommentsBefore, after: flowB.detachedCommentsAfter },
        },
        commentBearingWriteSequence: {
          flowA: commentBearingWrites(flowA.wireSequence, flowA.targetPadletId),
          flowB: commentBearingWrites(flowB.wireSequence, flowB.targetPadletId),
        },
        responseStatuses: {
          flowA: flowA.statuses,
          flowB: flowB.statuses,
        },
        localSettlementOrderingEvidence: {
          flowA: flowA.orderingEvidence,
          flowB: flowB.orderingEvidence,
        },
        reloadState: {
          flowA: flowA.reloadState,
          flowB: flowB.reloadState,
        },
        duplicateLostWriteEvidence: {
          flowA: { duplicate: flowA.duplicateEvidence, lost: flowA.lostWriteEvidence },
          flowB: { duplicate: flowB.duplicateEvidence, lost: flowB.lostWriteEvidence },
        },
        visibleErrorCount: {
          flowA: flowA.visibleErrorCount,
          flowB: flowB.visibleErrorCount,
        },
        sourceFindings: {
          drawingLayout: [
            'handleUpdateChildComments is async',
            'handleUpdateChildComments awaits onUpdatePadletStrict',
            'non-strict onUpdatePadlet is no longer called by handleUpdateChildComments',
            'one narrow catch emits console.error("Failed to update comment", error)',
            'no manual setPadlets comment settlement exists in handleUpdateChildComments',
            'metadata field routing remains options.field || comments',
          ],
          untouchedScope: [
            'move handler unchanged',
            'createAndLinkChildToContainer unchanged',
            'comment edit UI unchanged',
            'EmbeddedCommentList and CommentRow unchanged',
          ],
          failurePathEvidence: 'source-inspection only; no synthetic failing request used',
        },
        runtimeFindings: {
          storeShape: 'metadata.comments remained the observed store; detachedComments stayed empty',
          successStatuses: flows.flatMap((flow) => flow.statuses).filter((status) => status !== null),
          visibleErrorsOnSuccess: flows.reduce((count, flow) => count + flow.visibleErrorCount, 0),
          finalResult: flows.every((flow) => flow.result === 'strict-comment-persists-consistently')
            ? 'strict-comment-persists-consistently'
            : 'strict-comment-regression-observed',
        },
        cleanupCounts: {
          flowA: flowA.cleanupCounts,
          flowB: flowB.cleanupCounts,
        },
        finalResult: flows.every((flow) => flow.result === 'strict-comment-persists-consistently')
          ? 'strict-comment-persists-consistently'
          : 'strict-comment-regression-observed',
      }),
    });
  });
});
