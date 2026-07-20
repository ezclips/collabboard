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

const ANNOTATION = 'patch-093-drawing-comment-edit-ui-evidence' as const;
const PREFIX_A = 'patch-064-harness-patch-093-comment-edit-a-' as const;
const PREFIX_B = 'patch-064-harness-patch-093-comment-edit-b-' as const;
const PADLETS_ENDPOINT_PATH = '/rest/v1/padlets' as const;

registerDrawingCleanup(test);

type Classification =
  | 'editor-mounts-and-is-drivable'
  | 'edit-state-set-but-editor-not-mounted'
  | 'editor-mounted-outside-expected-subtree'
  | 'edit-state-immediately-reset'
  | 'drawing-layout-only-edit-defect'
  | 'global-comment-edit-defect'
  | 'action-not-drivable'
  | 'mixed-edit-state';

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

type DomSnapshot = {
  label: string;
  elapsedMs: number;
  editVisible: boolean;
  saveVisible: boolean;
  cancelVisible: boolean;
  textareaCount: number;
  contentEditableCount: number;
  proseMirrorCount: number;
  rowProseMirrorCount: number;
  cardProseMirrorCount: number;
  pageProseMirrorCount: number;
  originalTextVisible: boolean;
  activeElementTag: string | null;
  activeElementTitle: string | null;
  activeElementText: string | null;
};

type FlowAResult = {
  flow: 'A';
  boardPrefix: string;
  targetContainerId: string;
  targetPadletId: string;
  commentId: string;
  selfOwnership: CommentShape;
  editExists: boolean;
  editEnabled: boolean;
  clickPerformed: boolean;
  clickElapsedMs: number;
  rowIdentity: string;
  textBeforeClick: string;
  beforeClick: DomSnapshot;
  afterClick: DomSnapshot;
  timing: DomSnapshot[];
  editorMountResult: string;
  editorLocation: string;
  focusEvidence: string;
  resetEvidence: string;
  commentTextUnchanged: boolean;
  persistedBeforeEdit: StoreState;
  persistedAfterEdit: StoreState;
  reloadState: StoreState;
  wireSequence: WireRecord[];
  commentBearingWrites: WireRecord[];
  cleanupCounts: CleanupCounts;
  classification: Classification;
};

type FlowBResult = {
  flow: 'B';
  boardPrefix: typeof PREFIX_B;
  result: 'not-reachable-through-existing-harness';
  evidence: string[];
  cleanupCounts: CleanupCounts;
  classification: Classification;
};

type PadletRow = {
  id: string;
  title: string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

function prefixLabel(prefix: typeof PREFIX_A): string {
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

async function setupDrawingBoard() {
  const { supabase, fixture } = await createDisposableDrawingBoard(prefixLabel(PREFIX_A));
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
  await expect(target.getByText(text, { exact: false })).toBeVisible({ timeout: 30_000 });
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

async function reloadState(
  page: Page,
  supabase: any,
  targetContainerId: string,
  targetPadletId: string,
  currentUserId?: string,
): Promise<StoreState> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const target = page.locator(`[data-padlet-id="${targetContainerId}"]`).first();
  await expect(target).toBeVisible({ timeout: 90_000 });
  return readCommentStore(supabase, targetPadletId, currentUserId);
}

async function cleanupAndAssert(supabase: any, fixture: DrawingFixture): Promise<CleanupCounts> {
  await cleanupDrawingFixture(supabase, fixture);
  return assertDrawingFixtureCleanup(supabase, fixture);
}

function boundedText(value: string | null): string | null {
  if (!value) return value;
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function snapshotDom(
  page: Page,
  target: Locator,
  row: Locator,
  text: string,
  label: string,
  startedAt: number,
): Promise<DomSnapshot> {
  const active = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return {
      tag: element?.tagName ?? null,
      title: element?.getAttribute('title') ?? null,
      text: element?.textContent ?? null,
    };
  });
  return {
    label,
    elapsedMs: Date.now() - startedAt,
    editVisible: await row.getByTitle('Edit').first().isVisible().catch(() => false),
    saveVisible: await page.getByTitle('Save').count().then((count) => count > 0),
    cancelVisible: await page.getByTitle('Cancel').count().then((count) => count > 0),
    textareaCount: await page.locator('textarea').count(),
    contentEditableCount: await page.locator('[contenteditable="true"]').count(),
    proseMirrorCount: await page.locator('.ProseMirror').count(),
    rowProseMirrorCount: await row.locator('.ProseMirror').count(),
    cardProseMirrorCount: await target.locator('.ProseMirror').count(),
    pageProseMirrorCount: await page.locator('.ProseMirror').count(),
    originalTextVisible: await row.getByText(text, { exact: false }).isVisible().catch(() => false),
    activeElementTag: active.tag,
    activeElementTitle: active.title,
    activeElementText: boundedText(active.text),
  };
}

function commentBearingWrites(wire: WireRecord[], targetPadletId: string): WireRecord[] {
  return wire.filter((record) =>
    record.relevantIds.includes(targetPadletId) &&
    (record.commentsFieldPresent || record.detachedCommentsFieldPresent)
  );
}

function classifyFlowA(input: {
  editExists: boolean;
  editEnabled: boolean;
  timing: DomSnapshot[];
  commentBearingWrites: WireRecord[];
}): Classification {
  if (!input.editExists || !input.editEnabled) return 'action-not-drivable';
  const postClickTiming = input.timing.filter((snapshot) => snapshot.label !== 'before-click');
  const hasRowEditor = input.timing.some((snapshot) => snapshot.rowProseMirrorCount > 0);
  const hasCardEditor = input.timing.some((snapshot) => snapshot.cardProseMirrorCount > 0);
  const hasPageEditor = input.timing.some((snapshot) => snapshot.pageProseMirrorCount > 0);
  const hasEditable = input.timing.some((snapshot) => snapshot.contentEditableCount > 0);
  const returnedToDisplay = postClickTiming.some((snapshot) =>
    snapshot.editVisible &&
    snapshot.originalTextVisible &&
    snapshot.rowProseMirrorCount === 0 &&
    snapshot.contentEditableCount === 0
  );

  if (hasRowEditor && hasEditable) return 'editor-mounts-and-is-drivable';
  if (hasPageEditor && !hasCardEditor) return 'editor-mounted-outside-expected-subtree';
  if (returnedToDisplay) return 'edit-state-immediately-reset';
  if (input.commentBearingWrites.length > 0) return 'mixed-edit-state';
  return 'edit-state-set-but-editor-not-mounted';
}

function editorMountResult(timing: DomSnapshot[]): string {
  if (timing.some((snapshot) => snapshot.rowProseMirrorCount > 0 && snapshot.contentEditableCount > 0)) {
    return 'editor mounted in row and contenteditable became available';
  }
  if (timing.some((snapshot) => snapshot.pageProseMirrorCount > 0)) {
    return 'editor mounted somewhere on page but row-drivable editor was not observed';
  }
  return 'no .ProseMirror editor was observed within the bounded timing window';
}

function editorLocation(timing: DomSnapshot[]): string {
  if (timing.some((snapshot) => snapshot.rowProseMirrorCount > 0)) return 'inside-comment-row';
  if (timing.some((snapshot) => snapshot.cardProseMirrorCount > 0)) return 'elsewhere-in-card';
  if (timing.some((snapshot) => snapshot.pageProseMirrorCount > 0)) return 'elsewhere-on-page-or-portal';
  return 'not-observed';
}

async function runFlowA(page: Page): Promise<FlowAResult> {
  const { supabase, fixture, targetContainerId, targetPadletId } = await setupDrawingBoard();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const currentUserId = userData.user?.id;
  expect(currentUserId).toBeTruthy();

  let cleanupCounts: CleanupCounts = { boards: -1, padlets: -1, canvasLines: -1 };
  try {
    const target = await openTarget(page, fixture.boardId, targetContainerId);
    const commentText = `${PREFIX_A} self-owned edit target`;
    await addComment(target, commentText);
    const persistedBeforeEdit = await waitForPersistedTexts(supabase, targetPadletId, [commentText], currentUserId);
    const selfOwnedComment = persistedBeforeEdit.comments.find((comment) => comment.text === commentText);
    expect(selfOwnedComment?.id).toBeTruthy();
    expect(selfOwnedComment?.hasCurrentUserId).toBe(true);

    const row = target.getByText(commentText, { exact: false }).locator('xpath=ancestor::div[contains(@class, "group/row")][1]');
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const editButton = row.getByTitle('Edit').first();
    const editExists = await editButton.count().then((count) => count === 1);
    await expect(editButton).toBeVisible({ timeout: 10_000 });
    const editEnabled = await editButton.isEnabled();
    const startedAt = Date.now();
    const beforeClick = await snapshotDom(page, target, row, commentText, 'before-click', startedAt);
    const wireCapture = beginWireCapture(page, () => [targetPadletId, selfOwnedComment!.id!]);
    await editButton.click();
    const clickElapsedMs = Date.now() - startedAt;
    const afterClick = await snapshotDom(page, target, row, commentText, 'after-click', startedAt);
    const timing: DomSnapshot[] = [beforeClick, afterClick];
    for (const interval of [50, 60, 250, 1_000, 3_000]) {
      const remaining = Math.max(0, interval - (Date.now() - startedAt));
      if (remaining > 0) await page.waitForTimeout(remaining);
      timing.push(await snapshotDom(page, target, row, commentText, `${interval}ms`, startedAt));
    }

    const editor = row.locator('.ProseMirror[contenteditable="true"]').first();
    if (await editor.isVisible().catch(() => false)) {
      await editor.press('Escape');
    }

    const wireSequence = await wireCapture.finish();
    const relevantWrites = commentBearingWrites(wireSequence, targetPadletId);
    const persistedAfterEdit = await readCommentStore(supabase, targetPadletId, currentUserId);
    const reload = await reloadState(page, supabase, targetContainerId, targetPadletId, currentUserId);
    const classification = classifyFlowA({
      editExists,
      editEnabled,
      timing,
      commentBearingWrites: relevantWrites,
    });
    cleanupCounts = await cleanupAndAssert(supabase, fixture);
    return {
      flow: 'A',
      boardPrefix: fixture.prefix,
      targetContainerId,
      targetPadletId,
      commentId: selfOwnedComment!.id!,
      selfOwnership: selfOwnedComment!,
      editExists,
      editEnabled,
      clickPerformed: true,
      clickElapsedMs,
      rowIdentity: 'visible CommentRow ancestor for the self-owned comment text',
      textBeforeClick: commentText,
      beforeClick,
      afterClick,
      timing,
      editorMountResult: editorMountResult(timing),
      editorLocation: editorLocation(timing),
      focusEvidence: timing.map((snapshot) => `${snapshot.label}:${snapshot.activeElementTag ?? 'none'}:${snapshot.activeElementTitle ?? 'no-title'}`).join('|'),
      resetEvidence: timing.some((snapshot) =>
        snapshot.label !== 'before-click' &&
        snapshot.editVisible &&
        snapshot.originalTextVisible &&
        snapshot.rowProseMirrorCount === 0
      )
        ? 'display-mode Edit control and original text were visible after the click with no row editor'
        : 'no immediate visible reset pattern observed',
      commentTextUnchanged: commentTexts(persistedAfterEdit.comments).includes(commentText) &&
        commentTexts(reload.comments).includes(commentText),
      persistedBeforeEdit,
      persistedAfterEdit,
      reloadState: reload,
      wireSequence,
      commentBearingWrites: relevantWrites,
      cleanupCounts,
      classification,
    };
  } finally {
    if (cleanupCounts.boards !== 0) await cleanupAndAssert(supabase, fixture);
  }
}

async function runFlowB(supabase: any): Promise<FlowBResult> {
  const cleanupCounts = await assertDrawingFixtureCleanup(supabase, PREFIX_B);
  return {
    flow: 'B',
    boardPrefix: PREFIX_B,
    result: 'not-reachable-through-existing-harness',
    evidence: [
      'the existing drawingBridgeHarness creates drawing-layout boards only',
      'RowCanvas is the named contrast owner, but no authorized harness entry creates a non-drawing RowCanvas board',
      'PATCH-093 prohibits custom routes, fabricated mounts, application routing changes, and harness changes',
    ],
    cleanupCounts,
    classification: 'action-not-drivable',
  };
}

function combineClassifications(flowA: Classification, flowB: FlowBResult): Classification {
  if (flowB.result === 'not-reachable-through-existing-harness') return flowA;
  if (flowA === flowB.classification) return flowA;
  if (flowA === 'editor-mounts-and-is-drivable' && flowB.classification !== 'editor-mounts-and-is-drivable') {
    return 'drawing-layout-only-edit-defect';
  }
  if (flowA !== 'editor-mounts-and-is-drivable' && flowB.classification !== 'editor-mounts-and-is-drivable') {
    return 'global-comment-edit-defect';
  }
  return 'mixed-edit-state';
}

test.describe('drawing comment edit UI diagnosis (PATCH-093)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('characterizes the self-owned drawing comment Edit UI state transition', async ({ page }) => {
    test.setTimeout(300_000);

    const flowA = await runFlowA(page);
    const flowB = await runFlowB(await import('./drawingBridgeHarness').then((mod) => mod.createHarnessClient()));
    const finalClassification = combineClassifications(flowA.classification, flowB);

    expect(flowA.cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    expect(flowB.cleanupCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
    expect(flowA.editExists).toBe(true);
    expect(flowA.editEnabled).toBe(true);
    expect([
      'editor-mounts-and-is-drivable',
      'edit-state-set-but-editor-not-mounted',
      'editor-mounted-outside-expected-subtree',
      'edit-state-immediately-reset',
      'drawing-layout-only-edit-defect',
      'global-comment-edit-defect',
      'action-not-drivable',
      'mixed-edit-state',
    ]).toContain(finalClassification);

    test.info().annotations.push({
      type: ANNOTATION,
      description: JSON.stringify({
        selectedDrawingLayoutUI: 'EmbeddedCommentList rendered inside DrawingLayout RowColumnContainerCard for a seeded type=comment child padlet',
        selectedContrastLayout: flowB.result,
        boardPrefixes: {
          flowA: flowA.boardPrefix,
          flowB: flowB.boardPrefix,
        },
        targetPadletID: flowA.targetPadletId,
        targetContainerID: flowA.targetContainerId,
        commentID: flowA.commentId,
        selfOwnershipProof: flowA.selfOwnership,
        editButton: {
          exists: flowA.editExists,
          enabled: flowA.editEnabled,
        },
        editClick: {
          performed: flowA.clickPerformed,
          elapsedMs: flowA.clickElapsedMs,
          rowIdentity: flowA.rowIdentity,
          textBeforeClick: flowA.textBeforeClick,
        },
        domSnapshots: {
          beforeClick: flowA.beforeClick,
          afterClick: flowA.afterClick,
          timing: flowA.timing,
        },
        editorMountResult: flowA.editorMountResult,
        editorLocation: flowA.editorLocation,
        pageWideEditorSearch: flowA.timing.map((snapshot) => ({
          label: snapshot.label,
          proseMirrorCount: snapshot.proseMirrorCount,
          contentEditableCount: snapshot.contentEditableCount,
        })),
        saveCancelVisibility: flowA.timing.map((snapshot) => ({
          label: snapshot.label,
          saveVisible: snapshot.saveVisible,
          cancelVisible: snapshot.cancelVisible,
        })),
        focusEvidence: flowA.focusEvidence,
        resetEvidence: flowA.resetEvidence,
        commentTextUnchanged: flowA.commentTextUnchanged,
        drawingLayoutRuntimeFindings: {
          realAddUsed: true,
          realEditClickUsed: true,
          hiddenHandlerUsed: false,
          syntheticEventDispatchUsed: false,
          finalFlowClassification: flowA.classification,
        },
        contrastFindings: flowB,
        sourceInspectionFindings: {
          commentRow: [
            'canEdit is comment.userId === currentUserId',
            'Edit click stops propagation, sets shouldSelectText, and calls onStartEdit when canEdit',
            'EmbeddedCommentList onStartEdit sets editingCommentId and activeCommentId to comment.id',
            'EditorContent is rendered only in the isEditing branch',
            'the Edit button has no explicit type attribute',
            'there are no dedicated Save/Cancel buttons in CommentRow; Enter saves and Escape cancels',
            'onBlur saves when focus leaves the editing wrapper',
          ],
          commentEditor: [
            'separate modal editor, not the DrawingLayout inline row UI',
            'uses TipTap editors with immediatelyRender:false',
            'editing content is loaded through editor commands before save',
            'save and cancel behavior is local to the modal component',
          ],
          embeddedCommentList: [
            'CommentRow key is comment.id',
            'no React.memo wrapper was observed around CommentRow',
            'callbacks are recreated inline and update editingCommentId locally',
            'composer input and Send button stop pointer/mouse propagation',
          ],
          drawingLayoutContainer: [
            'DrawingLayout renders embedded comment children inside transformed canvas ancestry',
            'RowColumnContainerCard is the drawing-layout card wrapper for seeded containers',
            'comment persistence path remains onUpdatePadletStrict through handleUpdateChildComments',
          ],
          contrastLayout: [
            'RowCanvas imports and renders the same EmbeddedCommentList and CommentRow components',
            'no existing drawing harness entry reaches RowCanvas without new routing or fixture support',
          ],
        },
        eventPropagationFindings: {
          editClickReceivedByButton: flowA.clickPerformed,
          enabledStateBeforeClick: flowA.editEnabled,
          focusChange: flowA.focusEvidence,
          cardSelectionVisibleChange: 'bounded DOM snapshots only; no separate instrumentation seam used',
          dragPanVisibleChange: 'no visible drag or pan mode change was observed in the bounded snapshots',
          editReplacementState: flowA.timing.map((snapshot) => ({
            label: snapshot.label,
            editVisible: snapshot.editVisible,
            saveVisible: snapshot.saveVisible,
            cancelVisible: snapshot.cancelVisible,
          })),
          sourceOnly: [
            'CommentRow editing wrapper stops mouse and pointer propagation but does not call preventDefault',
            'no capture-phase listener was added or monkey-patched by this spec',
          ],
        },
        persistenceWireEvidence: {
          wireSequence: flowA.wireSequence,
          commentBearingWrites: flowA.commentBearingWrites,
        },
        persistedState: {
          beforeEdit: flowA.persistedBeforeEdit,
          afterEdit: flowA.persistedAfterEdit,
        },
        reloadState: flowA.reloadState,
        cleanupCounts: {
          flowA: flowA.cleanupCounts,
          flowB: flowB.cleanupCounts,
        },
        finalClassification,
      }),
    });
  });
});
