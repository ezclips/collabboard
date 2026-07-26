import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

type CanvasLineRow = {
  id: string;
  board_id: string;
  start_x: number;
  start_y: number;
  control_x: number;
  control_y: number;
  end_x: number;
  end_y: number;
  points: Array<{ x: number; y: number; type?: string; lng?: number; lat?: number }> | null;
  coord_space?: 'scene' | null;
  layer_plane: 'front' | 'back' | null;
  color: string | null;
  stroke_width: number | null;
  start_arrow: boolean | null;
  end_arrow: boolean | null;
  dashed: boolean | null;
  label: string | null;
  label_position: number | null;
  label_text_color: string | null;
  label_background_color: string | null;
  z_index: number | null;
};

type Viewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
  originOffsetX: number;
  originOffsetY: number;
};

type LinePathBox = { x: number; y: number; width: number; height: number };

const execFileAsync = promisify(execFile);
const BASE_URL = requiredEnv('PW_BASE_URL');
const LIVE_LOGIN_TIMEOUT_MS = 120_000;
const DRAWING_CANVAS_ID_ENV = 'PATCH114_LIVE_DRAWING_CANVAS_ID';
const LEGACY_LINE_ID_ENV = 'PATCH114_LIVE_LEGACY_LINE_ID';
const FREEFORM_CANVAS_ID_ENV = 'PATCH114_LIVE_FREEFORM_CANVAS_ID';
const MAP_CANVAS_ID_ENV = 'PATCH114_LIVE_MAP_CANVAS_ID';

type PageDiagnostics = {
  consoleMessages: string[];
  failedRequests: string[];
};

type DrawingReadinessSnapshot = {
  url: string;
  title: string;
  expectedCanvasIdPresent: boolean;
  counts: {
    excalidrawRoot: number;
    excalidrawCanvas: number;
    interactiveCanvas: number;
    explicitDrawingLineLayer: number;
    frontLineRenderer: number;
    resolvedFrontLineLayer: number;
    lineTool: number;
    dashboardButton: number;
  };
  visibleStateText: string[];
  consoleMessages: string[];
  failedRequests: string[];
};

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
  if (!value) throw new Error(`${key} is required for PATCH-114 live characterization`);
  return value;
}

function optionalEnv(key: string): string {
  return process.env[key] || readEnvLocal(key);
}

async function createLiveClient(): Promise<SupabaseClient> {
  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: requiredEnv('LIVE_ACCESS_EMAIL'),
    password: requiredEnv('LIVE_ACCESS_PASSWORD'),
  });
  if (error) throw error;
  return supabase;
}

async function createLivePage(browser: Browser, storageStatePath: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1600, height: 1000 },
  });
  return context.newPage();
}

async function loginToScratchState(scratchDir: string): Promise<string> {
  const statePath = path.join(scratchDir, 'state.json');
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync(
      'node',
      ['scripts/live-access-login.mjs', statePath, BASE_URL],
      {
        cwd: process.cwd(),
        windowsHide: true,
        timeout: LIVE_LOGIN_TIMEOUT_MS,
        killSignal: 'SIGTERM',
      },
    ));
  } catch (error) {
    if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
    throw error;
  }
  const result = JSON.parse(stdout.trim()) as { ok?: boolean; statePath?: string };
  if (result.ok !== true || result.statePath !== statePath) {
    throw new Error('PATCH-114 live login did not produce the requested scratch storage state');
  }
  return statePath;
}

async function openCanvas(page: Page, canvasId: string): Promise<void> {
  await page.goto(`${BASE_URL}/dashboard/canvas/${canvasId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTitle('Back to Dashboard').waitFor({ timeout: 90_000 });
}

function attachPageDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleMessages: [],
    failedRequests: [],
  };

  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    diagnostics.consoleMessages.push(`${message.type()}: ${message.text().slice(0, 500)}`);
  });
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown failure'}`);
  });

  return diagnostics;
}

async function drawingReadinessSnapshot(
  page: Page,
  canvasId: string,
  diagnostics: PageDiagnostics,
): Promise<DrawingReadinessSnapshot> {
  return page.evaluate(({ expectedCanvasId, consoleMessages, failedRequests }) => {
    const frontLine = document.querySelector<SVGElement>('[data-line-renderer="front"]');
    const visibleStateText = Array.from(document.querySelectorAll('[role="alert"], [aria-live], [data-state]'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => /error|failed|loading|not found|unauthorized/i.test(text))
      .slice(0, 10);

    return {
      url: window.location.href,
      title: document.title,
      expectedCanvasIdPresent: window.location.href.includes(expectedCanvasId),
      counts: {
        excalidrawRoot: document.querySelectorAll('.excalidraw').length,
        excalidrawCanvas: document.querySelectorAll('canvas.excalidraw__canvas').length,
        interactiveCanvas: document.querySelectorAll('canvas.excalidraw__canvas.interactive').length,
        explicitDrawingLineLayer: document.querySelectorAll('[data-drawing-line-layer="front"]').length,
        frontLineRenderer: document.querySelectorAll('[data-line-renderer="front"]').length,
        resolvedFrontLineLayer: frontLine?.ownerSVGElement ? 1 : 0,
        lineTool: document.querySelectorAll('[data-testid="toolbar-line"]').length,
        dashboardButton: document.querySelectorAll('[title="Back to Dashboard"]').length,
      },
      visibleStateText,
      consoleMessages,
      failedRequests,
    };
  }, {
    expectedCanvasId: canvasId,
    consoleMessages: diagnostics.consoleMessages.slice(-20),
    failedRequests: diagnostics.failedRequests.slice(-20),
  });
}

async function ensureDrawingReady(page: Page, canvasId: string, diagnostics: PageDiagnostics): Promise<void> {
  try {
    await page.waitForFunction((expectedCanvasId) => {
      const frontLine = document.querySelector<SVGElement>('[data-line-renderer="front"]');
      return (
        window.location.href.includes(expectedCanvasId)
        && document.querySelectorAll('.excalidraw').length > 0
        && document.querySelectorAll('canvas.excalidraw__canvas.interactive').length > 0
        && document.querySelectorAll('[data-testid="toolbar-line"]').length > 0
        && (
          document.querySelectorAll('[data-drawing-line-layer="front"]').length > 0
          || Boolean(frontLine?.ownerSVGElement)
        )
      );
    }, canvasId, { timeout: 90_000 });
  } catch (error) {
    const snapshot = await drawingReadinessSnapshot(page, canvasId, diagnostics);
    throw new Error(`Drawing readiness failed: ${JSON.stringify(snapshot)}`, { cause: error });
  }
}

async function readDrawingViewport(page: Page): Promise<Viewport> {
  return page.evaluate(() => {
    const app = document.querySelector('.excalidraw') as HTMLElement | null;
    const canvas = document.querySelector('canvas.excalidraw__canvas') as HTMLCanvasElement | null;
    const explicitLayer = document.querySelector('[data-drawing-line-layer="front"]') as SVGSVGElement | null;
    const frontLine = document.querySelector('[data-line-renderer="front"]') as SVGElement | null;
    const layer = explicitLayer ?? frontLine?.ownerSVGElement ?? null;
    if (!canvas || !layer) throw new Error('Drawing canvas or line layer missing');
    const canvasRect = canvas.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const appState = (window as Window & typeof globalThis & {
      __patch114AppState?: { zoom?: { value?: number }; scrollX?: number; scrollY?: number };
    }).__patch114AppState;
    const zoomText = app?.querySelector('[data-testid="zoom"]')?.textContent ?? '';
    const parsedZoom = Number(zoomText.replace('%', '')) / 100;
    const sceneGroupTransform = document
      .querySelector('[data-line-coordinate-space="scene"]')
      ?.getAttribute('transform');
    const transformMatch = sceneGroupTransform?.match(/translate\(([^,]+), ([^)]+)\) scale\(([^)]+)\)/);
    const transformTranslateX = transformMatch ? Number(transformMatch[1]) : undefined;
    const transformTranslateY = transformMatch ? Number(transformMatch[2]) : undefined;
    const transformZoom = transformMatch ? Number(transformMatch[3]) : undefined;
    const zoom = appState?.zoom?.value ?? transformZoom ?? (parsedZoom || 1);
    const originOffsetX = canvasRect.left - layerRect.left;
    const originOffsetY = canvasRect.top - layerRect.top;
    return {
      zoom,
      scrollX: appState?.scrollX ?? (transformTranslateX === undefined ? 0 : (transformTranslateX - originOffsetX) / zoom),
      scrollY: appState?.scrollY ?? (transformTranslateY === undefined ? 0 : (transformTranslateY - originOffsetY) / zoom),
      originOffsetX,
      originOffsetY,
    };
  });
}

async function installAppStateProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.addEventListener('message', () => undefined);
  });
  await page.evaluate(() => {
    const targetWindow = window as Window & typeof globalThis & {
      __patch114AppState?: unknown;
    };
    const originalConsoleDebug = console.debug.bind(console);
    console.debug = (...args: unknown[]) => {
      const payload = args.find((arg): arg is Record<string, unknown> => typeof arg === 'object' && arg !== null);
      if (payload && payload.phase === 'drawing-viewport') {
        targetWindow.__patch114AppState = payload;
      }
      originalConsoleDebug(...args);
    };
  });
}

async function setViewportByWheel(page: Page, zoomSteps: number, pan: { dx: number; dy: number }): Promise<void> {
  const canvas = page.locator('canvas.excalidraw__canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  if (zoomSteps !== 0) {
    await page.keyboard.down(modifier);
    for (let i = 0; i < Math.abs(zoomSteps); i += 1) {
      await page.mouse.wheel(0, zoomSteps > 0 ? -240 : 240);
    }
    await page.keyboard.up(modifier);
  }
  if (pan.dx !== 0 || pan.dy !== 0) {
    await page.mouse.wheel(pan.dx, pan.dy);
  }
  await page.waitForTimeout(600);
}

async function linePathBox(page: Page, lineId: string) {
  const box = await page.locator(`[data-line-id="${lineId}"][data-line-role="visible-path"]`).first().boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function renderedLineEndpointLayerPoints(page: Page, lineId: string) {
  return page.evaluate((id) => {
    const path = document.querySelector(`[data-line-id="${id}"][data-line-role="visible-path"]`) as SVGGeometryElement | null;
    if (!path) throw new Error(`Line path ${id} not found`);
    const svg = path.ownerSVGElement;
    const matrix = path.getScreenCTM();
    if (!svg || !matrix) throw new Error(`Line path ${id} has no SVG transform matrix`);
    const layerRect = svg.getBoundingClientRect();
    const toLayerPoint = (point: DOMPointInit) => {
      const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return {
        x: screenPoint.x - layerRect.left,
        y: screenPoint.y - layerRect.top,
      };
    };

    return {
      start: toLayerPoint(path.getPointAtLength(0)),
      end: toLayerPoint(path.getPointAtLength(path.getTotalLength())),
    };
  }, lineId);
}

function centerOf(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function layerPointToScene(point: { x: number; y: number }, viewport: Viewport) {
  return {
    x: (point.x - viewport.originOffsetX) / viewport.zoom - viewport.scrollX,
    y: (point.y - viewport.originOffsetY) / viewport.zoom - viewport.scrollY,
  };
}

function sceneEquivalentLineForVisualRestore(line: CanvasLineRow, viewport: Viewport): CanvasLineRow {
  if (line.coord_space === 'scene') return { ...line, coord_space: 'scene' };

  const start = layerPointToScene({ x: line.start_x, y: line.start_y }, viewport);
  const control = layerPointToScene({ x: line.control_x, y: line.control_y }, viewport);
  const end = layerPointToScene({ x: line.end_x, y: line.end_y }, viewport);

  return {
    ...line,
    start_x: start.x,
    start_y: start.y,
    control_x: control.x,
    control_y: control.y,
    end_x: end.x,
    end_y: end.y,
    points: line.points?.map((point) => ({ ...point, ...layerPointToScene(point, viewport) })) ?? null,
    coord_space: 'scene',
  };
}

function expectNullableNumberClose(actual: number | null | undefined, expected: number | null | undefined): void {
  if (expected === null || expected === undefined) {
    expect(actual).toBe(expected);
    return;
  }
  expect(actual).toBeCloseTo(expected, 6);
}

function expectLineRestoredToGeometryAndVisualState(actual: CanvasLineRow, expected: CanvasLineRow): void {
  expect(actual.id).toBe(expected.id);
  expect(actual.board_id).toBe(expected.board_id);
  expect(actual.start_x).toBeCloseTo(expected.start_x, 6);
  expect(actual.start_y).toBeCloseTo(expected.start_y, 6);
  expect(actual.control_x).toBeCloseTo(expected.control_x, 6);
  expect(actual.control_y).toBeCloseTo(expected.control_y, 6);
  expect(actual.end_x).toBeCloseTo(expected.end_x, 6);
  expect(actual.end_y).toBeCloseTo(expected.end_y, 6);
  expect(actual.points?.length ?? 0).toBe(expected.points?.length ?? 0);
  expected.points?.forEach((expectedPoint, index) => {
    const actualPoint = actual.points?.[index];
    expect(actualPoint).toBeDefined();
    expect(actualPoint!.x).toBeCloseTo(expectedPoint.x, 6);
    expect(actualPoint!.y).toBeCloseTo(expectedPoint.y, 6);
    expect(actualPoint!.type).toBe(expectedPoint.type);
    expectNullableNumberClose(actualPoint!.lng, expectedPoint.lng);
    expectNullableNumberClose(actualPoint!.lat, expectedPoint.lat);
  });
  expect(actual.layer_plane).toBe(expected.layer_plane);
  expect(actual.z_index).toBe(expected.z_index);
  expect(actual.color).toBe(expected.color);
  expect(actual.stroke_width).toBe(expected.stroke_width);
  expect(actual.dashed).toBe(expected.dashed);
  expect(actual.start_arrow).toBe(expected.start_arrow);
  expect(actual.end_arrow).toBe(expected.end_arrow);
  expect(actual.label).toBe(expected.label);
  expect(actual.label_position).toBe(expected.label_position);
  expect(actual.label_text_color).toBe(expected.label_text_color);
  expect(actual.label_background_color).toBe(expected.label_background_color);
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
  }, { timeout: 30_000 });
}

async function selectLineTool(page: Page): Promise<void> {
  const lineTool = canvasLineTool(page);
  await expect(canvasSidebar(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(lineTool).toHaveCount(1, { timeout: 30_000 });
  await lineTool.click({ timeout: 30_000 });
  await expect(lineTool).toHaveClass(/bg-blue-100/, { timeout: 30_000 });
  await expect(lineTool).toHaveClass(/ring-2/, { timeout: 30_000 });
  await expect(lineTool).toHaveClass(/ring-blue-400/, { timeout: 30_000 });
  await expectCanvasLineModeActive(page);
}

async function createLineFromToolbar(page: Page, start: { x: number; y: number }, end: { x: number; y: number }): Promise<void> {
  await selectLineTool(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function fetchLine(supabase: SupabaseClient, lineId: string): Promise<CanvasLineRow> {
  const { data, error } = await supabase
    .from('canvas_lines')
    .select('*')
    .eq('id', lineId)
    .single();
  if (error) throw error;
  return data as CanvasLineRow;
}

async function waitForLineCoordSpace(
  supabase: SupabaseClient,
  lineId: string,
  coordSpace: 'scene' | null,
): Promise<CanvasLineRow> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const line = await fetchLine(supabase, lineId);
    if ((line.coord_space ?? null) === coordSpace) return line;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const line = await fetchLine(supabase, lineId);
  expect(line.coord_space ?? null).toBe(coordSpace);
  return line;
}

async function fetchNewestSceneLine(supabase: SupabaseClient, boardId: string, knownIds: Set<string>): Promise<CanvasLineRow> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data, error } = await supabase
      .from('canvas_lines')
      .select('*')
      .eq('board_id', boardId)
      .eq('coord_space', 'scene')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    const line = (data as CanvasLineRow[]).find((row) => !knownIds.has(String(row.id)));
    if (line) return line;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('No new scene-space Drawing CanvasLine row appeared');
}

async function lineIdsForBoard(supabase: SupabaseClient, boardId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('canvas_lines').select('id').eq('board_id', boardId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.id)));
}

async function deleteLines(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('canvas_lines').delete().in('id', ids);
  if (error) throw error;
}

async function restoreLine(
  supabase: SupabaseClient,
  before: CanvasLineRow,
  options: { coordSpaceOverride?: 'scene' | null } = {},
): Promise<void> {
  const { error } = await supabase
    .from('canvas_lines')
    .update({
      start_x: before.start_x,
      start_y: before.start_y,
      control_x: before.control_x,
      control_y: before.control_y,
      end_x: before.end_x,
      end_y: before.end_y,
      points: before.points,
      coord_space: options.coordSpaceOverride ?? before.coord_space ?? null,
      layer_plane: before.layer_plane,
      color: before.color,
      stroke_width: before.stroke_width,
      start_arrow: before.start_arrow,
      end_arrow: before.end_arrow,
      dashed: before.dashed,
      label: before.label,
      label_position: before.label_position,
      label_text_color: before.label_text_color,
      label_background_color: before.label_background_color,
      z_index: before.z_index,
    })
    .eq('id', before.id);
  if (error) throw error;
}

async function assertStoredLineRoundTripsToPath(page: Page, line: CanvasLineRow, viewport: Viewport): Promise<number> {
  const firstPoint = line.points?.[0] ?? { x: line.start_x, y: line.start_y };
  const lastPoint = line.points?.[line.points.length - 1] ?? { x: line.end_x, y: line.end_y };
  const observedLayerPoints = await renderedLineEndpointLayerPoints(page, line.id);
  const observedSceneStart = layerPointToScene(observedLayerPoints.start, viewport);
  const observedSceneEnd = layerPointToScene(observedLayerPoints.end, viewport);
  const errors = [
    Math.abs(firstPoint.x - observedSceneStart.x),
    Math.abs(firstPoint.y - observedSceneStart.y),
    Math.abs(lastPoint.x - observedSceneEnd.x),
    Math.abs(lastPoint.y - observedSceneEnd.y),
  ];
  const maxError = Math.max(...errors);
  expect(maxError).toBeLessThanOrEqual(0.01);
  return maxError;
}

async function dragLineBy(page: Page, lineId: string, dx: number, dy: number): Promise<void> {
  const start = centerOf(await linePathBox(page, lineId));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 6 });
  await page.mouse.up();
}

async function timedStep<T>(testInfo: TestInfo, label: string, body: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await test.step(label, body);
  } finally {
    const elapsedMs = Date.now() - startedAt;
    const description = `${label}: ${elapsedMs}ms`;
    testInfo.annotations.push({ type: 'patch-114-step-ms', description });
    console.log(`PATCH114_STEP ${description}`);
  }
}

async function createSceneLineForCase(
  page: Page,
  supabase: SupabaseClient,
  drawingCanvasId: string,
  knownIds: Set<string>,
  origin: { x: number; y: number },
  label: string,
): Promise<{ line: CanvasLineRow; roundTripError: number }> {
  await createLineFromToolbar(page, origin, { x: origin.x + 120, y: origin.y + 72 });
  const line = await fetchNewestSceneLine(supabase, drawingCanvasId, knownIds);
  knownIds.add(line.id);
  expect(line.coord_space, label).toBe('scene');
  const roundTripError = await assertStoredLineRoundTripsToPath(page, line, await readDrawingViewport(page));
  return { line, roundTripError };
}

test.describe('PATCH-114 live Drawing CanvasLine coordinate normalization', () => {
  test.describe.configure({ mode: 'serial' });

  let scratchDir = '';
  let storageStatePath = '';
  let drawingCanvasId = '';
  let legacyLineId = '';
  let freeformCanvasId = '';
  let mapCanvasId = '';
  let supabase: SupabaseClient;
  let baselineDrawingLineIds = new Set<string>();
  let maximumObservedRoundTripError = 0;
  let legacyBefore: CanvasLineRow;

  test.beforeAll(async () => {
    test.setTimeout(LIVE_LOGIN_TIMEOUT_MS + 10_000);
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-114-live-'));
    storageStatePath = await loginToScratchState(scratchDir);
    drawingCanvasId = requiredEnv(DRAWING_CANVAS_ID_ENV);
    legacyLineId = requiredEnv(LEGACY_LINE_ID_ENV);
    freeformCanvasId = optionalEnv(FREEFORM_CANVAS_ID_ENV);
    mapCanvasId = optionalEnv(MAP_CANVAS_ID_ENV);
    supabase = await createLiveClient();
    baselineDrawingLineIds = await lineIdsForBoard(supabase, drawingCanvasId);
    legacyBefore = await fetchLine(supabase, legacyLineId);
  });

  async function cleanupTemporaryDrawingLines(): Promise<string[]> {
    if (!supabase || !drawingCanvasId || baselineDrawingLineIds.size === 0) return [];
    const currentIds = await lineIdsForBoard(supabase, drawingCanvasId);
    const temporaryIds = [...currentIds].filter((id) => !baselineDrawingLineIds.has(id));
    await deleteLines(supabase, temporaryIds);
    return temporaryIds;
  }

  test.afterEach(async ({}, testInfo) => {
    const deletedIds = await cleanupTemporaryDrawingLines();
    if (deletedIds.length > 0) {
      console.log(`PATCH114_CLEANUP deleted temporary lines after ${testInfo.title}: ${deletedIds.join(',')}`);
    }
  });

  test.afterAll(async () => {
    const deletedIds = await cleanupTemporaryDrawingLines();
    if (deletedIds.length > 0) {
      console.log(`PATCH114_CLEANUP deleted temporary lines after all tests: ${deletedIds.join(',')}`);
    }
    if (storageStatePath && fs.existsSync(storageStatePath)) fs.rmSync(storageStatePath, { force: true });
    if (scratchDir && fs.existsSync(scratchDir)) fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  async function openReadyDrawingPage(browser: Browser): Promise<{ page: Page; diagnostics: PageDiagnostics }> {
    const page = await createLivePage(browser, storageStatePath);
    const diagnostics = attachPageDiagnostics(page);
    await installAppStateProbe(page);
    await openCanvas(page, drawingCanvasId);
    await ensureDrawingReady(page, drawingCanvasId, diagnostics);
    return { page, diagnostics };
  }

  test('creation and coordinate normalization', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const { page } = await openReadyDrawingPage(browser);
    try {
      const knownIds = await lineIdsForBoard(supabase, drawingCanvasId);
      const canvasBox = await page.locator('canvas.excalidraw__canvas').first().boundingBox();
      expect(canvasBox).not.toBeNull();
      const origin = { x: canvasBox!.x + 480, y: canvasBox!.y + 320 };
      const createdLines: CanvasLineRow[] = [];

      for (const zoomCase of [
        { label: '50%', zoomSteps: -3, pan: { dx: 0, dy: 0 } },
        { label: '100%', zoomSteps: 0, pan: { dx: 0, dy: 0 } },
        { label: '200%', zoomSteps: 3, pan: { dx: 0, dy: 0 } },
        { label: 'horizontal pan', zoomSteps: 0, pan: { dx: 900, dy: 0 } },
        { label: 'vertical pan', zoomSteps: 0, pan: { dx: 0, dy: 700 } },
      ]) {
        await timedStep(testInfo, `${zoomCase.label} zoom/pan Drawing line creation`, async () => {
          await setViewportByWheel(page, zoomCase.zoomSteps, zoomCase.pan);
          const { line, roundTripError } = await createSceneLineForCase(page, supabase, drawingCanvasId, knownIds, origin, zoomCase.label);
          createdLines.push(line);
          maximumObservedRoundTripError = Math.max(maximumObservedRoundTripError, roundTripError);
        });
      }

      await timedStep(testInfo, 'stored scene coordinates stable across later pan/zoom', async () => {
        const stableLine = await fetchLine(supabase, createdLines[0].id);
        const stableBefore = JSON.stringify({
          start_x: stableLine.start_x,
          start_y: stableLine.start_y,
          control_x: stableLine.control_x,
          control_y: stableLine.control_y,
          end_x: stableLine.end_x,
          end_y: stableLine.end_y,
          points: stableLine.points,
          coord_space: stableLine.coord_space,
        });
        const stableBoxBefore = await linePathBox(page, stableLine.id);
        await setViewportByWheel(page, 3, { dx: 600, dy: 500 });
        const stableAfter = await fetchLine(supabase, stableLine.id);
        expect(JSON.stringify({
          start_x: stableAfter.start_x,
          start_y: stableAfter.start_y,
          control_x: stableAfter.control_x,
          control_y: stableAfter.control_y,
          end_x: stableAfter.end_x,
          end_y: stableAfter.end_y,
          points: stableAfter.points,
          coord_space: stableAfter.coord_space,
        })).toBe(stableBefore);
        const stableBoxAfter = await linePathBox(page, stableLine.id);
        expect(stableBoxAfter).not.toEqual(stableBoxBefore);
      });
    } finally {
      await page.context().close();
    }
  });

  test('rendering, save/reload, and front/back planes', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const { page, diagnostics } = await openReadyDrawingPage(browser);
    try {
      const knownIds = await lineIdsForBoard(supabase, drawingCanvasId);
      const canvasBox = await page.locator('canvas.excalidraw__canvas').first().boundingBox();
      expect(canvasBox).not.toBeNull();
      const origin = { x: canvasBox!.x + 520, y: canvasBox!.y + 340 };
      let frontLine!: CanvasLineRow;
      let backLine!: CanvasLineRow;

      await timedStep(testInfo, 'create front/back fixture lines', async () => {
        frontLine = (await createSceneLineForCase(page, supabase, drawingCanvasId, knownIds, origin, 'front fixture')).line;
        backLine = (await createSceneLineForCase(page, supabase, drawingCanvasId, knownIds, { x: origin.x + 40, y: origin.y + 40 }, 'back fixture')).line;
      });

      await timedStep(testInfo, 'scene line visually tracks pan/zoom', async () => {
        const stableBoxBefore = await linePathBox(page, frontLine.id);
        await setViewportByWheel(page, 3, { dx: 600, dy: 500 });
        const stableBoxAfter = await linePathBox(page, frontLine.id);
        expect(stableBoxAfter).not.toEqual(stableBoxBefore);
      });

      await timedStep(testInfo, 'save/reload keeps scene-space line visible', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await ensureDrawingReady(page, drawingCanvasId, diagnostics);
        await expect(page.locator(`[data-line-id="${frontLine.id}"][data-line-role="visible-path"]`).first()).toBeVisible({ timeout: 30_000 });
        expect((await fetchLine(supabase, frontLine.id)).coord_space).toBe('scene');
      });

      await timedStep(testInfo, 'front and back plane rendering', async () => {
        await supabase.from('canvas_lines').update({ layer_plane: 'front' }).eq('id', frontLine.id).throwOnError();
        await supabase.from('canvas_lines').update({ layer_plane: 'back' }).eq('id', backLine.id).throwOnError();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await ensureDrawingReady(page, drawingCanvasId, diagnostics);
        await expect(page.locator(`[data-line-id="${frontLine.id}"][data-line-renderer="front"]`).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(`[data-line-id="${backLine.id}"][data-line-renderer="back"]`).first()).toBeVisible({ timeout: 30_000 });
      });
    } finally {
      await page.context().close();
    }
  });

  test('endpoint edit and whole-line drag', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const { page, diagnostics } = await openReadyDrawingPage(browser);
    try {
      const knownIds = await lineIdsForBoard(supabase, drawingCanvasId);
      const canvasBox = await page.locator('canvas.excalidraw__canvas').first().boundingBox();
      expect(canvasBox).not.toBeNull();
      const origin = { x: canvasBox!.x + 540, y: canvasBox!.y + 360 };
      const frontLine = (await createSceneLineForCase(page, supabase, drawingCanvasId, knownIds, origin, 'edit front fixture')).line;
      const backLine = (await createSceneLineForCase(page, supabase, drawingCanvasId, knownIds, { x: origin.x + 40, y: origin.y + 40 }, 'edit back fixture')).line;
      await supabase.from('canvas_lines').update({ layer_plane: 'back' }).eq('id', backLine.id).throwOnError();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureDrawingReady(page, drawingCanvasId, diagnostics);

      await timedStep(testInfo, 'endpoint edit keeps scene-space marker', async () => {
        const visiblePath = page.locator(`[data-line-id="${frontLine.id}"][data-line-role="visible-path"]`).first();
        await expect(visiblePath).toBeVisible({ timeout: 30_000 });
        const hitPath = page.locator(`[data-line-id="${frontLine.id}"][data-line-role="hit-path"]`).first();
        await expect(hitPath).toBeVisible({ timeout: 30_000 });
        await hitPath.dblclick({ timeout: 15_000 });
        const endpoint = page.locator(`[data-line-id="${frontLine.id}"][data-line-role="point-handle"]`).last();
        await expect(endpoint).toBeVisible({ timeout: 15_000 });
        const endpointBox = await endpoint.boundingBox();
        expect(endpointBox).not.toBeNull();
        await page.mouse.move(endpointBox!.x + endpointBox!.width / 2, endpointBox!.y + endpointBox!.height / 2);
        await page.mouse.down();
        await page.mouse.move(endpointBox!.x + endpointBox!.width / 2 + 24, endpointBox!.y + endpointBox!.height / 2 + 12, { steps: 5 });
        await page.mouse.up();
        expect((await fetchLine(supabase, frontLine.id)).coord_space).toBe('scene');
      });

      await timedStep(testInfo, 'whole-line drag keeps scene-space marker', async () => {
        await dragLineBy(page, backLine.id, 28, 16);
        expect((await fetchLine(supabase, backLine.id)).coord_space).toBe('scene');
      });
    } finally {
      await page.context().close();
    }
  });

  test('real legacy Arrow Post conversion and restoration', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const { page } = await openReadyDrawingPage(browser);
    let preserveNormalizedCoordSpace = false;
    let legacyVisualBefore: LinePathBox | null = null;
    let legacyVisualRestoreLine: CanvasLineRow | null = null;

    try {
      await timedStep(testInfo, 'legacy conversion by approximately 1px drag', async () => {
        const legacyViewportBefore = await readDrawingViewport(page);
        legacyVisualBefore = await linePathBox(page, legacyLineId);
        legacyVisualRestoreLine = sceneEquivalentLineForVisualRestore(legacyBefore, legacyViewportBefore);
        await dragLineBy(page, legacyLineId, 1, 1);
        const legacyConverted = await waitForLineCoordSpace(supabase, legacyLineId, 'scene');
        const legacyVisualAfter = await linePathBox(page, legacyLineId);
        expect(legacyConverted.coord_space).toBe('scene');
        preserveNormalizedCoordSpace = true;
        expect(Math.abs(centerOf(legacyVisualAfter).x - centerOf(legacyVisualBefore).x)).toBeLessThanOrEqual(2);
        expect(Math.abs(centerOf(legacyVisualAfter).y - centerOf(legacyVisualBefore).y)).toBeLessThanOrEqual(2);
        await setViewportByWheel(page, -2, { dx: -450, dy: -350 });
        expect(await linePathBox(page, legacyLineId)).not.toEqual(legacyVisualAfter);
      });
    } finally {
      const restoreTarget = preserveNormalizedCoordSpace
        ? legacyVisualRestoreLine ?? legacyBefore
        : legacyBefore;
      await restoreLine(supabase, restoreTarget, {
        coordSpaceOverride: preserveNormalizedCoordSpace ? 'scene' : undefined,
      });
      const restoredLegacyLine = await fetchLine(supabase, legacyLineId);
      expectLineRestoredToGeometryAndVisualState(restoredLegacyLine, restoreTarget);
      expect(restoredLegacyLine.coord_space).toBe(preserveNormalizedCoordSpace ? 'scene' : (legacyBefore.coord_space ?? null));
      await page.context().close();
    }
  });

  test('optional Freeform and Map fixture status', async ({ browser }, testInfo) => {
    test.setTimeout(60_000);
    const page = await createLivePage(browser, storageStatePath);
    try {
      if (freeformCanvasId) {
        await timedStep(testInfo, 'Freeform non-regression fixture', async () => {
          await openCanvas(page, freeformCanvasId);
          const freeformRowsBefore = await lineIdsForBoard(supabase, freeformCanvasId);
          await page.waitForTimeout(500);
          const freeformRowsAfter = await lineIdsForBoard(supabase, freeformCanvasId);
          expect(freeformRowsAfter).toEqual(freeformRowsBefore);
        });
      } else {
        testInfo.annotations.push({
          type: 'skipped-no-fixture',
          description:
            'PATCH114_LIVE_FREEFORM_CANVAS_ID not set - no accessible production Freeform canvas',
        });
        console.log('PATCH114_LIVE_FREEFORM_CANVAS_ID: NOT EXECUTABLE - NO ACCESSIBLE PRODUCTION FIXTURE');
      }

      if (mapCanvasId) {
        await timedStep(testInfo, 'Map non-regression fixture', async () => {
          await openCanvas(page, mapCanvasId);
          const mapRowsBefore = await lineIdsForBoard(supabase, mapCanvasId);
          await page.waitForTimeout(500);
          const mapRowsAfter = await lineIdsForBoard(supabase, mapCanvasId);
          expect(mapRowsAfter).toEqual(mapRowsBefore);
        });
      } else {
        testInfo.annotations.push({
          type: 'skipped-no-fixture',
          description:
            'PATCH114_LIVE_MAP_CANVAS_ID not set - no accessible production Map canvas',
        });
        console.log('PATCH114_LIVE_MAP_CANVAS_ID: NOT EXECUTABLE - NO ACCESSIBLE PRODUCTION FIXTURE');
      }

      test.info().annotations.push({
        type: 'patch-114-live-matrix',
        description: JSON.stringify({
          scratchStorageStateUsed: storageStatePath.endsWith('state.json'),
          maximumObservedRoundTripErrorSceneUnits: maximumObservedRoundTripError,
        }),
      });
      console.log(`PATCH114_MAX_ROUND_TRIP_ERROR_SCENE_UNITS ${maximumObservedRoundTripError}`);
    } finally {
      await page.context().close();
    }
  });

  test.skip('deprecated monolithic live matrix covered by the split PATCH-114 tests above', async ({ browser }, testInfo) => {
    test.setTimeout(300_000);

    const drawingCanvasId = requiredEnv(DRAWING_CANVAS_ID_ENV);
    const legacyLineId = requiredEnv(LEGACY_LINE_ID_ENV);
    const freeformCanvasId = optionalEnv(FREEFORM_CANVAS_ID_ENV);
    const mapCanvasId = optionalEnv(MAP_CANVAS_ID_ENV);
    const supabase = await createLiveClient();
    const page = await createLivePage(browser, storageStatePath);
    const diagnostics = attachPageDiagnostics(page);
    const createdLineIds: string[] = [];
    const maxRoundTripErrors: number[] = [];
    const legacyBefore = await fetchLine(supabase, legacyLineId);
    let preserveNormalizedCoordSpace = false;
    let legacyVisualBefore: LinePathBox | null = null;
    let legacyVisualRestoreLine: CanvasLineRow | null = null;

    try {
      await installAppStateProbe(page);
      await openCanvas(page, drawingCanvasId);
      await ensureDrawingReady(page, drawingCanvasId, diagnostics);

      const knownIds = await lineIdsForBoard(supabase, drawingCanvasId);
      const canvasBox = await page.locator('canvas.excalidraw__canvas').first().boundingBox();
      expect(canvasBox).not.toBeNull();
      const origin = { x: canvasBox!.x + 480, y: canvasBox!.y + 320 };

      for (const zoomCase of [
        { label: '50%', zoomSteps: -3, pan: { dx: 0, dy: 0 } },
        { label: '100%', zoomSteps: 0, pan: { dx: 0, dy: 0 } },
        { label: '200%', zoomSteps: 3, pan: { dx: 0, dy: 0 } },
        { label: 'horizontal pan', zoomSteps: 0, pan: { dx: 900, dy: 0 } },
        { label: 'vertical pan', zoomSteps: 0, pan: { dx: 0, dy: 700 } },
      ]) {
        await setViewportByWheel(page, zoomCase.zoomSteps, zoomCase.pan);
        await createLineFromToolbar(page, origin, { x: origin.x + 120, y: origin.y + 72 });
        const line = await fetchNewestSceneLine(supabase, drawingCanvasId, knownIds);
        knownIds.add(line.id);
        createdLineIds.push(line.id);
        expect(line.coord_space, zoomCase.label).toBe('scene');
        maxRoundTripErrors.push(await assertStoredLineRoundTripsToPath(page, line, await readDrawingViewport(page)));
      }

      const stableLine = await fetchLine(supabase, createdLineIds[0]);
      const stableBefore = JSON.stringify({
        start_x: stableLine.start_x,
        start_y: stableLine.start_y,
        control_x: stableLine.control_x,
        control_y: stableLine.control_y,
        end_x: stableLine.end_x,
        end_y: stableLine.end_y,
        points: stableLine.points,
        coord_space: stableLine.coord_space,
      });
      const stableBoxBefore = await linePathBox(page, stableLine.id);
      await setViewportByWheel(page, 3, { dx: 600, dy: 500 });
      const stableAfter = await fetchLine(supabase, stableLine.id);
      expect(JSON.stringify({
        start_x: stableAfter.start_x,
        start_y: stableAfter.start_y,
        control_x: stableAfter.control_x,
        control_y: stableAfter.control_y,
        end_x: stableAfter.end_x,
        end_y: stableAfter.end_y,
        points: stableAfter.points,
        coord_space: stableAfter.coord_space,
      })).toBe(stableBefore);
      const stableBoxAfter = await linePathBox(page, stableLine.id);
      expect(stableBoxAfter).not.toEqual(stableBoxBefore);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureDrawingReady(page, drawingCanvasId, diagnostics);
      await expect(page.locator(`[data-line-id="${stableLine.id}"][data-line-role="visible-path"]`).first()).toBeVisible({ timeout: 90_000 });
      expect((await fetchLine(supabase, stableLine.id)).coord_space).toBe('scene');

      const frontLine = await fetchLine(supabase, createdLineIds[0]);
      const backLine = await fetchLine(supabase, createdLineIds[1]);
      await supabase.from('canvas_lines').update({ layer_plane: 'front' }).eq('id', frontLine.id).throwOnError();
      await supabase.from('canvas_lines').update({ layer_plane: 'back' }).eq('id', backLine.id).throwOnError();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureDrawingReady(page, drawingCanvasId, diagnostics);
      await expect(page.locator(`[data-line-id="${frontLine.id}"][data-line-renderer="front"]`).first()).toBeVisible({ timeout: 90_000 });
      await expect(page.locator(`[data-line-id="${backLine.id}"][data-line-renderer="back"]`).first()).toBeVisible({ timeout: 90_000 });

      await page.locator(`[data-line-id="${frontLine.id}"][data-line-role="visible-path"]`).first().dblclick();
      const endpoint = page.locator(`[data-line-id="${frontLine.id}"][data-line-role="point-handle"]`).last();
      const endpointBox = await endpoint.boundingBox();
      expect(endpointBox).not.toBeNull();
      await page.mouse.move(endpointBox!.x + endpointBox!.width / 2, endpointBox!.y + endpointBox!.height / 2);
      await page.mouse.down();
      await page.mouse.move(endpointBox!.x + endpointBox!.width / 2 + 24, endpointBox!.y + endpointBox!.height / 2 + 12, { steps: 5 });
      await page.mouse.up();
      expect((await fetchLine(supabase, frontLine.id)).coord_space).toBe('scene');

      await dragLineBy(page, backLine.id, 28, 16);
      expect((await fetchLine(supabase, backLine.id)).coord_space).toBe('scene');

      const legacyViewportBefore = await readDrawingViewport(page);
      legacyVisualBefore = await linePathBox(page, legacyLineId);
      legacyVisualRestoreLine = sceneEquivalentLineForVisualRestore(legacyBefore, legacyViewportBefore);
      await dragLineBy(page, legacyLineId, 1, 1);
      const legacyConverted = await fetchLine(supabase, legacyLineId);
      const legacyVisualAfter = await linePathBox(page, legacyLineId);
      expect(legacyConverted.coord_space).toBe('scene');
      preserveNormalizedCoordSpace = true;
      expect(Math.abs(centerOf(legacyVisualAfter).x - centerOf(legacyVisualBefore).x)).toBeLessThanOrEqual(2);
      expect(Math.abs(centerOf(legacyVisualAfter).y - centerOf(legacyVisualBefore).y)).toBeLessThanOrEqual(2);
      await setViewportByWheel(page, -2, { dx: -450, dy: -350 });
      expect(await linePathBox(page, legacyLineId)).not.toEqual(legacyVisualAfter);

      if (freeformCanvasId) {
        await openCanvas(page, freeformCanvasId);
        const freeformRowsBefore = await lineIdsForBoard(supabase, freeformCanvasId);
        await page.waitForTimeout(500);
        const freeformRowsAfter = await lineIdsForBoard(supabase, freeformCanvasId);
        expect(freeformRowsAfter).toEqual(freeformRowsBefore);
      } else {
        testInfo.annotations.push({
          type: 'skipped-no-fixture',
          description:
            'PATCH114_LIVE_FREEFORM_CANVAS_ID not set — no accessible production Freeform canvas',
        });
        console.log('PATCH114_LIVE_FREEFORM_CANVAS_ID: NOT EXECUTABLE — NO ACCESSIBLE PRODUCTION FIXTURE');
      }

      if (mapCanvasId) {
        await openCanvas(page, mapCanvasId);
        const mapRowsBefore = await lineIdsForBoard(supabase, mapCanvasId);
        await page.waitForTimeout(500);
        const mapRowsAfter = await lineIdsForBoard(supabase, mapCanvasId);
        expect(mapRowsAfter).toEqual(mapRowsBefore);
      } else {
        testInfo.annotations.push({
          type: 'skipped-no-fixture',
          description:
            'PATCH114_LIVE_MAP_CANVAS_ID not set — no accessible production Map canvas',
        });
        console.log('PATCH114_LIVE_MAP_CANVAS_ID: NOT EXECUTABLE — NO ACCESSIBLE PRODUCTION FIXTURE');
      }

      test.info().annotations.push({
        type: 'patch-114-live-matrix',
        description: JSON.stringify({
          scratchStorageStateUsed: storageStatePath.endsWith('state.json'),
          maximumObservedRoundTripErrorPx: Math.max(...maxRoundTripErrors),
          covered: [
            '50% zoom creation',
            '100% zoom creation',
            '200% zoom creation',
            'horizontal pan creation',
            'vertical pan creation',
            'stored coordinates stable after pan/zoom',
            'scene line moves visually with scene',
            'save/reload',
            'front plane',
            'back plane',
            'endpoint edit',
            'whole-line drag',
            'legacy conversion by approximately 1px drag',
            'no visual jump during conversion',
            'converted line follows later pan/zoom',
            'Freeform non-regression',
            'Map non-regression',
            'cleanup and restoration',
          ],
        }),
      });
    } finally {
      let cleanupError: unknown;
      try {
        const restoreTarget = preserveNormalizedCoordSpace
          ? legacyVisualRestoreLine ?? legacyBefore
          : legacyBefore;
        await restoreLine(supabase, restoreTarget, {
          coordSpaceOverride: preserveNormalizedCoordSpace ? 'scene' : undefined,
        });
        const restoredLegacyLine = await fetchLine(supabase, legacyLineId);
        expectLineRestoredToGeometryAndVisualState(restoredLegacyLine, restoreTarget);
        expect(restoredLegacyLine.coord_space).toBe(preserveNormalizedCoordSpace ? 'scene' : (legacyBefore.coord_space ?? null));

        if (preserveNormalizedCoordSpace && legacyVisualBefore) {
          await openCanvas(page, drawingCanvasId);
          await ensureDrawingReady(page, drawingCanvasId, diagnostics);
          const legacyVisualRestored = await linePathBox(page, legacyLineId);
          expect(Math.abs(centerOf(legacyVisualRestored).x - centerOf(legacyVisualBefore).x)).toBeLessThanOrEqual(2);
          expect(Math.abs(centerOf(legacyVisualRestored).y - centerOf(legacyVisualBefore).y)).toBeLessThanOrEqual(2);
        }
      } catch (error) {
        cleanupError = error;
      }
      try {
        await deleteLines(supabase, createdLineIds);
      } catch (error) {
        cleanupError ??= error;
      }
      try {
        await page.context().close();
      } catch (error) {
        cleanupError ??= error;
      }
      if (cleanupError) throw cleanupError;
    }
  });
});
