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

const ANNOTATION = 'patch-091-drawing-comment-persistence-evidence' as const;
const PREFIX_A = 'patch-064-harness-patch-091-comment-a-' as const;
const PREFIX_B = 'patch-064-harness-patch-091-comment-b-' as const;
const PREFIX_C = 'patch-064-harness-patch-091-comment-c-' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;

registerDrawingCleanup(test);

type Classification =
  | 'comment-persists-consistently'
  | 'comment-write-lost-or-overwritten'
  | 'comment-divergence-observed'
  | 'action-not-drivable'
  | 'mixed-comment-state';

type CommentShape = {
  id: string | null;
  text: string | null;
  hasUserId: boolean;
  hasUserName: boolean;
  hasTimestamp: boolean;
  hasCurrentUserId: boolean;
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

type ActionResult = {
  action: 'ADD' | 'EDIT' | 'REMOVE' | 'RAPID_SEQUENCE';
  actionDrivability: 'drivable' | 'action-not-drivable';
  actionEvidence: string;
  targetPadletId: string;
  commentFixtureValues: string[];
  commentIds: string[];
  localStateBefore: string[];
  localStateAfter: string[];
  commentsFieldBefore: CommentShape[];
  commentsFieldAfter: CommentShape[];
  detachedCommentsFieldBefore: CommentShape[];
  detachedCommentsFieldAfter: CommentShape[];
  persistedReadback: StoreState;
  reloadState: StoreState;
  writeFieldPresence: {
    comments: boolean;
    detachedComments: boolean;
  };
  wireSequence: WireRecord[];
  statuses: (number | null)[];
  lostWriteEvidence: string[];
  divergenceEvidence: string[];
  classification: Classification;
};

type FlowResult = {
  flow: 'A' | 'B' | 'C';
  boardPrefix: string;
  targetContainerId: string;
  targetPadletId: string;
  cleanupCounts: CleanupCounts;
  actions: ActionResult[];
  classification: Classification;
};

type PadletRow = {
  id: string;
  title: string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

function prefixLabel(prefix: typeof PREFIX_A | typeof PREFIX_B | typeof PREFIX_C): string {
  return prefix.replace(/^patch-064-harness-/, '').replace(/-$/, '');
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function summarizeComments(value: unknown, currentUserId?: string): CommentShape[] {
  if (!Array.isArray(value)) return [];
  return value.map((comment) => {
    const row = (comment ?? {}) as Record<string, unknown>;
    const userId = typeof row.userId === 'string' ? row.userId : null;
    return {
      id: typeof row.id === 'string' ? row.id : null,
      text: normalizeText(row.text),
      hasUserId: userId !== null,
      hasUserName: typeof row.userName === 'string',
      hasTimestamp: typeof row.timestamp === 'number',
      hasCurrentUserId: !!currentUserId && userId === currentUserId,
    };
  });
}

function commentTexts(comments: CommentShape[]): string[] {
  return comments.map((comment) => comment.text).filter((text): text is string => !!text);
}

async function readCommentStore(supabase: any, padletId: string, currentUserId?: string): Promise<StoreState> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,type,metadata')
    .eq('id', padletId)
    .single();
  if (error) throw error;
  const row = data as PadletRow;
  return {
    comments: summarizeComments(row.metadata?.comments, currentUserId),
    detachedComments: summarizeComments(row.metadata?.detachedComments, currentUserId),
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

function classifyAction(local: string[], persisted: StoreState, reload: StoreState, fixtureTexts: string[]): Classification {
  const persistedTexts = commentTexts(persisted.comments);
  const reloadTexts = commentTexts(reload.comments);
  const detachedTexts = commentTexts(persisted.detachedComments).concat(commentTexts(reload.detachedComments));
  const expectedVisible = fixtureTexts.filter((text) => local.includes(text));

  if (detachedTexts.some((text) => fixtureTexts.includes(text))) {
    return 'comment-divergence-observed';
  }
  if (expectedVisible.some((text) => !persistedTexts.includes(text) || !reloadTexts.includes(text))) {
    return 'comment-write-lost-or-overwritten';
  }
  if (
    fixtureTexts.length > 0 &&
    expectedVisible.length === 0 &&
    fixtureTexts.every((text) => !persistedTexts.includes(text) && !reloadTexts.includes(text))
  ) {
    return 'comment-persists-consistently';
  }
  if (
    expectedVisible.length > 0 &&
    expectedVisible.every((text) => persistedTexts.includes(text) && reloadTexts.includes(text))
  ) {
    return 'comment-persists-consistently';
  }
  return 'action-not-drivable';
}

function combineClassifications(classifications: Classification[]): Classification {
  const unique = [...new Set(classifications)];
  if (unique.length === 1) return unique[0];
  if (unique.includes('comment-write-lost-or-overwritten')) return 'mixed-comment-state';
  if (unique.includes('comment-divergence-observed')) return 'mixed-comment-state';
  if (unique.includes('action-not-drivable')) return 'mixed-comment-state';
  return 'mixed-comment-state';
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
  comments: CommentShape[],
): Promise<string> {
  const commentPadletId = crypto.randomUUID();
  const seededComments = comments.map((comment, index) => ({
    id: comment.id ?? `comment-seeded-${index}-${Date.now()}`,
    text: comment.text ?? `${fixture.prefix} seeded comment ${index + 1}`,
    userId: 'anonymous',
    userName: 'Anonymous',
    timestamp: Date.now() - 60_000 + index,
  }));
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
      comments: seededComments,
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

async function setupBoard(
  prefix: typeof PREFIX_A | typeof PREFIX_B | typeof PREFIX_C,
  seedComments: CommentShape[],
) {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(prefix));
  const seeded = await seedDrawingContainers(supabase, fixture);
  await seedLineScene(supabase, fixture);
  const targetContainerId = seeded.containers[0].id;
  const targetPadletId = await seedCommentPost(supabase, fixture, targetContainerId, seedComments);
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
  await expect(target.getByText(text, { exact: false })).toBeVisible({ timeout: 30_000 });
}

async function editFirstComment(target: Locator, previousText: string, nextText: string): Promise<boolean> {
  await target.getByText(previousText, { exact: false }).click();
  await target.getByTitle('Edit').first().click();
  const editor = target.locator('.ProseMirror[contenteditable="true"]').first();
  try {
    await expect(editor).toBeVisible({ timeout: 3_000 });
  } catch {
    return false;
  }
  await editor.fill(nextText);
  await editor.press('Enter');
  await expect(target.getByText(nextText, { exact: false })).toBeVisible({ timeout: 30_000 });
  return true;
}

async function isEditEnabledForComment(target: Locator, text: string): Promise<boolean> {
  await target.getByText(text, { exact: false }).click();
  const editButton = target.getByTitle('Edit').first();
  await expect(editButton).toBeVisible({ timeout: 10_000 });
  return editButton.isEnabled();
}

async function removeFirstComment(target: Locator, text: string): Promise<void> {
  await target.getByText(text, { exact: false }).click();
  await target.getByTitle('Delete').first().click();
  await expect(target.getByText(text, { exact: false })).toHaveCount(0, { timeout: 30_000 });
}

async function waitForPersistedTexts(
  supabase: any,
  padletId: string,
  expectedTexts: string[],
  currentUserId?: string,
): Promise<StoreState> {
  await expect
    .poll(async () => {
      const state = await readCommentStore(supabase, padletId, currentUserId);
      const texts = commentTexts(state.comments);
      return expectedTexts.every((text) => texts.includes(text));
    }, { timeout: 30_000 })
    .toBe(true);
  return readCommentStore(supabase, padletId, currentUserId);
}

async function waitForPersistedAbsence(
  supabase: any,
  padletId: string,
  absentText: string,
  currentUserId?: string,
): Promise<StoreState> {
  await expect
    .poll(async () => {
      const state = await readCommentStore(supabase, padletId, currentUserId);
      return !commentTexts(state.comments).includes(absentText);
    }, { timeout: 30_000 })
    .toBe(true);
  return readCommentStore(supabase, padletId, currentUserId);
}

async function reloadState(
  page: Page,
  supabase: any,
  fixture: DrawingFixture,
  targetContainerId: string,
  targetPadletId: string,
  currentUserId?: string,
): Promise<StoreState> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const target = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
  await expect(target).toBeVisible({ timeout: 90_000 });
  return readCommentStore(supabase, targetPadletId, currentUserId);
}

function actionResult(input: {
  action: ActionResult['action'];
  targetPadletId: string;
  fixtureTexts: string[];
  commentIds: string[];
  before: StoreState;
  after: StoreState;
  reload: StoreState;
  localBefore: string[];
  localAfter: string[];
  wire: WireRecord[];
  evidence: string;
}): ActionResult {
  const classification = classifyAction(input.localAfter, input.after, input.reload, input.fixtureTexts);
  return {
    action: input.action,
    actionDrivability: 'drivable',
    actionEvidence: input.evidence,
    targetPadletId: input.targetPadletId,
    commentFixtureValues: input.fixtureTexts,
    commentIds: input.commentIds,
    localStateBefore: input.localBefore,
    localStateAfter: input.localAfter,
    commentsFieldBefore: input.before.comments,
    commentsFieldAfter: input.after.comments,
    detachedCommentsFieldBefore: input.before.detachedComments,
    detachedCommentsFieldAfter: input.after.detachedComments,
    persistedReadback: input.after,
    reloadState: input.reload,
    writeFieldPresence: {
      comments: input.wire.some((record) => record.commentsFieldPresent),
      detachedComments: input.wire.some((record) => record.detachedCommentsFieldPresent),
    },
    wireSequence: input.wire,
    statuses: input.wire.map((record) => record.responseStatus),
    lostWriteEvidence: classification === 'comment-write-lost-or-overwritten'
      ? ['visible comment text missing from settled persistence or reload']
      : [],
    divergenceEvidence: classification === 'comment-divergence-observed'
      ? ['comments and detachedComments contain test-owned fixture text']
      : [],
    classification,
  };
}

function actionNotDrivableResult(input: {
  action: ActionResult['action'];
  targetPadletId: string;
  fixtureTexts: string[];
  before: StoreState;
  localBefore: string[];
  wire: WireRecord[];
  evidence: string;
}): ActionResult {
  expect(input.wire.filter((record) =>
    record.relevantIds.includes(input.targetPadletId) &&
    (record.commentsFieldPresent || record.detachedCommentsFieldPresent)
  )).toHaveLength(0);
  return {
    action: input.action,
    actionDrivability: 'action-not-drivable',
    actionEvidence: input.evidence,
    targetPadletId: input.targetPadletId,
    commentFixtureValues: input.fixtureTexts,
    commentIds: input.before.comments.map((comment) => comment.id).filter((id): id is string => !!id),
    localStateBefore: input.localBefore,
    localStateAfter: input.localBefore,
    commentsFieldBefore: input.before.comments,
    commentsFieldAfter: input.before.comments,
    detachedCommentsFieldBefore: input.before.detachedComments,
    detachedCommentsFieldAfter: input.before.detachedComments,
    persistedReadback: input.before,
    reloadState: input.before,
    writeFieldPresence: {
      comments: input.wire.some((record) => record.commentsFieldPresent),
      detachedComments: input.wire.some((record) => record.detachedCommentsFieldPresent),
    },
    wireSequence: input.wire,
    statuses: input.wire.map((record) => record.responseStatus),
    lostWriteEvidence: [],
    divergenceEvidence: [],
    classification: 'action-not-drivable',
  };
}

async function cleanupAndAssert(supabase: any, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

async function runFlowA(page: Page): Promise<FlowResult> {
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupBoard(PREFIX_A, []);
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const target = await openTarget(page, fixture.boardId, targetContainerId);
    const addText = `${PREFIX_A} add comment`;
    const before = await readCommentStore(supabase, targetPadletId);
    const localBefore = await readLocalTexts(target, [addText]);
    const wireCapture = beginWireCapture(page, () => [targetPadletId]);
    await addComment(target, addText);
    const after = await waitForPersistedTexts(supabase, targetPadletId, [addText]);
    const localAfter = await readLocalTexts(target, [addText]);
    const reload = await reloadState(page, supabase, fixture, targetContainerId, targetPadletId);
    const wire = await wireCapture.finish();
    const action = actionResult({
      action: 'ADD',
      targetPadletId,
      fixtureTexts: [addText],
      commentIds: after.comments.map((comment) => comment.id).filter((id): id is string => !!id),
      before,
      after,
      reload,
      localBefore,
      localAfter,
      wire,
      evidence: 'visible EmbeddedCommentList input accepted deterministic text and visible Send button submitted it',
    });
    cleanupCounts = await cleanupAndAssert(supabase, fixture);
    return {
      flow: 'A',
      boardPrefix: fixture.prefix,
      targetContainerId,
      targetPadletId,
      cleanupCounts,
      actions: [action],
      classification: action.classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

async function runFlowB(page: Page): Promise<FlowResult> {
  const setupText = `${PREFIX_B} self-owned edit target`;
  const editedText = `${PREFIX_B} edited comment`;
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupBoard(PREFIX_B, []);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const currentUserId = userData.user?.id;
  expect(currentUserId).toBeTruthy();
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    let target = await openTarget(page, fixture.boardId, targetContainerId);
    const beforeSetupAdd = await readCommentStore(supabase, targetPadletId, currentUserId);
    const localBeforeSetupAdd = await readLocalTexts(target, [setupText, editedText]);
    const setupWireCapture = beginWireCapture(page, () => [targetPadletId]);
    await addComment(target, setupText);
    const afterSetupAdd = await waitForPersistedTexts(supabase, targetPadletId, [setupText], currentUserId);
    const setupComment = afterSetupAdd.comments.find((comment) => comment.text === setupText);
    expect(setupComment?.id).toBeTruthy();
    expect(setupComment?.hasCurrentUserId).toBe(true);
    const localAfterSetupAdd = await readLocalTexts(target, [setupText, editedText]);
    const setupWire = await setupWireCapture.finish();
    const setupAddAction = actionResult({
      action: 'ADD',
      targetPadletId,
      fixtureTexts: [setupText],
      commentIds: afterSetupAdd.comments.map((comment) => comment.id).filter((id): id is string => !!id),
      before: beforeSetupAdd,
      after: afterSetupAdd,
      reload: afterSetupAdd,
      localBefore: localBeforeSetupAdd,
      localAfter: localAfterSetupAdd,
      wire: setupWire,
      evidence: 'visible ADD created the Flow B edit target with persisted current-user ownership evidence',
    });

    const beforeEdit = await readCommentStore(supabase, targetPadletId, currentUserId);
    const localBeforeEdit = await readLocalTexts(target, [setupText, editedText]);
    const editEnabled = await isEditEnabledForComment(target, setupText);
    const editWireCapture = beginWireCapture(page, () => [targetPadletId]);
    const editDriven = editEnabled && await editFirstComment(target, setupText, editedText);
    const editWire = await editWireCapture.finish();
    const editAction = editDriven
      ? actionResult({
          action: 'EDIT',
          targetPadletId,
          fixtureTexts: [editedText],
          commentIds: (await readCommentStore(supabase, targetPadletId, currentUserId)).comments
            .map((comment) => comment.id)
            .filter((id): id is string => !!id),
          before: beforeEdit,
          after: await waitForPersistedTexts(supabase, targetPadletId, [editedText], currentUserId),
          reload: await reloadState(page, supabase, fixture, targetContainerId, targetPadletId, currentUserId),
          localBefore: localBeforeEdit,
          localAfter: await readLocalTexts(page.locator(`[data-padlet-id="${targetContainerId}"]`).first(), [setupText, editedText]),
          wire: editWire,
          evidence: `visible Edit button was enabled=${editEnabled}; TipTap editor opened and Enter saved deterministic edited text`,
        })
      : actionNotDrivableResult({
          action: 'EDIT',
          targetPadletId,
          fixtureTexts: [setupText, editedText],
          before: beforeEdit,
          localBefore: localBeforeEdit,
          wire: editWire,
          evidence: `visible Edit button enabled=${editEnabled} but did not expose an editable TipTap field; treating edit as action-not-drivable without hidden-handler invocation`,
        });

    target = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
    const beforeRemove = await readCommentStore(supabase, targetPadletId, currentUserId);
    const removeText = editDriven ? editedText : setupText;
    const localBeforeRemove = await readLocalTexts(target, [removeText]);
    const removeWireCapture = beginWireCapture(page, () => [targetPadletId]);
    await removeFirstComment(target, removeText);
    const afterRemove = await waitForPersistedAbsence(supabase, targetPadletId, removeText, currentUserId);
    const localAfterRemove = await readLocalTexts(target, [removeText]);
    const reloadRemove = await reloadState(page, supabase, fixture, targetContainerId, targetPadletId, currentUserId);
    const removeWire = await removeWireCapture.finish();
    const removeAction = actionResult({
      action: 'REMOVE',
      targetPadletId,
      fixtureTexts: [removeText],
      commentIds: beforeRemove.comments.map((comment) => comment.id).filter((id): id is string => !!id),
      before: beforeRemove,
      after: afterRemove,
      reload: reloadRemove,
      localBefore: localBeforeRemove,
      localAfter: localAfterRemove,
      wire: removeWire,
      evidence: 'visible comment row Delete button removed the intended self-owned comment from the rendered list',
    });

    cleanupCounts = await cleanupAndAssert(supabase, fixture);
    return {
      flow: 'B',
      boardPrefix: fixture.prefix,
      targetContainerId,
      targetPadletId,
      cleanupCounts,
      actions: [setupAddAction, editAction, removeAction],
      classification: combineClassifications([setupAddAction.classification, editAction.classification, removeAction.classification]),
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

async function runFlowC(page: Page): Promise<FlowResult> {
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupBoard(PREFIX_C, []);
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const target = await openTarget(page, fixture.boardId, targetContainerId);
    const firstText = `${PREFIX_C} rapid one`;
    const secondText = `${PREFIX_C} rapid two`;
    const before = await readCommentStore(supabase, targetPadletId);
    const localBefore = await readLocalTexts(target, [firstText, secondText]);
    const wireCapture = beginWireCapture(page, () => [targetPadletId]);
    const startedAt = Date.now();
    await addComment(target, firstText);
    await addComment(target, secondText);
    expect(Date.now() - startedAt).toBeLessThanOrEqual(300_000);
    const after = await waitForPersistedTexts(supabase, targetPadletId, [firstText, secondText]);
    const localAfter = await readLocalTexts(target, [firstText, secondText]);
    const reload = await reloadState(page, supabase, fixture, targetContainerId, targetPadletId);
    const wire = await wireCapture.finish();
    const action = actionResult({
      action: 'RAPID_SEQUENCE',
      targetPadletId,
      fixtureTexts: [firstText, secondText],
      commentIds: after.comments.map((comment) => comment.id).filter((id): id is string => !!id),
      before,
      after,
      reload,
      localBefore,
      localAfter,
      wire,
      evidence: 'two visible EmbeddedCommentList add actions were submitted sequentially without a product-action retry',
    });
    cleanupCounts = await cleanupAndAssert(supabase, fixture);
    return {
      flow: 'C',
      boardPrefix: fixture.prefix,
      targetContainerId,
      targetPadletId,
      cleanupCounts,
      actions: [action],
      classification: action.classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

test.describe('drawing comment persistence diagnosis (PATCH-091)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes drawing comment persistence through real UI', async ({ page }) => {
    test.setTimeout(420_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);
    const flowC = await runFlowC(page);
    const flows = [flowA, flowB, flowC];
    const finalClassification = combineClassifications(flows.map((flow) => flow.classification));

    expect(new Set(flows.map((flow) => flow.boardPrefix)).size).toBe(3);
    expect(flows.map((flow) => flow.cleanupCounts)).toEqual([
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
      { boards: 0, padlets: 0, canvasLines: 0 },
    ]);
    expect([
      'comment-persists-consistently',
      'comment-write-lost-or-overwritten',
      'comment-divergence-observed',
      'action-not-drivable',
      'mixed-comment-state',
    ]).toContain(finalClassification);

    const allActions = flows.flatMap((flow) => flow.actions);
    const labeledActions = [
      { key: 'flowAAdd', action: flowA.actions[0] },
      { key: 'flowBSetupAdd', action: flowB.actions[0] },
      { key: 'flowBEdit', action: flowB.actions[1] },
      { key: 'flowBRemove', action: flowB.actions[2] },
      { key: 'flowCRapidSequence', action: flowC.actions[0] },
    ];
    test.info().annotations.push({
      type: ANNOTATION,
      description: JSON.stringify({
        selectedCommentUI: 'EmbeddedCommentList rendered inside DrawingLayout RowColumnContainerCard for a seeded type=comment child padlet',
        actionDrivabilityPerFlow: {
          flowAAdd: flowA.actions[0].actionDrivability,
          flowBSetupAdd: flowB.actions[0].actionDrivability,
          flowBEdit: flowB.actions[1].actionDrivability,
          flowBRemove: flowB.actions[2].actionDrivability,
          flowCRapidSequence: flowC.actions[0].actionDrivability,
        },
        boardPrefixes: {
          flowA: flowA.boardPrefix,
          flowB: flowB.boardPrefix,
          flowC: flowC.boardPrefix,
        },
        targetPadletContainerIDs: {
          flowA: { containerId: flowA.targetContainerId, padletId: flowA.targetPadletId },
          flowB: { containerId: flowB.targetContainerId, padletId: flowB.targetPadletId },
          flowC: { containerId: flowC.targetContainerId, padletId: flowC.targetPadletId },
        },
        commentIDs: {
          flowA: flowA.actions[0].commentIds,
          flowBSetupAdd: flowB.actions[0].commentIds,
          flowBEdit: flowB.actions[1].commentIds,
          flowBRemove: flowB.actions[2].commentIds,
          flowC: flowC.actions[0].commentIds,
        },
        commentFixtureValues: {
          flowA: flowA.actions[0].commentFixtureValues,
          flowBSetupAdd: flowB.actions[0].commentFixtureValues,
          flowBEdit: flowB.actions[1].commentFixtureValues,
          flowBRemove: flowB.actions[2].commentFixtureValues,
          flowC: flowC.actions[0].commentFixtureValues,
        },
        actionEvidence: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.actionEvidence])),
        localStateBeforeAfter: Object.fromEntries(labeledActions.map(({ key, action }) => [
          key,
          { action: action.action, before: action.localStateBefore, after: action.localStateAfter },
        ])),
        commentsFieldBeforeAfter: Object.fromEntries(labeledActions.map(({ key, action }) => [
          key,
          { action: action.action, before: action.commentsFieldBefore, after: action.commentsFieldAfter },
        ])),
        detachedCommentsFieldBeforeAfter: Object.fromEntries(labeledActions.map(({ key, action }) => [
          key,
          { action: action.action, before: action.detachedCommentsFieldBefore, after: action.detachedCommentsFieldAfter },
        ])),
        writeFieldPresence: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.writeFieldPresence])),
        wireSequence: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.wireSequence])),
        statuses: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.statuses])),
        persistedReadback: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.persistedReadback])),
        reloadState: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.reloadState])),
        lostWriteEvidence: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.lostWriteEvidence])),
        divergenceEvidence: Object.fromEntries(labeledActions.map(({ key, action }) => [key, action.divergenceEvidence])),
        sourceFindings: {
          drawingLayout: [
            'Embedded comment post rendering reads metadata.comments',
            'add/edit/remove/toggle pass field=comments to onUpdateChildComments',
            'handleUpdateChildComments calls non-strict onUpdatePadlet',
            'handleUpdateChildComments does not await the update',
            'handleUpdateChildComments has no local catch or visible error path',
          ],
          contrastLayouts: [
            'CanvasClient non-drawing child comment handlers check result.ok and toast on failure',
            'freeform detached comment paths await updatePadletMetadata',
          ],
          canvasCommentsScope: 'not queried or mutated',
        },
        runtimeFindings: {
          storeShape: 'Drawing embedded type=comment post uses metadata.comments; detachedComments stayed empty for the driven comment-post UI',
          commentIDsStable: allActions.every((action) => action.commentIds.every((id) => id.startsWith('comment-') || id.startsWith('comment-seeded'))),
          updateShape: 'full metadata comments array replacement in each observed PATCH',
          authorAndTimestampFieldsPresent: allActions.every((action) => action.commentsFieldAfter.every((comment) => comment.hasUserId && comment.hasUserName && comment.hasTimestamp)),
        },
        cleanupCounts: {
          flowA: flowA.cleanupCounts,
          flowB: flowB.cleanupCounts,
          flowC: flowC.cleanupCounts,
        },
        finalClassification,
      }),
    });
  });
});
