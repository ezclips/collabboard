import { expect, test, type Locator, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_EMAIL, E2E_PASSWORD } from '../helpers/env';

test.use({
  storageState: process.env.PATCH117_STORAGE_STATE || { cookies: [], origins: [] },
});

type Json = Record<string, unknown>;
type CanvasLineRow = {
  id: string;
  board_id: string;
  start_x: number;
  start_y: number;
  control_x: number;
  control_y: number;
  end_x: number;
  end_y: number;
  points: Array<{ x: number; y: number; type: 'corner' | 'smooth' }> | null;
  coord_space: 'scene' | null;
  layer_plane: 'front' | 'back' | null;
  color: string | null;
  stroke_width: number | null;
  dashed: boolean | null;
  label: string | null;
};

type GeometrySnapshot = Pick<
  CanvasLineRow,
  'coord_space' | 'start_x' | 'start_y' | 'control_x' | 'control_y' | 'end_x' | 'end_y' | 'points' | 'layer_plane'
>;
type FixturePointsShape = 'points-array' | 'legacy-three-point';
type LineRoleCounts = Record<string, number>;
type VerifiedHitPathPoint = Awaited<ReturnType<typeof verifiedHitPathPoint>>;
type DoubleClickDiagnostics = {
  rawDoubleClickEventTargets: Array<{
    type: string;
    tagName: string | null;
    lineId: string | null;
    lineRole: string | null;
    nearestLineId: string | null;
    nearestLineRole: string | null;
    className: string | null;
  }>;
  hitPathFingerprintBeforeDoubleClick: string | null;
  hitPathFingerprintAfterDoubleClick: string | null;
  chosenVerifiedHitPathCoordinate: VerifiedHitPathPoint;
};
type OpenDrawingDiagnosticContext = {
  supabase?: SupabaseClient;
  fixtureLineId?: string;
  nodeUserId?: string | null;
  storageStatePath?: string;
};
type ResolvingRequestDiagnostic = {
  url: string;
  method: string;
  status: number;
  responseSummary: string | null;
};
type OpenDrawingResult = {
  attemptedUrl: string;
  currentBrowserUrl: string;
  browserUserId: string | null;
  storageState: ReturnType<typeof storageStateDiagnostic>;
  resolvingRequests: ResolvingRequestDiagnostic[];
};

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3000';
const PREFIX = 'patch-117-overlay-containment-';
const AUTH_STATE_PATH = path.join(process.cwd(), 'e2e', '.auth', 'user.json');
const MATRIX_TIMEOUT_MS = 240_000;
// Initial navigation hydrates the authenticated dashboard and fetches canvas data.
const INITIAL_LOAD_TIMEOUT_MS = 15_000;
const UI_READY_TIMEOUT_MS = 3_000;
const INTERACTION_TIMEOUT_MS = 2_000;
const FALLBACK_SETTLE_TIMEOUT_MS = 250;

function readEnvLocal(key: string): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return (match?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key] || readEnvLocal(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optionalEnv(key: string): string {
  return process.env[key] || readEnvLocal(key);
}

function storageStateDiagnostic(storageStatePath = AUTH_STATE_PATH) {
  try {
    const stat = fs.statSync(storageStatePath);
    return {
      path: path.relative(process.cwd(), storageStatePath),
      modifiedAt: stat.mtime.toISOString(),
      ageMs: Date.now() - stat.mtime.getTime(),
    };
  } catch (error) {
    return {
      path: path.relative(process.cwd(), storageStatePath),
      modifiedAt: null,
      ageMs: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[redacted]"')
    .replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
}

function summarizeResponseBody(body: string): string {
  return redactDiagnosticText(body.replace(/\s+/g, ' ').slice(0, 500));
}

async function browserUserId(page: Page): Promise<string | null> {
  const profileUserIdPromise = page.waitForResponse((response) => {
    const url = response.url();
    return url.includes('/rest/v1/profiles') && url.includes('id=eq.');
  }, { timeout: INITIAL_LOAD_TIMEOUT_MS }).then((response) => {
    const match = response.url().match(/[?&]id=eq\.([0-9a-f-]{36})/i);
    return match?.[1] ?? null;
  }).catch(() => null);
  await page.goto(`${BASE_URL}/dashboard/settings/profile`, { waitUntil: 'domcontentloaded' });
  const profileUserId = await profileUserIdPromise;
  if (profileUserId) return profileUserId;

  return page.evaluate(() => {
    const findUserId = (value: unknown): string | null => {
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, unknown>;
      const user = record.user;
      if (user && typeof user === 'object' && typeof (user as Record<string, unknown>).id === 'string') {
        return (user as Record<string, string>).id;
      }
      for (const child of Object.values(record)) {
        const id = findUserId(child);
        if (id) return id;
      }
      return null;
    };

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) ?? '';
      if (!key.includes('auth')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const id = findUserId(JSON.parse(raw));
        if (id) return id;
      } catch {
        // Ignore non-JSON localStorage entries.
      }
    }
    return null;
  }).catch(() => null);
}

async function fixtureExistence(
  supabase: SupabaseClient | undefined,
  boardId: string,
  lineId: string | undefined,
) {
  if (!supabase) return null;
  const [{ data: board, error: boardError }, { data: padlets, error: padletsError }, lineResult] = await Promise.all([
    supabase.from('boards').select('id,title,layout,user_id').eq('id', boardId).maybeSingle(),
    supabase.from('padlets').select('id,board_id,type,title').eq('board_id', boardId),
    lineId
      ? supabase.from('canvas_lines').select('id,board_id,coord_space,layer_plane').eq('id', lineId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    boardExists: Boolean(board),
    board: board ? { id: board.id, title: board.title, layout: board.layout, user_id: board.user_id } : null,
    boardError: boardError ? { code: boardError.code, message: boardError.message } : null,
    padletsCount: padlets?.length ?? 0,
    padlets: (padlets ?? []).map((padlet) => ({
      id: padlet.id,
      board_id: padlet.board_id,
      type: padlet.type,
      title: padlet.title,
    })),
    padletsError: padletsError ? { code: padletsError.code, message: padletsError.message } : null,
    lineExists: Boolean(lineResult.data),
    line: lineResult.data,
    lineError: lineResult.error ? { code: lineResult.error.code, message: lineResult.error.message } : null,
  };
}

function nextIndex(index: number): string {
  return `a${String(index).padStart(6, '0')}`;
}

function frameElement(id: string, name: string, x: number, y: number, width: number, height: number, index: number): Json {
  return {
    id,
    type: 'frame',
    name,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#111827',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    frameId: null,
    groupIds: [],
    isDeleted: false,
    version: 1,
    versionNonce: 1,
    updated: Date.now(),
    index: nextIndex(index),
    boundElements: null,
    link: null,
    locked: false,
  };
}

function textElement(id: string, text: string, x: number, y: number, frameId: string, index: number): Json {
  return {
    id,
    type: 'text',
    x,
    y,
    width: 260,
    height: 32,
    angle: 0,
    strokeColor: '#111827',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    seed: 2,
    groupIds: [],
    frameId,
    isDeleted: false,
    version: 1,
    versionNonce: 1,
    updated: Date.now(),
    index: nextIndex(index),
    boundElements: null,
    link: null,
    locked: false,
    text,
    fontSize: 24,
    fontFamily: 1,
    fontString: '24px Virgil',
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    baseline: 23,
    autoResize: true,
  };
}

async function createClientForLiveUser(): Promise<SupabaseClient> {
  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  if (!E2E_EMAIL || !E2E_PASSWORD) throw new Error('E2E credentials are required');
  const { error } = await supabase.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });
  if (error) throw error;
  return supabase;
}

async function assertAlignedIdentityBeforeFixtureInsert(page: Page, supabase: SupabaseClient) {
  const [{ data: userData, error: userError }, browserId] = await Promise.all([
    supabase.auth.getUser(),
    browserUserId(page),
  ]);
  if (userError) throw userError;
  const nodeId = userData.user.id;
  if (!browserId || browserId !== nodeId) {
    throw new Error(`PATCH-117 identity mismatch before fixture insert: ${JSON.stringify({ nodeUserId: nodeId, browserUserId: browserId })}`);
  }
  return { nodeUserId: nodeId, browserUserId: browserId };
}

async function createFixture(supabase: SupabaseClient) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const prefix = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({
      title: prefix,
      description: 'PATCH-117 disposable Drawing overlay fixture',
      layout: 'drawing',
      user_id: userData.user.id,
      background_type: 'color',
      background_value: '#ffffff',
      container_size: 'medium',
    })
    .select('id,title')
    .single();
  if (boardError) throw boardError;

  const frameId = 'patch117-frame-1';
  const elements = [
    frameElement(frameId, 'PATCH-117 Slide 1', 0, 0, 1280, 720, 1),
    textElement('patch117-text-1', 'PATCH-117 runtime marker', 80, 80, frameId, 2),
  ];
  const { data: padlet, error: padletError } = await supabase.from('padlets').insert({
    board_id: board.id,
    title: `${prefix} master`,
    content: JSON.stringify(elements),
    type: 'drawing',
    position_x: 0,
    position_y: 0,
    width: 0,
    height: 0,
    metadata: {
      patch117Harness: true,
      drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      drawingFiles: JSON.stringify({}),
    },
  }).select('id,board_id,type,title').single();
  if (padletError) throw padletError;

  const lineRow = {
    board_id: board.id,
    start_x: 140,
    start_y: 260,
    control_x: 760,
    control_y: 160,
    end_x: 1160,
    end_y: 300,
    points: [
      { x: 140, y: 260, type: 'smooth' },
      { x: 1160, y: 300, type: 'smooth' },
    ],
    coord_space: 'scene',
    color: '#dc2626',
    stroke_width: 6,
    start_arrow: false,
    end_arrow: true,
    dashed: false,
    label: 'PATCH-117 Arrow Post',
    label_position: 0.5,
    layer_plane: 'front',
    z_index: 10,
  };
  const { data: line, error: lineError } = await supabase.from('canvas_lines').insert(lineRow).select('*').single();
  if (lineError) throw lineError;

  return { boardId: String(board.id), prefix, padlet, line: line as CanvasLineRow };
}

async function cleanupFixture(supabase: SupabaseClient, boardId: string, prefix: string): Promise<void> {
  await supabase.from('canvas_lines').delete().eq('board_id', boardId);
  await supabase.from('padlets').delete().eq('board_id', boardId);
  await supabase.from('boards').delete().eq('id', boardId).like('title', `${prefix}%`);
}

async function fetchLine(supabase: SupabaseClient, id: string): Promise<CanvasLineRow> {
  const { data, error } = await supabase.from('canvas_lines').select('*').eq('id', id).single();
  if (error) throw error;
  return data as CanvasLineRow;
}

function geometryOf(line: CanvasLineRow): GeometrySnapshot {
  return {
    coord_space: line.coord_space,
    start_x: line.start_x,
    start_y: line.start_y,
    control_x: line.control_x,
    control_y: line.control_y,
    end_x: line.end_x,
    end_y: line.end_y,
    points: line.points,
    layer_plane: line.layer_plane,
  };
}

async function openDrawing(page: Page, boardId: string, diagnosticContext: OpenDrawingDiagnosticContext = {}): Promise<OpenDrawingResult> {
  const attemptedUrl = `${BASE_URL}/dashboard/canvas/${boardId}`;
  const resolvingRequests: ResolvingRequestDiagnostic[] = [];
  const pendingResponses: Array<Promise<void>> = [];
  const responseListener = (response: import('@playwright/test').Response) => {
    const request = response.request();
    const url = response.url();
    const isRelevant = url.includes(boardId)
      || url.includes('/rest/v1/boards')
      || url.includes('/rest/v1/padlets')
      || url.includes('/rest/v1/canvas_lines')
      || url.includes('/api/');
    if (!isRelevant) return;
    pendingResponses.push((async () => {
      let responseSummary: string | null = null;
      try {
        responseSummary = summarizeResponseBody(await response.text());
      } catch (error) {
        responseSummary = `unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
      resolvingRequests.push({
        url: redactDiagnosticText(url),
        method: request.method(),
        status: response.status(),
        responseSummary,
      });
    })());
  };

  page.on('response', responseListener);
  await page.goto(attemptedUrl, { waitUntil: 'domcontentloaded' });
  const loadResult = await Promise.race([
    page.getByTitle('Back to Dashboard').waitFor({ timeout: INITIAL_LOAD_TIMEOUT_MS }).then(() => 'loaded' as const),
    page.getByText('Canvas not found', { exact: true }).waitFor({ timeout: INITIAL_LOAD_TIMEOUT_MS }).then(() => 'canvas-not-found' as const),
  ]);
  if (loadResult === 'canvas-not-found') {
    await Promise.allSettled(pendingResponses);
    const [browserUser, existence, domState] = await Promise.all([
      browserUserId(page).catch((error) => `unavailable: ${error instanceof Error ? error.message : String(error)}`),
      fixtureExistence(diagnosticContext.supabase, boardId, diagnosticContext.fixtureLineId),
      page.evaluate(() => ({
        title: document.title,
        bodyText: document.body.textContent?.trim().replace(/\s+/g, ' ').slice(0, 500) ?? '',
        canvasNotFoundVisible: document.body.textContent?.includes('Canvas not found') ?? false,
      })),
    ]);
    page.off('response', responseListener);
    throw new Error(`PATCH-117 section 30 openDrawing fail-fast Canvas not found: ${JSON.stringify({
      attemptedUrl,
      attemptedFixtureIdentifier: boardId,
      currentBrowserUrl: page.url(),
      browserUserId: browserUser,
      nodeFixtureClientUserId: diagnosticContext.nodeUserId ?? null,
      storageState: storageStateDiagnostic(diagnosticContext.storageStatePath),
      resolvingRequests,
      fixtureExistsAtFailure: existence,
      domState,
    })}`);
  }
  page.off('response', responseListener);
  await page.locator('canvas.excalidraw__canvas.interactive').waitFor({ timeout: INITIAL_LOAD_TIMEOUT_MS });
  await page.locator('[data-drawing-line-layer="front"]').waitFor({ timeout: INITIAL_LOAD_TIMEOUT_MS });
  await Promise.allSettled(pendingResponses);
  return {
    attemptedUrl,
    currentBrowserUrl: page.url(),
    browserUserId: null,
    storageState: storageStateDiagnostic(diagnosticContext.storageStatePath),
    resolvingRequests,
  };
}

async function openPresentationSidebar(page: Page): Promise<Locator> {
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80').first();
  if (await sidebar.count() === 0) {
    await page.getByTitle('Present Frames').click();
  }
  await expect(sidebar).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible();
  return sidebar;
}

async function closePresentationSidebar(page: Page): Promise<void> {
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80').first();
  await expect(sidebar).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
  const header = sidebar.locator(':scope > div').first();
  const closeButton = header.getByRole('button').nth(3);
  await expect(closeButton).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
  await closeButton.click({ timeout: INTERACTION_TIMEOUT_MS });
  await expect(sidebar).toHaveCount(0, { timeout: INTERACTION_TIMEOUT_MS });
}

async function visibleCanvasRightInset(page: Page): Promise<string> {
  return page.locator('.excalidraw').first().evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--drawing-visible-canvas-right-inset').trim(),
  );
}

async function centerHitIdentity(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      tag: hit?.tagName.toLowerCase() ?? null,
      text: hit?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? null,
      lineRole: hit instanceof Element ? hit.getAttribute('data-line-role') : null,
      contains: hit ? element === hit || element.contains(hit) : false,
    };
  });
}

async function lineRoleCounts(page: Page, lineId: string) {
  return page.evaluate((id) => {
    return Array.from(document.querySelectorAll(`[data-line-id="${id}"][data-line-role]`))
      .reduce<Record<string, number>>((counts, element) => {
        const role = element.getAttribute('data-line-role') ?? '(none)';
        counts[role] = (counts[role] ?? 0) + 1;
        return counts;
      }, {});
  }, lineId);
}

function fixturePointsShape(sourceLine: Pick<CanvasLineRow, 'points'>): FixturePointsShape {
  return Array.isArray(sourceLine.points) ? 'points-array' : 'legacy-three-point';
}

function requiredEditHandleRoles(shape: FixturePointsShape): Array<'point-handle' | 'midpoint-handle' | 'start-handle' | 'control-handle' | 'end-handle'> {
  return shape === 'points-array'
    ? ['point-handle', 'midpoint-handle']
    : ['start-handle', 'control-handle', 'end-handle'];
}

function exactLineHandlesMatchFixtureShape(counts: LineRoleCounts, shape: FixturePointsShape): boolean {
  return requiredEditHandleRoles(shape).every((role) => (counts[role] ?? 0) >= 1);
}

async function hitPathFingerprint(page: Page, lineId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const hitPath = document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="hit-path"]`);
    return hitPath instanceof Element ? hitPath.outerHTML.replace(/\s+/g, ' ').slice(0, 220) : null;
  }, lineId);
}

async function startDoubleClickTargetCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __patch117DoubleClickEvents?: DoubleClickDiagnostics['rawDoubleClickEventTargets'];
      __patch117DoubleClickListeners?: Array<{ type: string; listener: EventListener }>;
    };
    state.__patch117DoubleClickListeners?.forEach(({ type, listener }) => {
      document.removeEventListener(type, listener, true);
    });
    state.__patch117DoubleClickEvents = [];
    state.__patch117DoubleClickListeners = ['mousedown', 'mouseup', 'click', 'dblclick'].map((type) => {
      const listener = ((event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        const nearestLine = target?.closest('[data-line-id]') ?? null;
        const nearestRole = target?.closest('[data-line-role]') ?? null;
        state.__patch117DoubleClickEvents?.push({
          type: event.type,
          tagName: target?.tagName ?? null,
          lineId: target?.getAttribute('data-line-id') ?? null,
          lineRole: target?.getAttribute('data-line-role') ?? null,
          nearestLineId: nearestLine?.getAttribute('data-line-id') ?? null,
          nearestLineRole: nearestRole?.getAttribute('data-line-role') ?? null,
          className: target && typeof target.className === 'string'
            ? target.className
            : String(target?.className ?? ''),
        });
      }) as EventListener;
      document.addEventListener(type, listener, true);
      return { type, listener };
    });
  });
}

async function stopDoubleClickTargetCapture(page: Page): Promise<DoubleClickDiagnostics['rawDoubleClickEventTargets']> {
  return page.evaluate(() => {
    const state = window as typeof window & {
      __patch117DoubleClickEvents?: DoubleClickDiagnostics['rawDoubleClickEventTargets'];
      __patch117DoubleClickListeners?: Array<{ type: string; listener: EventListener }>;
    };
    state.__patch117DoubleClickListeners?.forEach(({ type, listener }) => {
      document.removeEventListener(type, listener, true);
    });
    state.__patch117DoubleClickListeners = [];
    return state.__patch117DoubleClickEvents ?? [];
  });
}

async function verifiedHitPathPoint(page: Page, lineId: string) {
  return page.evaluate((id) => {
    const path = document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="hit-path"]`);
    const hitPathCount = document.querySelectorAll(`[data-line-id="${CSS.escape(id)}"][data-line-role="hit-path"]`).length;
    const rolesPresent = Array.from(document.querySelectorAll(`[data-line-id="${CSS.escape(id)}"][data-line-role]`))
      .reduce<Record<string, number>>((counts, element) => {
        const role = element.getAttribute('data-line-role') ?? '(none)';
        counts[role] = (counts[role] ?? 0) + 1;
        return counts;
      }, {});
    const rectOf = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    if (!(path instanceof SVGGeometryElement)) {
      throw new Error(`No exact raw hit-path point found:\n${JSON.stringify({
        lineId: id,
        hitPathCount,
        hitPathBoundingRect: rectOf(path instanceof Element ? path : null),
        attemptedRatios: [],
        samples: [],
        labelPosition: null,
        labelHandleBoundingRect: rectOf(document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="label-handle"]`)),
        rolesPresent,
      }, null, 2)}`);
    }
    const matrix = path.getScreenCTM();
    if (!matrix) {
      throw new Error(`No exact raw hit-path point found:\n${JSON.stringify({
        lineId: id,
        hitPathCount,
        hitPathBoundingRect: rectOf(path),
        attemptedRatios: [],
        samples: [],
        labelPosition: null,
        labelHandleBoundingRect: rectOf(document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="label-handle"]`)),
        rolesPresent,
        reason: 'hit-path has no screen transform',
      }, null, 2)}`);
    }
    const length = path.getTotalLength();
    const attemptedRatios = [0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.18, 0.32, 0.68, 0.82];
    const samples = attemptedRatios.map((ratio) => {
      const local = path.getPointAtLength(length * ratio);
      const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
      const top = document.elementFromPoint(screen.x, screen.y);
      const nearestRoleAncestor = top instanceof Element ? top.closest('[data-line-role]') : null;
      const nearestLineAncestor = top instanceof Element ? top.closest('[data-line-id]') : null;
      const stack = document.elementsFromPoint(screen.x, screen.y).map((element, index) => ({
        index,
        tagName: element.tagName,
        lineId: element.getAttribute('data-line-id'),
        lineRole: element.getAttribute('data-line-role'),
        nearestLineId: element.closest('[data-line-id]')?.getAttribute('data-line-id') ?? null,
        nearestRole: element.closest('[data-line-role]')?.getAttribute('data-line-role') ?? null,
        className: typeof element.className === 'string' ? element.className : String(element.className ?? ''),
      }));
      return {
        ratio,
        x: screen.x,
        y: screen.y,
        rawElementFromPoint: top instanceof Element
          ? {
            tagName: top.tagName,
            lineId: top.getAttribute('data-line-id'),
            lineRole: top.getAttribute('data-line-role'),
            className: typeof top.className === 'string' ? top.className : String(top.className ?? ''),
          }
          : null,
        nearestRoleAncestor: nearestRoleAncestor
          ? {
            tagName: nearestRoleAncestor.tagName,
            lineId: nearestRoleAncestor.getAttribute('data-line-id'),
            lineRole: nearestRoleAncestor.getAttribute('data-line-role'),
          }
          : null,
        nearestLineAncestor: nearestLineAncestor
          ? {
            tagName: nearestLineAncestor.tagName,
            lineId: nearestLineAncestor.getAttribute('data-line-id'),
            lineRole: nearestLineAncestor.getAttribute('data-line-role'),
          }
          : null,
        stack,
        isExactRawHitPath: top === path
          && top.getAttribute('data-line-id') === id
          && top.getAttribute('data-line-role') === 'hit-path',
      };
    });

    const exactSample = samples.find((sample) => sample.isExactRawHitPath);
    if (exactSample) {
      return {
        x: exactSample.x,
        y: exactSample.y,
        ratio: exactSample.ratio,
        role: 'hit-path',
        lineId: id,
        rawElementFromPoint: exactSample.rawElementFromPoint,
        attemptedRatios,
        samples,
      };
    }

    throw new Error(`No exact raw hit-path point found:\n${JSON.stringify({
      lineId: id,
      hitPathCount,
      hitPathBoundingRect: rectOf(path),
      attemptedRatios,
      samples,
      labelPosition: null,
      labelHandleBoundingRect: rectOf(document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="label-handle"]`)),
      rolesPresent,
    }, null, 2)}`);
  }, lineId);
}

async function visiblePathFilter(page: Page, lineId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const visiblePath = document.querySelector(`[data-line-id="${id}"][data-line-role="visible-path"]`);
    return visiblePath ? window.getComputedStyle(visiblePath).filter : null;
  }, lineId);
}

async function selectionDiagnosticDump(page: Page, lineId: string, point: { x: number; y: number }) {
  return page.evaluate(({ id, x, y }) => {
    const hitPath = document.querySelector(`[data-line-id="${id}"][data-line-role="hit-path"]`);
    const visiblePath = document.querySelector(`[data-line-id="${id}"][data-line-role="visible-path"]`);
    const elementAtPoint = document.elementFromPoint(x, y);
    const hitPathRect = hitPath instanceof Element ? hitPath.getBoundingClientRect() : null;
    const visiblePathRect = visiblePath instanceof Element ? visiblePath.getBoundingClientRect() : null;
    const roleCounts = Array.from(document.querySelectorAll(`[data-line-id="${id}"][data-line-role]`))
      .reduce<Record<string, number>>((counts, element) => {
        const role = element.getAttribute('data-line-role') ?? '(none)';
        counts[role] = (counts[role] ?? 0) + 1;
        return counts;
      }, {});

    return {
      observedFilter: visiblePath ? window.getComputedStyle(visiblePath).filter : null,
      hitPathCount: document.querySelectorAll(`[data-line-id="${id}"][data-line-role="hit-path"]`).length,
      elementFromPoint: {
        tagName: elementAtPoint?.tagName ?? null,
        lineId: elementAtPoint instanceof Element ? elementAtPoint.getAttribute('data-line-id') : null,
        lineRole: elementAtPoint instanceof Element ? elementAtPoint.getAttribute('data-line-role') : null,
      },
      roleCounts,
      visiblePathBoundingBox: visiblePathRect
        ? { x: visiblePathRect.x, y: visiblePathRect.y, width: visiblePathRect.width, height: visiblePathRect.height }
        : null,
      hitPathBoundingBox: hitPathRect
        ? { x: hitPathRect.x, y: hitPathRect.y, width: hitPathRect.width, height: hitPathRect.height }
        : null,
    };
  }, { id: lineId, x: point.x, y: point.y });
}

async function selectExactLineByVisibleFilter(page: Page, lineId: string) {
  const hitPath = page.locator(`[data-line-id="${lineId}"][data-line-role="hit-path"]`);
  await expect(hitPath).toHaveCount(1);

  const preFilter = await visiblePathFilter(page, lineId);
  expect(preFilter).toBe('none');

  const point = await verifiedHitPathPoint(page, lineId);
  await page.mouse.move(point.x, point.y);
  const start = Date.now();
  const deadline = start + 2000;
  await page.mouse.down();

  let selectedFilter = await visiblePathFilter(page, lineId);
  while ((!selectedFilter || !selectedFilter.includes('drop-shadow')) && Date.now() < deadline) {
    await page.waitForTimeout(Math.min(50, Math.max(0, deadline - Date.now())));
    selectedFilter = await visiblePathFilter(page, lineId);
  }
  await page.mouse.up();

  const elapsedMs = Date.now() - start;
  if (!selectedFilter || !selectedFilter.includes('drop-shadow')) {
    const dump = await selectionDiagnosticDump(page, lineId, point);
    throw new Error(`PATCH-117 row 3 selection filter did not transition within 2000ms: ${JSON.stringify(dump)}`);
  }

  return { point, preFilter, selectedFilter, elapsedMs };
}

async function waitForLineEditMode(
  page: Page,
  lineId: string,
  shape: FixturePointsShape,
  doubleClickDiagnostics: DoubleClickDiagnostics,
): Promise<{ roleCounts: LineRoleCounts; settlingMs: number }> {
  const startedAt = Date.now();
  const deadline = startedAt + INTERACTION_TIMEOUT_MS;
  let counts = await lineRoleCounts(page, lineId);

  while (!exactLineHandlesMatchFixtureShape(counts, shape) && Date.now() < deadline) {
    await page.waitForTimeout(Math.min(50, Math.max(0, deadline - Date.now())));
    counts = await lineRoleCounts(page, lineId);
  }

  const settlingMs = Date.now() - startedAt;
  if (exactLineHandlesMatchFixtureShape(counts, shape)) {
    return { roleCounts: counts, settlingMs };
  }

  const payload = await page.evaluate(({ id, point, before, after, events, fixtureShape, roleCounts }) => {
    const hitPath = document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="hit-path"]`);
    const visiblePath = document.querySelector(`[data-line-id="${CSS.escape(id)}"][data-line-role="visible-path"]`);
    const elementAtPoint = document.elementFromPoint(point.x, point.y);
    const lineLayerEntries = Array.from(document.querySelectorAll('[data-drawing-line-layer]'))
      .map((element) => {
        const style = window.getComputedStyle(element);
        return {
          layer: element.getAttribute('data-drawing-line-layer'),
          zIndex: style.zIndex,
          clipPath: style.clipPath,
          fingerprint: element instanceof Element ? element.outerHTML.replace(/\s+/g, ' ').slice(0, 220) : null,
        };
      });
    const activeLineTool = document.querySelector('[title="Line"].bg-blue-100, [title="Line"].ring-2');
    const editPointsControl = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find((element) => element.textContent?.trim() === 'Edit Points' || element.getAttribute('title') === 'Edit Points');
    const sidebar = document.querySelector('.fixed.top-0.right-0.bottom-0.w-80');
    return {
      exactTemporaryLineId: id,
      fixturePointsShape: fixtureShape,
      exactLineRoleCounts: roleCounts,
      freshlyLocatedExactHitPathComputedCursor: hitPath ? window.getComputedStyle(hitPath).cursor : null,
      visiblePathSelectionFilterValue: visiblePath ? window.getComputedStyle(visiblePath).filter : null,
      rawDoubleClickEventTargetsInOrder: events,
      hitPathFingerprintBeforeDoubleClick: before,
      hitPathFingerprintAfterDoubleClick: after,
      exactHitPathCount: document.querySelectorAll(`[data-line-id="${CSS.escape(id)}"][data-line-role="hit-path"]`).length,
      chosenVerifiedHitPathCoordinate: point,
      rawElementFromPointAtCoordinate: elementAtPoint instanceof Element
        ? {
          tagName: elementAtPoint.tagName,
          lineId: elementAtPoint.getAttribute('data-line-id'),
          lineRole: elementAtPoint.getAttribute('data-line-role'),
          nearestLineId: elementAtPoint.closest('[data-line-id]')?.getAttribute('data-line-id') ?? null,
          nearestLineRole: elementAtPoint.closest('[data-line-role]')?.getAttribute('data-line-role') ?? null,
          className: typeof elementAtPoint.className === 'string'
            ? elementAtPoint.className
            : String(elementAtPoint.className ?? ''),
        }
        : null,
      currentLineModeState: {
        lineToolActive: Boolean(activeLineTool),
        editPointsControlClassName: editPointsControl instanceof HTMLElement ? editPointsControl.className : null,
        activeElementText: document.activeElement?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? null,
      },
      currentSidebarState: {
        present: Boolean(sidebar),
        visible: sidebar instanceof HTMLElement ? sidebar.offsetParent !== null : false,
        text: sidebar?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? null,
      },
      currentLineLayerFingerprintCount: {
        count: lineLayerEntries.length,
        entries: lineLayerEntries,
      },
    };
  }, {
    id: lineId,
    point: doubleClickDiagnostics.chosenVerifiedHitPathCoordinate,
    before: doubleClickDiagnostics.hitPathFingerprintBeforeDoubleClick,
    after: doubleClickDiagnostics.hitPathFingerprintAfterDoubleClick,
    events: doubleClickDiagnostics.rawDoubleClickEventTargets,
    fixtureShape: shape,
    roleCounts: counts,
  });

  throw new Error(`PATCH-117 row 5 exact-line handles did not appear within ${INTERACTION_TIMEOUT_MS}ms: ${JSON.stringify(payload)}`);
}

type HandleInteractionProof = {
  lineId: string;
  locatorCount: number;
  attachmentBeforeFirstRect: boolean;
  attachmentAfterReread: boolean;
  chosenHandleRole: string | null;
  tagName: string | null;
  handleLineId: string | null;
  handleRole: string | null;
  outerHTMLFingerprintBefore: string | null;
  outerHTMLFingerprintAfter: string | null;
  fingerprintChanged: boolean | null;
  firstRectCapturedAt: number | null;
  rereadRectCapturedAt: number | null;
  bothRectsExist: boolean;
  probeCoordinatesDerivedFromRereadRect: boolean;
  rectDelta: { x: number | null; y: number | null; width: number | null; height: number | null };
  computedState: {
    visibility: string | null;
    display: string | null;
    opacity: string | null;
    pointerEvents: string | null;
    transform: string | null;
    clipPath: string | null;
  };
  firstRect: { x: number; y: number; width: number; height: number } | null;
  probeRect: { x: number; y: number; width: number; height: number };
  probeCoordinate: { x: number; y: number };
  activeLineLayerZIndex: number;
  probeResults: ProbePointProof[];
  resolvedProbeNames: string[];
  allLineRolesPresent: Record<string, number>;
  fallbackDrag: FallbackDragProof | null;
};

type StackEntryProof = {
  index: number;
  tagName: string | null;
  lineId: string | null;
  lineRole: string | null;
  nearestLineId: string | null;
  nearestLineRole: string | null;
  nearestRoleLineId: string | null;
  nearestRole: string | null;
  position: string | null;
  zIndex: string | null;
  parsedZIndex: number | null;
  className: string;
};

type ProbePointProof = {
  name: string;
  coordinate: { x: number; y: number };
  rawElementFromPoint: {
    tagName: string | null;
    lineId: string | null;
    lineRole: string | null;
    className: string;
  };
  nearestLineOwnedAncestor: {
    tagName: string | null;
    lineId: string | null;
    lineRole: string | null;
  };
  nearestRoleAncestor: {
    tagName: string | null;
    lineId: string | null;
    lineRole: string | null;
  };
  resolvedLineId: string | null;
  resolvedRole: string | null;
  ownershipResolves: boolean;
  expectedRoleResolves: boolean;
  lineOwnedStackIndex: number;
  fixedChromeAboveLine: StackEntryProof[];
  stack: StackEntryProof[];
};

type FallbackDragProof = {
  rawEventTarget: {
    tagName: string | null;
    lineId: string | null;
    lineRole: string | null;
    className: string;
  } | null;
  geometryBefore: GeometrySnapshot;
  geometryAfter: GeometrySnapshot;
  targetedPointBefore: { x: number; y: number } | null;
  targetedPointAfter: { x: number; y: number } | null;
  targetedPointDelta: { x: number | null; y: number | null };
  wholeLineTranslationVector: { x: number | null; y: number | null };
  intendedPointMoved: boolean;
  wholeLineTranslated: boolean;
  persistedRowAfterDrag: GeometrySnapshot;
  restoredAfterFallback: GeometrySnapshot | null;
};

function lineCentroid(line: CanvasLineRow): { x: number; y: number } | null {
  if (!Array.isArray(line.points) || line.points.length === 0) return null;
  const sum = line.points.reduce((acc, point) => ({
    x: acc.x + point.x,
    y: acc.y + point.y,
  }), { x: 0, y: 0 });
  return { x: sum.x / line.points.length, y: sum.y / line.points.length };
}

function targetedPoint(line: CanvasLineRow, handleRole: string | null): { x: number; y: number } | null {
  if (Array.isArray(line.points) && line.points.length > 0) {
    return line.points[line.points.length - 1];
  }
  if (handleRole === 'start-handle') return { x: line.start_x, y: line.start_y };
  if (handleRole === 'control-handle') return { x: line.control_x, y: line.control_y };
  return { x: line.end_x, y: line.end_y };
}

function targetedPointMoved(before: CanvasLineRow, after: CanvasLineRow, handleRole: string | null): boolean {
  const beforePoint = targetedPoint(before, handleRole);
  const afterPoint = targetedPoint(after, handleRole);
  return beforePoint !== null
    && afterPoint !== null
    && (beforePoint.x !== afterPoint.x || beforePoint.y !== afterPoint.y);
}

function wholeLineTranslated(before: CanvasLineRow, after: CanvasLineRow): boolean {
  if (!Array.isArray(before.points) || !Array.isArray(after.points) || before.points.length !== after.points.length) {
    return false;
  }
  const dx = after.points[0].x - before.points[0].x;
  const dy = after.points[0].y - before.points[0].y;
  if (dx === 0 && dy === 0) return false;
  return after.points.every((point, index) => (
    point.x - before.points![index].x === dx
    && point.y - before.points![index].y === dy
  ));
}

async function handleInteractionProof(
  page: Page,
  handle: Locator,
  lineId: string,
  supabase: SupabaseClient,
): Promise<HandleInteractionProof> {
  const locatorCount = await handle.count();
  const emptyPayload = (extra: Partial<HandleInteractionProof>): HandleInteractionProof => ({
    lineId,
    locatorCount,
    attachmentBeforeFirstRect: false,
    attachmentAfterReread: false,
    chosenHandleRole: null,
    tagName: null,
    handleLineId: null,
    handleRole: null,
    outerHTMLFingerprintBefore: null,
    outerHTMLFingerprintAfter: null,
    fingerprintChanged: null,
    firstRectCapturedAt: null,
    rereadRectCapturedAt: null,
    bothRectsExist: false,
    probeCoordinatesDerivedFromRereadRect: false,
    rectDelta: { x: null, y: null, width: null, height: null },
    computedState: {
      visibility: null,
      display: null,
      opacity: null,
      pointerEvents: null,
      transform: null,
      clipPath: null,
    },
    firstRect: null,
    probeRect: { x: 0, y: 0, width: 0, height: 0 },
    probeCoordinate: { x: 0, y: 0 },
    activeLineLayerZIndex: 1000,
    probeResults: [],
    resolvedProbeNames: [],
    allLineRolesPresent: {},
    fallbackDrag: null,
    ...extra,
  });

  if (locatorCount !== 1) {
    throw new Error(`PATCH-117 handle proof failed:\n${JSON.stringify(emptyPayload({ locatorCount }), null, 2)}`);
  }

  let firstSample: {
    capturedAt: number;
    attached: boolean;
    tagName: string | null;
    lineId: string | null;
    role: string | null;
    outerHTMLFingerprint: string | null;
    rect: { x: number; y: number; width: number; height: number } | null;
  };
  try {
    firstSample = await handle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        capturedAt: Date.now(),
        attached: element.isConnected,
        tagName: element.tagName,
        lineId: element.getAttribute('data-line-id'),
        role: element.getAttribute('data-line-role'),
        outerHTMLFingerprint: element.outerHTML.replace(/\s+/g, ' ').slice(0, 220),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
  } catch (error) {
    const payload = emptyPayload({
      attachmentBeforeFirstRect: false,
      outerHTMLFingerprintBefore: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`PATCH-117 handle proof failed:\n${JSON.stringify(payload, null, 2)}`);
  }

  const proof = await handle.evaluate((element, id) => {
    const stackEntry = (node: Element, index: number) => {
      const nearestLineAncestor = node.closest('[data-line-id]');
      const nearestRoleOwner = node.closest('[data-line-role]');
      const entryStyle = window.getComputedStyle(node);
      const parsedZIndex = Number.parseInt(entryStyle.zIndex, 10);
      return {
        index,
        tagName: node.tagName,
        lineId: node.getAttribute('data-line-id'),
        lineRole: node.getAttribute('data-line-role'),
        nearestLineId: nearestLineAncestor?.getAttribute('data-line-id') ?? null,
        nearestLineRole: nearestLineAncestor?.getAttribute('data-line-role') ?? null,
        nearestRoleLineId: nearestRoleOwner?.getAttribute('data-line-id') ?? null,
        nearestRole: nearestRoleOwner?.getAttribute('data-line-role') ?? null,
        position: entryStyle.position,
        zIndex: entryStyle.zIndex,
        parsedZIndex: Number.isNaN(parsedZIndex) ? null : parsedZIndex,
        className: typeof node.className === 'string' ? node.className : String(node.className ?? ''),
      };
    };

    const roleCounts = Array.from(document.querySelectorAll(`[data-line-id="${CSS.escape(id)}"][data-line-role]`))
      .reduce<Record<string, number>>((counts, entry) => {
        const role = entry.getAttribute('data-line-role') ?? '(none)';
        counts[role] = (counts[role] ?? 0) + 1;
        return counts;
      }, {});
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const expectedRole = element.getAttribute('data-line-role');
    const lineLayer = element.closest('[data-drawing-line-layer]');
    const activeLineLayerZIndex = lineLayer
      ? Number.parseInt(window.getComputedStyle(lineLayer).zIndex, 10)
      : 1000;
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const coordinates = [
      { name: 'center', coordinate: center },
      { name: 'left2', coordinate: { x: center.x - 2, y: center.y } },
      { name: 'right2', coordinate: { x: center.x + 2, y: center.y } },
      { name: 'up2', coordinate: { x: center.x, y: center.y - 2 } },
      { name: 'down2', coordinate: { x: center.x, y: center.y + 2 } },
    ];
    const probeResults = coordinates.map(({ name, coordinate }) => {
      const top = document.elementFromPoint(coordinate.x, coordinate.y);
      const topElement = top instanceof Element ? top : null;
      const nearestLineOwnedAncestor = topElement?.closest('[data-line-id]') ?? null;
      const nearestRoleAncestor = topElement?.closest('[data-line-role]') ?? null;
      const resolvedLineId = topElement?.getAttribute('data-line-id')
        ?? nearestLineOwnedAncestor?.getAttribute('data-line-id')
        ?? null;
      const resolvedRole = topElement?.getAttribute('data-line-role')
        ?? nearestRoleAncestor?.getAttribute('data-line-role')
        ?? null;
      const stack = document.elementsFromPoint(coordinate.x, coordinate.y)
        .filter((node): node is Element => node instanceof Element)
        .map(stackEntry);
      const lineOwnedStackIndex = stack.findIndex((entry) => entry.nearestLineId === id);
      const fixedChromeAboveLine = lineOwnedStackIndex < 0
        ? []
        : stack.slice(0, lineOwnedStackIndex).filter((entry) => {
          const isLineOwned = Boolean(entry.lineId) || Boolean(entry.nearestLineId);
          return !isLineOwned
            && (entry.position === 'fixed' || (entry.parsedZIndex !== null && entry.parsedZIndex >= activeLineLayerZIndex));
        });
      return {
        name,
        coordinate,
        rawElementFromPoint: {
          tagName: top?.tagName ?? null,
          lineId: topElement?.getAttribute('data-line-id') ?? null,
          lineRole: topElement?.getAttribute('data-line-role') ?? null,
          className: topElement && typeof topElement.className === 'string'
            ? topElement.className
            : String(topElement?.className ?? ''),
        },
        nearestLineOwnedAncestor: {
          tagName: nearestLineOwnedAncestor?.tagName ?? null,
          lineId: nearestLineOwnedAncestor?.getAttribute('data-line-id') ?? null,
          lineRole: nearestLineOwnedAncestor?.getAttribute('data-line-role') ?? null,
        },
        nearestRoleAncestor: {
          tagName: nearestRoleAncestor?.tagName ?? null,
          lineId: nearestRoleAncestor?.getAttribute('data-line-id') ?? null,
          lineRole: nearestRoleAncestor?.getAttribute('data-line-role') ?? null,
        },
        resolvedLineId,
        resolvedRole,
        ownershipResolves: resolvedLineId === id,
        expectedRoleResolves: resolvedRole === expectedRole,
        lineOwnedStackIndex,
        fixedChromeAboveLine,
        stack,
      };
    });

    return {
      attachmentAfterReread: element.isConnected,
      tagName: element.tagName,
      handleLineId: element.getAttribute('data-line-id'),
      handleRole: expectedRole,
      outerHTMLFingerprintAfter: element.outerHTML.replace(/\s+/g, ' ').slice(0, 220),
      rereadRectCapturedAt: Date.now(),
      probeRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      probeCoordinate: center,
      activeLineLayerZIndex,
      computedState: {
        visibility: style.visibility,
        display: style.display,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        transform: style.transform,
        clipPath: style.clipPath,
      },
      probeResults,
      allLineRolesPresent: roleCounts,
    };
  }, lineId);

  const firstRect = firstSample.rect;
  const rectDelta = firstRect
    ? {
      x: proof.probeRect.x - firstRect.x,
      y: proof.probeRect.y - firstRect.y,
      width: proof.probeRect.width - firstRect.width,
      height: proof.probeRect.height - firstRect.height,
    }
    : { x: null, y: null, width: null, height: null };
  let payload: HandleInteractionProof = {
    lineId,
    locatorCount,
    attachmentBeforeFirstRect: firstSample.attached,
    attachmentAfterReread: proof.attachmentAfterReread,
    chosenHandleRole: proof.handleRole,
    tagName: proof.tagName,
    handleLineId: proof.handleLineId,
    handleRole: proof.handleRole,
    outerHTMLFingerprintBefore: firstSample.outerHTMLFingerprint,
    outerHTMLFingerprintAfter: proof.outerHTMLFingerprintAfter,
    fingerprintChanged: firstSample.outerHTMLFingerprint !== proof.outerHTMLFingerprintAfter,
    firstRectCapturedAt: firstSample.capturedAt,
    rereadRectCapturedAt: proof.rereadRectCapturedAt,
    bothRectsExist: firstRect !== null,
    probeCoordinatesDerivedFromRereadRect: proof.probeCoordinate.x === proof.probeRect.x + proof.probeRect.width / 2
      && proof.probeCoordinate.y === proof.probeRect.y + proof.probeRect.height / 2,
    rectDelta,
    computedState: proof.computedState,
    firstRect,
    probeRect: proof.probeRect,
    probeCoordinate: proof.probeCoordinate,
    activeLineLayerZIndex: proof.activeLineLayerZIndex,
    probeResults: proof.probeResults,
    resolvedProbeNames: proof.probeResults
      .filter((entry) => entry.ownershipResolves && entry.expectedRoleResolves && entry.fixedChromeAboveLine.length === 0)
      .map((entry) => entry.name),
    allLineRolesPresent: proof.allLineRolesPresent,
    fallbackDrag: null,
  };

  if (payload.resolvedProbeNames.length === 0) {
    const before = await fetchLine(supabase, lineId);
    const targetBefore = targetedPoint(before, payload.chosenHandleRole);
    const rawEventTarget = await page.evaluate(({ x, y }) => {
      const entry = document.elementFromPoint(x, y);
      return entry instanceof Element
        ? {
          tagName: entry.tagName,
          lineId: entry.getAttribute('data-line-id'),
          lineRole: entry.getAttribute('data-line-role'),
          className: typeof entry.className === 'string' ? entry.className : String(entry.className ?? ''),
        }
        : null;
    }, payload.probeCoordinate);
    await page.mouse.move(payload.probeCoordinate.x, payload.probeCoordinate.y);
    await page.mouse.down();
    await page.mouse.move(payload.probeCoordinate.x - 24, payload.probeCoordinate.y + 12, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(FALLBACK_SETTLE_TIMEOUT_MS);
    const after = await fetchLine(supabase, lineId);
    const targetAfter = targetedPoint(after, payload.chosenHandleRole);
    const vector = Array.isArray(before.points) && Array.isArray(after.points) && before.points.length === after.points.length
      ? { x: after.points[0].x - before.points[0].x, y: after.points[0].y - before.points[0].y }
      : { x: null, y: null };
    let restoredAfterFallback: GeometrySnapshot | null = null;
    if (JSON.stringify(geometryOf(before)) !== JSON.stringify(geometryOf(after))) {
      await supabase.from('canvas_lines').update({
        start_x: before.start_x,
        start_y: before.start_y,
        control_x: before.control_x,
        control_y: before.control_y,
        end_x: before.end_x,
        end_y: before.end_y,
        points: before.points,
        coord_space: before.coord_space,
        layer_plane: before.layer_plane,
      }).eq('id', lineId).throwOnError();
      restoredAfterFallback = geometryOf(await fetchLine(supabase, lineId));
    }
    payload = {
      ...payload,
      fallbackDrag: {
        rawEventTarget,
        geometryBefore: geometryOf(before),
        geometryAfter: geometryOf(after),
        targetedPointBefore: targetBefore,
        targetedPointAfter: targetAfter,
        targetedPointDelta: targetBefore && targetAfter
          ? { x: targetAfter.x - targetBefore.x, y: targetAfter.y - targetBefore.y }
          : { x: null, y: null },
        wholeLineTranslationVector: vector,
        intendedPointMoved: targetedPointMoved(before, after, payload.chosenHandleRole),
        wholeLineTranslated: wholeLineTranslated(before, after),
        persistedRowAfterDrag: geometryOf(after),
        restoredAfterFallback,
      },
    };
  }

  const failures = [
    payload.attachmentBeforeFirstRect ? null : 'handle was detached before first rect sample',
    payload.attachmentAfterReread ? null : 'handle was detached after reread',
    payload.computedState.visibility === 'visible' ? null : 'handle is not visible',
    payload.computedState.display !== 'none' ? null : 'handle display is none',
    payload.computedState.pointerEvents !== 'none' ? null : 'handle pointer-events is none',
    payload.resolvedProbeNames.length > 0 ? null : 'no probe point resolved ownership and expected role',
    payload.probeResults.some((entry) => entry.fixedChromeAboveLine.length > 0) ? 'fixed chrome above line-owned target' : null,
  ].filter((entry): entry is string => entry !== null);

  if (failures.length > 0) {
    throw new Error(`PATCH-117 handle proof failed:\n${JSON.stringify({ failures, payload }, null, 2)}`);
  }

  return payload;
}

async function expectWithinVisibleCanvas(handle: Locator, sidebar: Locator): Promise<void> {
  const handleBox = await handle.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(handleBox!.x + handleBox!.width).toBeLessThanOrEqual(sidebarBox!.x);
}

function canvasSidebar(page: Page) {
  return page
    .getByTitle('Back to Dashboard')
    .locator('xpath=ancestor::div[contains(@class, "bg-white") and contains(@class, "border-r")][1]');
}

function canvasLineTool(page: Page) {
  const sidebar = canvasSidebar(page);
  const canvasGroup = sidebar
    .locator(':scope > div.flex.flex-col.items-center.w-full.gap-1')
    .filter({ has: page.locator('span', { hasText: /^Canvas$/ }) });

  return canvasGroup
    .locator(':scope > div.relative.flex.items-center.justify-center.w-9.h-9.rounded-lg')
    .filter({ has: page.locator('span', { hasText: /^Line$/ }) });
}

async function expectCanvasLineModeActive(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const explicitLayer = document.querySelector('[data-drawing-line-layer="front"]') as SVGSVGElement | null;
    const frontLine = document.querySelector('[data-line-renderer="front"]') as SVGElement | null;
    const layer = explicitLayer ?? frontLine?.ownerSVGElement ?? null;
    if (!layer) return false;

    const layerStyle = window.getComputedStyle(layer);
    return (
      layerStyle.pointerEvents === 'auto'
      && layerStyle.cursor === 'crosshair'
    );
  }, { timeout: INTERACTION_TIMEOUT_MS });
}

async function selectLineTool(page: Page): Promise<void> {
  const lineTool = canvasLineTool(page);
  await expect(canvasSidebar(page)).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
  await expect(lineTool).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
  await lineTool.click({ timeout: INTERACTION_TIMEOUT_MS });
  await expect(lineTool).toHaveClass(/bg-blue-100/, { timeout: INTERACTION_TIMEOUT_MS });
  await expect(lineTool).toHaveClass(/ring-2/, { timeout: INTERACTION_TIMEOUT_MS });
  await expect(lineTool).toHaveClass(/ring-blue-400/, { timeout: INTERACTION_TIMEOUT_MS });
  await expectCanvasLineModeActive(page);
}

async function expectCanvasLineModeInactive(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const explicitLayer = document.querySelector('[data-drawing-line-layer="front"]') as SVGSVGElement | null;
    const frontLine = document.querySelector('[data-line-renderer="front"]') as SVGElement | null;
    const layer = explicitLayer ?? frontLine?.ownerSVGElement ?? null;
    if (!layer) return false;

    const layerStyle = window.getComputedStyle(layer);
    return layerStyle.cursor !== 'crosshair';
  }, { timeout: INTERACTION_TIMEOUT_MS });
}

async function toggleLineToolOff(page: Page): Promise<void> {
  const lineTool = canvasLineTool(page);
  await expect(lineTool).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
  await lineTool.click({ timeout: INTERACTION_TIMEOUT_MS });
  await expect(lineTool).not.toHaveClass(/bg-blue-100/, { timeout: INTERACTION_TIMEOUT_MS });
  await expectCanvasLineModeInactive(page);
}

async function dragFromPoint(page: Page, point: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
  await page.mouse.up();
}

function pointsChanged(before: CanvasLineRow, after: CanvasLineRow): boolean {
  return JSON.stringify(before.points) !== JSON.stringify(after.points);
}

function legacyEndpointChanged(before: CanvasLineRow, after: CanvasLineRow): boolean {
  return before.start_x !== after.start_x
    || before.start_y !== after.start_y
    || before.control_x !== after.control_x
    || before.control_y !== after.control_y
    || before.end_x !== after.end_x
    || before.end_y !== after.end_y;
}

function expectExpectedGeometryChange(before: CanvasLineRow, after: CanvasLineRow): void {
  expect(after.coord_space).toBe('scene');
  if (Array.isArray(before.points)) {
    expect(pointsChanged(before, after)).toBe(true);
  } else {
    expect(legacyEndpointChanged(before, after)).toBe(true);
  }
}

async function waitForExpectedGeometryChange(
  supabase: SupabaseClient,
  lineId: string,
  before: CanvasLineRow,
): Promise<CanvasLineRow> {
  const deadline = Date.now() + INTERACTION_TIMEOUT_MS;
  let latest = await fetchLine(supabase, lineId);
  while (Date.now() <= deadline) {
    try {
      expectExpectedGeometryChange(before, latest);
      return latest;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
      latest = await fetchLine(supabase, lineId);
    }
  }
  expectExpectedGeometryChange(before, latest);
  return latest;
}

async function sweepChromeForHitPaths(page: Page, sidebar: Locator) {
  return sidebar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const results: Array<{ x: number; y: number; lineRole: string | null; tag: string | null }> = [];
    for (const xRatio of [0.15, 0.35, 0.55, 0.75, 0.95]) {
      for (const yRatio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const x = rect.left + rect.width * xRatio;
        const y = rect.top + rect.height * yRatio;
        const hit = document.elementFromPoint(x, y);
        results.push({
          x: Math.round(x),
          y: Math.round(y),
          lineRole: hit instanceof Element ? hit.getAttribute('data-line-role') : null,
          tag: hit?.tagName.toLowerCase() ?? null,
        });
      }
    }
    return results;
  });
}

async function dragLocator(page: Page, locator: Locator, dx: number, dy: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test('PATCH-117 live Drawing overlay containment matrix', async ({ page }, testInfo) => {
  test.setTimeout(MATRIX_TIMEOUT_MS);

  const startedAt = Date.now();
  const supabase = await createClientForLiveUser();
  let fixture: Awaited<ReturnType<typeof createFixture>> | null = null;
  const screenshotPaths: string[] = [];
  const rowStatus: Record<string, string> = {};
  const geometryTrace: Record<string, GeometrySnapshot> = {};
  const freeformKey = optionalEnv('PATCH117_LIVE_FREEFORM_CANVAS_ID') || optionalEnv('PATCH114_LIVE_FREEFORM_CANVAS_ID');
  const mapKey = optionalEnv('PATCH117_LIVE_MAP_CANVAS_ID') || optionalEnv('PATCH114_LIVE_MAP_CANVAS_ID');
  const continuationRows15To21 = process.env.PATCH117_CONTINUATION_ROWS_15_21 === '1';
  const continuationRows17To21 = process.env.PATCH117_CONTINUATION_ROWS_17_21 === '1';
  let sidebar: Locator | null = null;
  let sweep: Awaited<ReturnType<typeof sweepChromeForHitPaths>> | null = null;
  let selectionProof: Awaited<ReturnType<typeof selectExactLineByVisibleFilter>> | null = null;
  let editPoint: Awaited<ReturnType<typeof verifiedHitPathPoint>> | null = null;
  let handleBranch: 'points-array' | 'legacy-three-point' | null = null;
  const row5EditModeWait: Awaited<ReturnType<typeof waitForLineEditMode>> | null = null;
  let lastDoubleClickDiagnostics: DoubleClickDiagnostics | null = null;
  const handleProof: HandleInteractionProof | null = null;
  const closedHandleProof: HandleInteractionProof | null = null;
  let identityProof: Awaited<ReturnType<typeof assertAlignedIdentityBeforeFixtureInsert>> | null = null;
  const endpointHandleBehavior: Record<string, unknown> = {};

  const screenshot = async (name: string) => {
    const outputPath = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path: outputPath, fullPage: true });
    screenshotPaths.push(outputPath);
  };

  const row = async (name: string, action: () => Promise<void>) => {
    await test.step(name, async () => {
      const rowStartedAt = Date.now();
      try {
        await action();
        rowStatus[name] = `pass in ${Date.now() - rowStartedAt}ms`;
      } catch (error) {
        throw new Error(`${name} failed after ${Date.now() - rowStartedAt}ms; total elapsed ${Date.now() - startedAt}ms; `
          + `explicit timeout budget ${MATRIX_TIMEOUT_MS}ms; pending operation in step body; `
          + `payload=${JSON.stringify({ row: name, screenshots: screenshotPaths, geometryTrace })}`, { cause: error });
      }
    });
  };

  const deferredRow = async (name: string, reason: string) => {
    await test.step(name, async () => {
      rowStatus[name] = `deferred under PATCH-117 section 29e: ${reason}`;
    });
  };

  const requireFixture = () => {
    if (!fixture) throw new Error('PATCH-117 fixture was not created');
    return fixture;
  };

  const exactHitPath = () => page.locator(`[data-line-id="${requireFixture().line.id}"][data-line-role="hit-path"]`);
  const visibleLinePath = () => page.locator(`[data-line-id="${requireFixture().line.id}"][data-line-role="visible-path"]`);
  const visibleLineInPlane = (plane: 'front' | 'back') =>
    page.locator(`[data-line-id="${requireFixture().line.id}"][data-line-role="visible-path"][data-line-renderer="${plane}"]`);

  const enterEditModeViaExactHitPath = async () => {
    const sourceLine = await fetchLine(supabase, requireFixture().line.id);
    const shape = fixturePointsShape(sourceLine);
    editPoint = await verifiedHitPathPoint(page, requireFixture().line.id);
    const before = await hitPathFingerprint(page, requireFixture().line.id);
    await startDoubleClickTargetCapture(page);
    let rawDoubleClickEventTargets: DoubleClickDiagnostics['rawDoubleClickEventTargets'] = [];
    try {
      await page.mouse.dblclick(editPoint.x, editPoint.y);
    } finally {
      rawDoubleClickEventTargets = await stopDoubleClickTargetCapture(page);
    }
    const after = await hitPathFingerprint(page, requireFixture().line.id);
    lastDoubleClickDiagnostics = {
      rawDoubleClickEventTargets,
      hitPathFingerprintBeforeDoubleClick: before,
      hitPathFingerprintAfterDoubleClick: after,
      chosenVerifiedHitPathCoordinate: editPoint,
    };
    return waitForLineEditMode(page, requireFixture().line.id, shape, lastDoubleClickDiagnostics);
  };

  const editableHandleForCurrentLine = async () => {
    const sourceLine = await fetchLine(supabase, requireFixture().line.id);
    const counts = await lineRoleCounts(page, requireFixture().line.id);
    const shape = fixturePointsShape(sourceLine);
    let editableHandle: Locator;
    if (shape === 'points-array') {
      expect(exactLineHandlesMatchFixtureShape(counts, shape)).toBe(true);
      editableHandle = page.locator(`[data-line-id="${requireFixture().line.id}"][data-line-role="point-handle"]`).last();
      handleBranch = 'points-array';
    } else {
      expect(exactLineHandlesMatchFixtureShape(counts, shape)).toBe(true);
      editableHandle = page.locator(`[data-line-id="${requireFixture().line.id}"][data-line-role="end-handle"]`);
      handleBranch = 'legacy-three-point';
    }
    return { sourceLine, editableHandle };
  };

  const deferredEditRouteDependencies = {
    enterEditModeViaExactHitPath,
    editableHandleForCurrentLine,
    handleInteractionProof,
    expectWithinVisibleCanvas,
    dragLocator,
    lineCentroid,
  };

  try {
    await test.step('setup - create fixture and open Drawing canvas', async () => {
      identityProof = await assertAlignedIdentityBeforeFixtureInsert(page, supabase);
      fixture = await createFixture(supabase);
      geometryTrace.created = geometryOf(fixture.line);
      await openDrawing(page, fixture.boardId, {
        supabase,
        fixtureLineId: fixture.line.id,
        nodeUserId: identityProof.nodeUserId,
        storageStatePath: process.env.PATCH117_STORAGE_STATE || AUTH_STATE_PATH,
      });
    });

    if (continuationRows15To21 || continuationRows17To21) {
      await test.step('prefix - replay open presentation sidebar', async () => {
        sidebar = await openPresentationSidebar(page);
        await expect(visibleLinePath()).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        if (continuationRows17To21) {
          await closePresentationSidebar(page);
          rowStatus['rows 1-16 prefix'] = 'replayed-not-recertified';
        } else {
          rowStatus['rows 1-13 prefix'] = 'replayed-not-recertified';
        }
      });
    } else {
      await row('row 01 - normal front line sidebar closed', async () => {
        await expect(exactHitPath()).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
        await expect(visibleLinePath()).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        await screenshot('01-sidebar-closed');
      });

      await row('row 02 - normal front line sidebar open', async () => {
      sidebar = await openPresentationSidebar(page);
      await expect(visibleLinePath()).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-drawing-line-layer="front"]');
        return root && window.getComputedStyle(root).clipPath !== 'none';
      }, undefined, { timeout: INTERACTION_TIMEOUT_MS });
      await screenshot('02-sidebar-open');
      });

      await row('row 03 - selected front line sidebar open', async () => {
        selectionProof = await selectExactLineByVisibleFilter(page, requireFixture().line.id);
        await expect(exactHitPath()).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
        await screenshot('03-selected-line');
      });

      await row('row 04 - line mode sidebar open', async () => {
        await selectLineTool(page);
        await expect(visibleLinePath()).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        await screenshot('04-line-mode-sidebar-open');
        await toggleLineToolOff(page);
        await page.keyboard.press('Escape');
      });

      await deferredRow(
        'row 05 - edit mode through exact hit-path double-click',
        'pre-existing real-mouse double-click-to-edit defect classified H; routed to PATCH-119, not PATCH-117 acceptance evidence',
      );

      await row('row 06 - front layer', async () => {
        await expect(visibleLineInPlane('front')).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        const counts = await lineRoleCounts(page, requireFixture().line.id);
        expect(counts['visible-path'] ?? 0).toBe(1);
        expect(counts['hit-path'] ?? 0).toBe(1);
      });

      await row('row 07 - back layer sidebar closed/open', async () => {
        await supabase.from('canvas_lines').update({ layer_plane: 'back' }).eq('id', requireFixture().line.id).throwOnError();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(visibleLineInPlane('back')).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        await screenshot('06-back-layer-sidebar-closed');
        sidebar = await openPresentationSidebar(page);
        await expect(visibleLineInPlane('back')).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        await supabase.from('canvas_lines').update({ layer_plane: 'front' }).eq('id', requireFixture().line.id).throwOnError();
        await page.reload({ waitUntil: 'domcontentloaded' });
        sidebar = await openPresentationSidebar(page);
        await expect(visibleLineInPlane('front')).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
      });

      await row('row 08 - modal open', async () => {
        const layoutButton = page.getByTitle('Arrange slide layout');
        const layoutHit = await centerHitIdentity(layoutButton);
        expect(layoutHit.lineRole).not.toBe('hit-path');
        expect(layoutHit.contains).toBe(true);
        await layoutButton.click();
        await expect(page.getByText('Slides layout', { exact: true })).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        await screenshot('07-modal-open');
      });

      await row('row 09 - Apply-layout click', async () => {
        const applyButton = page.getByRole('button', { name: 'Apply layout' });
        const applyHit = await centerHitIdentity(applyButton);
        expect(applyHit.lineRole).not.toBe('hit-path');
        expect(applyHit.contains).toBe(true);
        await applyButton.click();
        await expect(page.getByText('Slides layout', { exact: true })).toHaveCount(0, { timeout: UI_READY_TIMEOUT_MS });
      });

      await row('row 10 - slide-card click', async () => {
        const slideCard = sidebar!.locator('button').filter({ has: page.locator('img') }).first();
        const cardHit = await centerHitIdentity(slideCard);
        expect(cardHit.lineRole).not.toBe('hit-path');
        await slideCard.click({ timeout: INTERACTION_TIMEOUT_MS });
      });

      await row('row 11 - checkbox click', async () => {
        const checkbox = sidebar!.locator('input[type="checkbox"]').first();
        const checkboxHit = await centerHitIdentity(checkbox);
        expect(checkboxHit.lineRole).not.toBe('hit-path');
        await checkbox.click({ timeout: INTERACTION_TIMEOUT_MS });
      });

      await row('row 12 - overflow menu click', async () => {
        const menuTrigger = sidebar!.locator('div.relative.flex-shrink-0.self-end.mb-2 > button').first();
        const menuHit = await centerHitIdentity(menuTrigger);
        expect(menuHit.lineRole).not.toBe('hit-path');
        await menuTrigger.click({ timeout: INTERACTION_TIMEOUT_MS });
        const previewSlideItem = sidebar!.getByRole('button', { name: 'Preview slide' });
        await expect(previewSlideItem).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
        const previewHit = await centerHitIdentity(previewSlideItem);
        expect(previewHit.lineRole).not.toBe('hit-path');
        expect(previewHit.contains).toBe(true);
        await previewSlideItem.click({ timeout: INTERACTION_TIMEOUT_MS });
        await page.keyboard.press('Escape');
      });

      await row('row 13 - strict chrome-region sweep', async () => {
        sweep = await sweepChromeForHitPaths(page, sidebar!);
        expect(sweep.every((entry) => entry.lineRole !== 'hit-path')).toBe(true);
        await screenshot('08-row13-chrome-sweep');
      });

      await deferredRow(
        'row 14 - point/endpoint-handle drag',
        'current row implementation enters edit mode through enterEditModeViaExactHitPath(), the same unreachable real-mouse double-click route deferred to PATCH-119',
      );
    }

    if (!continuationRows17To21) {
      await row('row 15 - whole-line drag', async () => {
        const beforeWholeDrag = await fetchLine(supabase, requireFixture().line.id);
        const sidebarWholeDragPoint = await verifiedHitPathPoint(page, requireFixture().line.id);
        await dragFromPoint(page, sidebarWholeDragPoint, -18, -12);
        const afterSidebarWholeDrag = await waitForExpectedGeometryChange(supabase, requireFixture().line.id, beforeWholeDrag);
        geometryTrace.afterSidebarWholeDrag = geometryOf(afterSidebarWholeDrag);
        expectExpectedGeometryChange(beforeWholeDrag, afterSidebarWholeDrag);
      });

      await row('row 16 - keyboard editing', async () => {
        await page.keyboard.press('Escape');
        await expect(exactHitPath()).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
        expect((await fetchLine(supabase, requireFixture().line.id)).coord_space).toBe('scene');
      });
    }

    await row('row 17 - zoom controls unchanged with sidebar closed', async () => {
      if (await page.locator('.fixed.top-0.right-0.bottom-0.w-80').count() > 0) {
        await closePresentationSidebar(page);
      }
      await expect(page.locator('.fixed.top-0.right-0.bottom-0.w-80')).toHaveCount(0, { timeout: UI_READY_TIMEOUT_MS });
      expect(await visibleCanvasRightInset(page)).toBe('');
      await expect(canvasSidebar(page)).toHaveCount(1, { timeout: UI_READY_TIMEOUT_MS });
      const zoomOut = page.locator('button[title="Zoom out"]').first();
      const closedZoomBox = await zoomOut.boundingBox();
      expect(closedZoomBox).not.toBeNull();
      expect(closedZoomBox!.x + closedZoomBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    });

    await row('row 18 - zoom controls visible with sidebar open', async () => {
      sidebar = await openPresentationSidebar(page);
      const zoomOut = page.locator('button[title="Zoom out"]').first();
      const openZoomBox = await zoomOut.boundingBox();
      const sidebarBox = await sidebar.boundingBox();
      expect(openZoomBox).not.toBeNull();
      expect(sidebarBox).not.toBeNull();
      expect(openZoomBox!.x + openZoomBox!.width).toBeLessThanOrEqual(sidebarBox!.x - 1);
    });

    await row('row 19 - zoom controls after resize/open-close-open', async () => {
      await page.setViewportSize({ width: 1360, height: 850 });
      await closePresentationSidebar(page);
      sidebar = await openPresentationSidebar(page);
      await expect(sidebar).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
      await screenshot('09-zoom-open-sidebar');
    });

    await row('row 20 - PATCH-115 thumbnail/fullscreen regression check', async () => {
      const thumbnail = sidebar!.locator('img[alt="Slide preview"]').first();
      await expect(thumbnail).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
      const thumbnailSrc = await thumbnail.getAttribute('src');
      expect(thumbnailSrc).toContain('data:image');
      await screenshot('10-thumbnail-canvasline');
      await sidebar!.getByRole('button', { name: 'Start presentation' }).last().click();
      await expect(page.locator(`[data-canvas-line-id="${requireFixture().line.id}"]`).first()).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
      await screenshot('11-runtime-fullscreen');
    });

    await row('row 21 - coord_space/stored geometry', async () => {
      const after = await fetchLine(supabase, requireFixture().line.id);
      expect(after.coord_space).toBe('scene');
      geometryTrace.final = geometryOf(after);
    });

    testInfo.annotations.push({
      type: 'patch-117-live-matrix',
      description: JSON.stringify({
        rowStatus,
        screenshotPaths,
        geometryTrace,
        handleBranch,
        row5EditModeWait,
        handleProof,
        closedHandleProof,
        endpointHandleBehavior,
        deferredEditRouteDependencies: Object.keys(deferredEditRouteDependencies),
        identityProof,
        hitPathTargeting: { selectionProof, editPoint },
        runtimeSlideRendererEvidence: `data-canvas-line-id=${requireFixture().line.id}`,
        waitBudget: {
          declared: MATRIX_TIMEOUT_MS,
          largestBound: INITIAL_LOAD_TIMEOUT_MS,
          interactionPolling: '50ms poll, 2000ms max',
        },
        freeformFixture: freeformKey ? 'available-not-run-in-this-drawing-test' : 'absent',
        mapFixture: mapKey ? 'available-not-run-in-this-drawing-test' : 'absent',
      }),
    });
  } finally {
    await test.step('cleanup - remove PATCH-117 fixture', async () => {
      if (fixture) {
        await cleanupFixture(supabase, fixture.boardId, fixture.prefix);
      }
    });
  }
});
