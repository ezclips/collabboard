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

const ANNOTATION = 'patch-094-drawing-comment-edit-save-evidence' as const;
const PREFIX_A = 'patch-064-harness-patch-094-comment-edit-save-a-' as const;
const PREFIX_B = 'patch-064-harness-patch-094-comment-edit-save-b-' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;

registerDrawingCleanup(test);

type Classification =
  | 'edit-save-consistent'
  | 'edit-save-lost-write'
  | 'edit-save-duplicate-write'
  | 'edit-save-local-persisted-divergence'
  | 'edit-cancel-consistent'
  | 'edit-cancel-writes-unexpectedly'
  | 'edit-save-action-not-drivable'
  | 'mixed-edit-save-state';

type CommentShape = {
  id: string | null;
  text: string | null;
  hasUserId: boolean;
  userIdStable: boolean | null;
  hasUserName: boolean;
  userNameStable: boolean | null;
  hasTimestamp: boolean;
  timestampStable: boolean | null;
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
  includesOriginalText: boolean;
  includesEditedText: boolean;
  responseStatus: number | null;
  responseIs2xx: boolean;
};

type EditSetup = {
  supabase: any;
  fixture: DrawingFixture;
  targetContainerId: string;
  targetPadletId: string;
  currentUserId: string;
  target: Locator;
  row: Locator;
  originalText: string;
  comment: CommentShape;
};

type EditorObservation = {
  mounted: boolean;
  location: 'inside-comment-row' | 'elsewhere-in-card' | 'elsewhere-on-page' | 'not-observed';
  editorText: string | null;
  checkpoints: {
    label: string;
    elapsedMs: number;
    rowEditorCount: number;
    cardEditorCount: number;
    pageEditorCount: number;
    rowEditableCount: number;
  }[];
};

type FlowAResult = {
  flow: 'A';
  boardPrefix: string;
  targetPadletId: string;
  targetContainerId: string;
  originalText: string;
  editedText: string;
  commentId: string;
  selfOwned: boolean;
  editEnabled: boolean;
  editor: EditorObservation;
  displayedBefore: string[];
  displayedAfter: string[];
  editModeExitEvidence: string;
  wireSequence: WireRecord[];
  commentBearingWrites: WireRecord[];
  responseStatuses: (number | null)[];
  persistedBefore: StoreState;
  persistedAfter: StoreState;
  reloadState: StoreState;
  stableId: boolean;
  stableAuthor: boolean;
  stableTimestamp: boolean;
  detachedUnchanged: boolean;
  duplicateWriteEvidence: string[];
  lostWriteEvidence: string[];
  divergenceEvidence: string[];
  cleanupCounts: CleanupCounts;
  classification: Classification;
};

type FlowBResult = {
  flow: 'B';
  boardPrefix: string;
  targetPadletId: string;
  targetContainerId: string;
  originalText: string;
  cancelledText: string;
  commentId: string;
  selfOwned: boolean;
  editEnabled: boolean;
  editor: EditorObservation;
  displayedAfterEscape: string[];
  wireSequence: WireRecord[];
  commentBearingWrites: WireRecord[];
  responseStatuses: (number | null)[];
  persistedBefore: StoreState;
  persistedAfter: StoreState;
  reloadState: StoreState;
  stableId: boolean;
  detachedUnchanged: boolean;
  duplicateEvidence: string[];
  divergenceEvidence: string[];
  cleanupCounts: CleanupCounts;
  classification: Classification;
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

function summarizeComments(value: unknown, currentUserId?: string, baseline?: CommentShape): CommentShape[] {
  if (!Array.isArray(value)) return [];
  return value.map((comment) => {
    const row = (comment ?? {}) as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : null;
    const userId = typeof row.userId === 'string' ? row.userId : null;
    const userName = typeof row.userName === 'string' ? row.userName : null;
    const timestamp = typeof row.timestamp === 'number' ? row.timestamp : null;
    const isBaseline = !!baseline && id === baseline.id;
    return {
      id,
      text: normalizeText(row.text),
      hasUserId: userId !== null,
      userIdStable: isBaseline ? userId !== null && userId === currentUserId && baseline.hasCurrentUserId : null,
      hasUserName: userName !== null,
      userNameStable: isBaseline ? userName !== null && baseline.hasUserName : null,
      hasTimestamp: timestamp !== null,
      timestampStable: isBaseline ? timestamp !== null && baseline.hasTimestamp : null,
      hasCurrentUserId: !!currentUserId && userId === currentUserId,
    };
  });
}

function commentTexts(comments: CommentShape[]): string[] {
  return comments.map((comment) => comment.text).filter((text): text is string => !!text);
}

async function readCommentStore(
  supabase: any,
  padletId: string,
  currentUserId?: string,
  baseline?: CommentShape,
): Promise<StoreState> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,type,metadata')
    .eq('id', padletId)
    .single();
  if (error) throw error;
  const row = data as PadletRow;
  return {
    comments: summarizeComments(row.metadata?.comments, currentUserId, baseline),
    detachedComments: summarizeComments(row.metadata?.detachedComments, currentUserId, baseline),
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

async function visibleTexts(target: Locator, texts: string[]): Promise<string[]> {
  const visible: string[] = [];
  for (const text of texts) {
    if (await target.getByText(text, { exact: false }).isVisible().catch(() => false)) {
      visible.push(text);
    }
  }
  return visible;
}

async function addComment(target: Locator, text: string): Promise<void> {
  await target.getByPlaceholder('Add a comment...').fill(text);
  await target.getByTitle('Send').click();
  await expect(target.getByText(text, { exact: false })).toBeVisible({ timeout: 30_000 });
}

async function waitForPersistedTexts(
  supabase: any,
  padletId: string,
  expectedTexts: string[],
  currentUserId?: string,
  baseline?: CommentShape,
): Promise<StoreState> {
  await expect
    .poll(async () => {
      const state = await readCommentStore(supabase, padletId, currentUserId, baseline);
      const texts = commentTexts(state.comments);
      return expectedTexts.every((text) => texts.includes(text));
    }, { timeout: 30_000 })
    .toBe(true);
  return readCommentStore(supabase, padletId, currentUserId, baseline);
}

async function reloadAndRead(
  page: Page,
  supabase: any,
  targetContainerId: string,
  targetPadletId: string,
  currentUserId?: string,
  baseline?: CommentShape,
): Promise<StoreState> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const target = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
  await expect(target).toBeVisible({ timeout: 90_000 });
  return readCommentStore(supabase, targetPadletId, currentUserId, baseline);
}

function isPadletsEndpoint(urlText: string): boolean {
  try {
    return new URL(urlText).pathname.includes(PADLETS_ENDPOINT_PATH);
  } catch {
    return false;
  }
}

function bodySummary(rawBody: string | null, originalText: string, editedText: string) {
  const empty = {
    commentsFieldPresent: false,
    detachedCommentsFieldPresent: false,
    boundedCommentIds: [] as string[],
    boundedCommentCount: null as number | null,
    includesOriginalText: false,
    includesEditedText: false,
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
      includesOriginalText: serialized.includes(originalText),
      includesEditedText: serialized.includes(editedText),
    };
  } catch {
    return {
      ...empty,
      commentsFieldPresent: rawBody.includes('comments'),
      detachedCommentsFieldPresent: rawBody.includes('detachedComments'),
      includesOriginalText: rawBody.includes(originalText),
      includesEditedText: rawBody.includes(editedText),
    };
  }
}

function beginWireCapture(page: Page, relevantIds: () => string[], originalText: string, editedText: string) {
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
          const summary = bodySummary(record.rawBody, originalText, editedText);
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

function commentBearingWrites(wire: WireRecord[], targetPadletId: string): WireRecord[] {
  return wire.filter((record) =>
    record.relevantIds.includes(targetPadletId) &&
    (record.commentsFieldPresent || record.detachedCommentsFieldPresent)
  );
}

async function setupSelfOwnedComment(
  page: Page,
  prefix: typeof PREFIX_A | typeof PREFIX_B,
  text: string,
): Promise<EditSetup> {
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupBoard(prefix);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const currentUserId = userData.user?.id;
  expect(currentUserId).toBeTruthy();
  const target = await openTarget(page, fixture.boardId, targetContainerId);
  await addComment(target, text);
  const persisted = await waitForPersistedTexts(supabase, targetPadletId, [text], currentUserId);
  const comment = persisted.comments.find((entry) => entry.text === text);
  expect(comment?.id).toBeTruthy();
  expect(comment?.hasCurrentUserId).toBe(true);
  const row = target.locator('.group\\/row').first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return {
    supabase,
    fixture,
    targetContainerId,
    targetPadletId,
    currentUserId,
    target,
    row,
    originalText: text,
    comment: comment!,
  };
}

async function openEditor(page: Page, target: Locator, row: Locator, originalText: string): Promise<{
  editEnabled: boolean;
  editor: Locator;
  observation: EditorObservation;
}> {
  await row.click();
  const editButton = row.getByTitle('Edit').first();
  await expect(editButton).toBeVisible({ timeout: 10_000 });
  const editEnabled = await editButton.isEnabled();
  await editButton.click();

  const startedAt = Date.now();
  const checkpoints: EditorObservation['checkpoints'] = [];
  const editor = row.locator('.ProseMirror[contenteditable="true"]').first();
  for (const interval of [50, 60, 250, 1_000, 3_000]) {
    const remaining = Math.max(0, interval - (Date.now() - startedAt));
    if (remaining > 0) await page.waitForTimeout(remaining);
    checkpoints.push({
      label: `${interval}ms`,
      elapsedMs: Date.now() - startedAt,
      rowEditorCount: await row.locator('.ProseMirror').count(),
      cardEditorCount: await target.locator('.ProseMirror').count(),
      pageEditorCount: await page.locator('.ProseMirror').count(),
      rowEditableCount: await row.locator('[contenteditable="true"]').count(),
    });
    if (await editor.isVisible().catch(() => false)) break;
  }
  await expect(editor).toBeVisible({ timeout: 5_000 });
  const editorText = normalizeText(await editor.textContent());
  expect(editorText).toContain(originalText);
  return {
    editEnabled,
    editor,
    observation: {
      mounted: true,
      location: 'inside-comment-row',
      editorText,
      checkpoints,
    },
  };
}

async function replaceEditorText(editor: Locator, nextText: string): Promise<void> {
  await editor.click();
  await editor.fill(nextText);
  await expect(editor).toContainText(nextText, { timeout: 10_000 });
}

async function cleanupAndAssert(supabase: any, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

function locateComment(state: StoreState, commentId: string): CommentShape | undefined {
  return state.comments.find((comment) => comment.id === commentId);
}

function stableAuthor(before: CommentShape, after: CommentShape | undefined): boolean {
  return !!after && after.userIdStable === true && after.userNameStable === true;
}

function classifySave(input: {
  editEnabled: boolean;
  editorMounted: boolean;
  writes: WireRecord[];
  after: StoreState;
  reload: StoreState;
  commentId: string;
  editedText: string;
  stableId: boolean;
  stableAuthor: boolean;
}): Classification {
  if (!input.editEnabled || !input.editorMounted) return 'edit-save-action-not-drivable';
  if (input.writes.length > 1) return 'edit-save-duplicate-write';
  const persistedText = locateComment(input.after, input.commentId)?.text;
  const reloadText = locateComment(input.reload, input.commentId)?.text;
  if (input.writes.length === 0 || persistedText !== input.editedText || reloadText !== input.editedText) {
    return 'edit-save-lost-write';
  }
  if (!input.stableId || !input.stableAuthor) return 'edit-save-local-persisted-divergence';
  return 'edit-save-consistent';
}

function classifyCancel(input: {
  editEnabled: boolean;
  editorMounted: boolean;
  writes: WireRecord[];
  after: StoreState;
  reload: StoreState;
  commentId: string;
  originalText: string;
}): Classification {
  if (!input.editEnabled || !input.editorMounted) return 'edit-save-action-not-drivable';
  if (input.writes.length > 0) return 'edit-cancel-writes-unexpectedly';
  const persistedText = locateComment(input.after, input.commentId)?.text;
  const reloadText = locateComment(input.reload, input.commentId)?.text;
  if (persistedText === input.originalText && reloadText === input.originalText) return 'edit-cancel-consistent';
  return 'edit-save-local-persisted-divergence';
}

function combineClassifications(flowA: Classification, flowB: Classification): Classification {
  if (flowA === 'edit-save-action-not-drivable' || flowB === 'edit-save-action-not-drivable') return 'edit-save-action-not-drivable';
  if (flowA === 'edit-save-duplicate-write') return 'edit-save-duplicate-write';
  if (flowA === 'edit-save-lost-write') return 'edit-save-lost-write';
  if (flowB === 'edit-cancel-writes-unexpectedly') return 'edit-cancel-writes-unexpectedly';
  if (flowA === 'edit-save-local-persisted-divergence' || flowB === 'edit-save-local-persisted-divergence') {
    return 'edit-save-local-persisted-divergence';
  }
  if (flowA === 'edit-save-consistent' && flowB === 'edit-cancel-consistent') return 'edit-save-consistent';
  return 'mixed-edit-save-state';
}

async function runFlowA(page: Page): Promise<FlowAResult> {
  const originalText = `${PREFIX_A} original`;
  const editedText = `${PREFIX_A} edited`;
  const setup = await setupSelfOwnedComment(page, PREFIX_A, originalText);
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const persistedBefore = await readCommentStore(setup.supabase, setup.targetPadletId, setup.currentUserId, setup.comment);
    const displayedBefore = await visibleTexts(setup.target, [originalText, editedText]);
    const { editEnabled, editor, observation } = await openEditor(page, setup.target, setup.row, originalText);
    await replaceEditorText(editor, editedText);
    const capture = beginWireCapture(page, () => [setup.targetPadletId, setup.comment.id!], originalText, editedText);
    await editor.press('Enter');
    await expect(setup.target.getByText(editedText, { exact: false })).toBeVisible({ timeout: 30_000 });
    const displayedAfter = await visibleTexts(setup.target, [originalText, editedText]);
    const persistedAfter = await waitForPersistedTexts(
      setup.supabase,
      setup.targetPadletId,
      [editedText],
      setup.currentUserId,
      setup.comment,
    );
    const wireSequence = await capture.finish();
    const writes = commentBearingWrites(wireSequence, setup.targetPadletId);
    const reload = await reloadAndRead(page, setup.supabase, setup.targetContainerId, setup.targetPadletId, setup.currentUserId, setup.comment);
    const afterComment = locateComment(persistedAfter, setup.comment.id!);
    const reloadComment = locateComment(reload, setup.comment.id!);
    const stableId = !!afterComment && !!reloadComment;
    const authorStable = stableAuthor(setup.comment, afterComment) && stableAuthor(setup.comment, reloadComment);
    const timestampStable = !!afterComment && !!reloadComment && afterComment.hasTimestamp === setup.comment.hasTimestamp && reloadComment.hasTimestamp === setup.comment.hasTimestamp;
    const detachedUnchanged = persistedBefore.detachedComments.length === 0 && persistedAfter.detachedComments.length === 0 && reload.detachedComments.length === 0;
    const classification = classifySave({
      editEnabled,
      editorMounted: observation.mounted,
      writes,
      after: persistedAfter,
      reload,
      commentId: setup.comment.id!,
      editedText,
      stableId,
      stableAuthor: authorStable,
    });
    cleanupCounts = await cleanupAndAssert(setup.supabase, setup.fixture);
    return {
      flow: 'A',
      boardPrefix: setup.fixture.prefix,
      targetPadletId: setup.targetPadletId,
      targetContainerId: setup.targetContainerId,
      originalText,
      editedText,
      commentId: setup.comment.id!,
      selfOwned: setup.comment.hasCurrentUserId,
      editEnabled,
      editor: observation,
      displayedBefore,
      displayedAfter,
      editModeExitEvidence: displayedAfter.includes(editedText)
        ? 'display settled to edited text after Enter save and strict persistence'
        : 'display did not settle to edited text within the bounded observation',
      wireSequence,
      commentBearingWrites: writes,
      responseStatuses: writes.map((record) => record.responseStatus),
      persistedBefore,
      persistedAfter,
      reloadState: reload,
      stableId,
      stableAuthor: authorStable,
      stableTimestamp: timestampStable,
      detachedUnchanged,
      duplicateWriteEvidence: writes.length > 1 ? [`${writes.length} comment-bearing writes observed for one Enter save`] : [],
      lostWriteEvidence: classification === 'edit-save-lost-write' ? ['edited text missing from write, persistence, or reload'] : [],
      divergenceEvidence: classification === 'edit-save-local-persisted-divergence' ? ['local, persisted, reload, ID, or author fields diverged'] : [],
      cleanupCounts,
      classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(setup.supabase, setup.fixture);
  }
}

async function runFlowB(page: Page): Promise<FlowBResult> {
  const originalText = `${PREFIX_B} original`;
  const cancelledText = `${PREFIX_B} cancelled`;
  const setup = await setupSelfOwnedComment(page, PREFIX_B, originalText);
  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const persistedBefore = await readCommentStore(setup.supabase, setup.targetPadletId, setup.currentUserId, setup.comment);
    const { editEnabled, editor, observation } = await openEditor(page, setup.target, setup.row, originalText);
    await replaceEditorText(editor, cancelledText);
    const capture = beginWireCapture(page, () => [setup.targetPadletId, setup.comment.id!], originalText, cancelledText);
    await editor.press('Escape');
    await expect(setup.target.getByText(originalText, { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(setup.target.getByText(cancelledText, { exact: false })).toHaveCount(0, { timeout: 30_000 });
    const displayedAfterEscape = await visibleTexts(setup.target, [originalText, cancelledText]);
    const persistedAfter = await readCommentStore(setup.supabase, setup.targetPadletId, setup.currentUserId, setup.comment);
    const wireSequence = await capture.finish();
    const writes = commentBearingWrites(wireSequence, setup.targetPadletId);
    const reload = await reloadAndRead(page, setup.supabase, setup.targetContainerId, setup.targetPadletId, setup.currentUserId, setup.comment);
    const stableId = !!locateComment(persistedAfter, setup.comment.id!) && !!locateComment(reload, setup.comment.id!);
    const detachedUnchanged = persistedBefore.detachedComments.length === 0 && persistedAfter.detachedComments.length === 0 && reload.detachedComments.length === 0;
    const classification = classifyCancel({
      editEnabled,
      editorMounted: observation.mounted,
      writes,
      after: persistedAfter,
      reload,
      commentId: setup.comment.id!,
      originalText,
    });
    cleanupCounts = await cleanupAndAssert(setup.supabase, setup.fixture);
    return {
      flow: 'B',
      boardPrefix: setup.fixture.prefix,
      targetPadletId: setup.targetPadletId,
      targetContainerId: setup.targetContainerId,
      originalText,
      cancelledText,
      commentId: setup.comment.id!,
      selfOwned: setup.comment.hasCurrentUserId,
      editEnabled,
      editor: observation,
      displayedAfterEscape,
      wireSequence,
      commentBearingWrites: writes,
      responseStatuses: writes.map((record) => record.responseStatus),
      persistedBefore,
      persistedAfter,
      reloadState: reload,
      stableId,
      detachedUnchanged,
      duplicateEvidence: [],
      divergenceEvidence: classification === 'edit-save-local-persisted-divergence' ? ['Escape local, persisted, or reload state diverged from original text'] : [],
      cleanupCounts,
      classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(setup.supabase, setup.fixture);
  }
}

test.describe('drawing comment edit save persistence diagnosis (PATCH-094)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes Enter save and Escape cancel for drawing comment edits', async ({ page }) => {
    test.setTimeout(300_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(page);
    const finalClassification = combineClassifications(flowA.classification, flowB.classification);

    expect(flowA.cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    expect(flowB.cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    expect([
      'edit-save-consistent',
      'edit-save-lost-write',
      'edit-save-duplicate-write',
      'edit-save-local-persisted-divergence',
      'edit-cancel-consistent',
      'edit-cancel-writes-unexpectedly',
      'edit-save-action-not-drivable',
      'mixed-edit-save-state',
    ]).toContain(finalClassification);

    test.info().annotations.push({
      type: ANNOTATION,
      description: JSON.stringify({
        selectedVisibleUI: 'EmbeddedCommentList rendered inside DrawingLayout RowColumnContainerCard for seeded type=comment child padlets',
        boardPrefixes: {
          flowA: flowA.boardPrefix,
          flowB: flowB.boardPrefix,
        },
        targetPadletIDs: {
          flowA: flowA.targetPadletId,
          flowB: flowB.targetPadletId,
        },
        targetContainerIDs: {
          flowA: flowA.targetContainerId,
          flowB: flowB.targetContainerId,
        },
        commentIDs: {
          flowA: flowA.commentId,
          flowB: flowB.commentId,
        },
        currentUserIdOwnershipBooleans: {
          flowA: flowA.selfOwned,
          flowB: flowB.selfOwned,
        },
        originalTexts: {
          flowA: flowA.originalText,
          flowB: flowB.originalText,
        },
        editedText: flowA.editedText,
        cancelledText: flowB.cancelledText,
        displayedState: {
          flowABefore: flowA.displayedBefore,
          flowAAfterEnter: flowA.displayedAfter,
          flowBAfterEscape: flowB.displayedAfterEscape,
        },
        editorMountLocation: {
          flowA: flowA.editor,
          flowB: flowB.editor,
        },
        enterActionResult: {
          editEnabled: flowA.editEnabled,
          writeCount: flowA.commentBearingWrites.length,
          responseStatuses: flowA.responseStatuses,
          classification: flowA.classification,
        },
        escapeActionResult: {
          editEnabled: flowB.editEnabled,
          writeCount: flowB.commentBearingWrites.length,
          responseStatuses: flowB.responseStatuses,
          classification: flowB.classification,
        },
        shiftEnterRuling: 'not-attempted-within-bound-scope',
        editModeExitOrdering: flowA.editModeExitEvidence,
        commentBearingWireSequence: {
          flowA: flowA.commentBearingWrites,
          flowB: flowB.commentBearingWrites,
        },
        responseStatuses: {
          flowA: flowA.responseStatuses,
          flowB: flowB.responseStatuses,
        },
        persistedComments: {
          flowABefore: flowA.persistedBefore,
          flowAAfter: flowA.persistedAfter,
          flowBBefore: flowB.persistedBefore,
          flowBAfter: flowB.persistedAfter,
        },
        stableIdResult: {
          flowA: flowA.stableId,
          flowB: flowB.stableId,
        },
        stableAuthorResult: flowA.stableAuthor,
        timestampResult: flowA.stableTimestamp,
        detachedComments: {
          flowAUnchanged: flowA.detachedUnchanged,
          flowBUnchanged: flowB.detachedUnchanged,
        },
        reloadState: {
          flowA: flowA.reloadState,
          flowB: flowB.reloadState,
        },
        duplicateWriteEvidence: {
          flowA: flowA.duplicateWriteEvidence,
          flowB: flowB.duplicateEvidence,
        },
        lostWriteEvidence: flowA.lostWriteEvidence,
        localPersistedDivergenceEvidence: {
          flowA: flowA.divergenceEvidence,
          flowB: flowB.divergenceEvidence,
        },
        sourceFindings: {
          commentRow: [
            'Enter without Shift prevents default and calls handleSaveEdit',
            'Escape calls onCancelEdit and clears editor content',
            'Shift+Enter is not intercepted by CommentRow and remains TipTap/ProseMirror default behavior',
            'onBlur can independently call handleSaveEdit when focus leaves the editing wrapper',
            'handleSaveEdit reads editor HTML and trimmed text; empty trimmed text does not save',
          ],
          embeddedCommentList: [
            'onSaveEdit calls onEditComment then synchronously sets editingCommentId(null)',
            'onSaveEdit does not await the async downstream strict persistence result',
            'onCancelEdit only clears editingCommentId locally',
            'CommentRow key remains comment.id',
          ],
          drawingLayoutPatch092Path: [
            'onEditComment maps only the target comment text and preserves id, userId, userName, timestamp, and other fields by spread',
            'onEditComment routes through handleUpdateChildComments with field=comments',
            'handleUpdateChildComments awaits onUpdatePadletStrict and has one catch logging Failed to update comment',
            'metadata.comments remains the observed store; detachedComments is not touched by these flows',
          ],
        },
        runtimeFindings: {
          enterSave: 'real contenteditable keyboard replacement followed by real Enter',
          escapeCancel: 'real contenteditable keyboard replacement followed by real Escape',
          hiddenHandlerUsed: false,
          syntheticEventDispatchUsed: false,
          failureInjectionUsed: false,
          canvasCommentsAccessed: false,
        },
        cleanupCounts: {
          flowA: flowA.cleanupCounts,
          flowB: flowB.cleanupCounts,
        },
        flowAClassification: flowA.classification,
        flowBClassification: flowB.classification,
        finalClassification,
      }),
    });
  });
});
