import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';

type SceneElement = Record<string, unknown> & {
  id: string;
  type: string;
  frameId?: string | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

type ThumbnailSample = {
  src: string;
  srcLength: number;
  naturalWidth: number;
  naturalHeight: number;
  hash: string;
  nonWhitePixels: number;
  colorHits: Record<string, number>;
};

const SLIDE_A_TITLE = 'PATCH-064 Landscape';
const SLIDE_B_TITLE = 'PATCH-064 Portrait';

registerDrawingCleanup(test);

async function installThumbnailStamp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    let serial = 0;
    HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(...args) {
      serial += 1;
      const context = this.getContext('2d');
      if (context && this.width > 0 && this.height > 0) {
        context.save();
        context.fillStyle = `rgb(${serial % 251}, ${(serial * 7) % 251}, ${(serial * 13) % 251})`;
        context.fillRect(Math.max(0, this.width - 3), Math.max(0, this.height - 3), 3, 3);
        context.restore();
      }
      return originalToDataURL.apply(this, args);
    };
  });
}

async function openPresentationSidebar(page: Page): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByRole('button', { name: 'Refresh slide previews' })).toBeVisible();
  return sidebar;
}

function slideRows(sidebar: Locator): Locator {
  return sidebar.locator('div.space-y-3 > div.group');
}

function slideRow(sidebar: Locator, title: string): Locator {
  return sidebar
    .getByText(title, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

function slideThumbnail(row: Locator): Locator {
  return row.locator('img[alt="Slide preview"]').first();
}

async function sampleThumbnail(row: Locator, colors: Record<string, [number, number, number]>): Promise<ThumbnailSample> {
  const image = slideThumbnail(row);
  await expect(image).toBeVisible({ timeout: 60_000 });
  return image.evaluate(async (img, expectedColors) => {
    const source = img as HTMLImageElement;
    await source.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D context unavailable for PATCH-124 thumbnail sample');
    context.drawImage(source, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let nonWhitePixels = 0;
    const colorHits: Record<string, number> = {};
    for (const name of Object.keys(expectedColors)) colorHits[name] = 0;
    for (let index = 0; index < data.length; index += 4) {
      const pixelIndex = index / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      const a = data[index + 3] ?? 0;
      if (!(x >= canvas.width - 4 && y >= canvas.height - 4)) {
        hash ^= r + (g << 8) + (b << 16) + (a << 24);
        hash = Math.imul(hash, 16777619);
      }
      if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhitePixels += 1;
      for (const [name, [er, eg, eb]] of Object.entries(expectedColors)) {
        if (Math.abs(r - er) <= 20 && Math.abs(g - eg) <= 20 && Math.abs(b - eb) <= 20 && a > 160) {
          colorHits[name] = (colorHits[name] ?? 0) + 1;
        }
      }
    }
    return {
      src: source.src,
      srcLength: source.src.length,
      naturalWidth: source.naturalWidth,
      naturalHeight: source.naturalHeight,
      hash: String(hash >>> 0),
      nonWhitePixels,
      colorHits,
    };
  }, colors);
}

async function waitForThumbnailChange(
  row: Locator,
  previous: ThumbnailSample,
  colors: Record<string, [number, number, number]>,
  expectedColor: string,
): Promise<ThumbnailSample> {
  await expect.poll(async () => {
    const next = await sampleThumbnail(row, colors);
    return {
      changed: next.src !== previous.src || next.hash !== previous.hash,
      colorHits: next.colorHits[expectedColor] ?? 0,
      sample: next,
    };
  }, { timeout: 60_000, intervals: [500, 1_000, 2_000] }).toMatchObject({
    changed: true,
    colorHits: expect.any(Number),
  });

  const next = await sampleThumbnail(row, colors);
  expect(next.colorHits[expectedColor]).toBeGreaterThan(12);
  return next;
}

async function waitForRefreshButtonIdle(sidebar: Locator): Promise<void> {
  await expect(sidebar.getByText('Generating previews...', { exact: true })).toHaveCount(0, { timeout: 60_000 });
}

async function waitForStableThumbnail(row: Locator, colors: Record<string, [number, number, number]>): Promise<ThumbnailSample> {
  let previous = await sampleThumbnail(row, colors);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await row.page().waitForTimeout(750);
    const next = await sampleThumbnail(row, colors);
    if (next.src === previous.src && next.hash === previous.hash) return next;
    previous = next;
  }
  return previous;
}

async function waitForHarness(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const target = window as Window & typeof globalThis & { h?: { app?: unknown; elements?: unknown[] } };
    return Boolean(target.h?.app && Array.isArray(target.h.elements));
  }, { timeout: 90_000 });
}

async function addRectToFrame(page: Page, frameId: string, id: string, color: string, x: number, y: number): Promise<void> {
  await page.evaluate(({ frameId: targetFrameId, id: elementId, color: fill, x: elementX, y: elementY }) => {
    const target = window as Window & typeof globalThis & {
      h?: {
        app?: { updateScene: (scene: { elements: unknown[]; appState?: Record<string, unknown>; commitToHistory?: boolean }) => void };
        elements?: SceneElement[];
      };
    };
    const app = target.h?.app;
    const elements = target.h?.elements ?? [];
    if (!app?.updateScene) throw new Error('Excalidraw updateScene harness unavailable');
    const nextElement: SceneElement = {
      id: elementId,
      type: 'rectangle',
      x: elementX,
      y: elementY,
      width: 120,
      height: 80,
      angle: 0,
      strokeColor: fill,
      backgroundColor: fill,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      seed: 124,
      version: 1,
      versionNonce: Math.floor(Math.random() * 1_000_000),
      updated: Date.now(),
      index: `z${Date.now()}${Math.random()}`,
      isDeleted: false,
      groupIds: [],
      frameId: targetFrameId,
      boundElements: null,
      link: null,
      locked: false,
      roundness: null,
    };
    app.updateScene({
      elements: [...elements.filter((element) => element.id !== elementId), nextElement],
      appState: { selectedElementIds: {} },
      commitToHistory: true,
    });
  }, { frameId, id, color, x, y });
}

async function assertThumbnailHasNoTransientChrome(row: Locator): Promise<void> {
  const thumbBox = slideThumbnail(row).locator('xpath=ancestor::button[1]');
  await expect(thumbBox.locator('input[type="checkbox"], [role="menu"], .context-menu, .excalidraw')).toHaveCount(0);
}

test.describe('PATCH-124 slide thumbnail refresh', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('real Slides panel thumbnails refresh automatically, manually, and settle on newest render', async ({ page }) => {
    test.setTimeout(120_000);
    await installThumbnailStamp(page);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-124-thumbnails');
    await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);
    await openDrawingBoard(page, fixture.boardId);
    await waitForHarness(page);

    const sidebar = await openPresentationSidebar(page);
    const rows = slideRows(sidebar);
    await expect(rows).toHaveCount(2);
    const slideA = slideRow(sidebar, SLIDE_A_TITLE);
    const slideB = slideRow(sidebar, SLIDE_B_TITLE);
    await expect(slideA).toBeVisible();
    await expect(slideB).toBeVisible();
    await waitForRefreshButtonIdle(sidebar);

    const colors = {
      red: [220, 38, 38] as [number, number, number],
      green: [22, 163, 74] as [number, number, number],
      purple: [124, 58, 237] as [number, number, number],
      orange: [249, 115, 22] as [number, number, number],
      teal: [20, 184, 166] as [number, number, number],
    };
    const initialA = await waitForStableThumbnail(slideA, colors);
    const initialB = await waitForStableThumbnail(slideB, colors);
    expect(initialA.src).toMatch(/^data:image\/png/);
    expect(initialB.src).toMatch(/^data:image\/png/);
    expect(initialA.naturalWidth).toBeGreaterThan(100);
    expect(initialB.naturalHeight).toBeGreaterThan(100);

    await slideThumbnail(slideA).click();
    await addRectToFrame(page, 'frame-landscape', 'patch-124-slide-a-red', '#dc2626', 260, 420);
    const afterA = await waitForThumbnailChange(slideA, initialA, colors, 'red');
    const bAfterA = await sampleThumbnail(slideB, colors);
    expect(bAfterA.hash).toBe(initialB.hash);

    await addRectToFrame(page, 'frame-portrait', 'patch-124-slide-b-green', '#16a34a', 1520, 520);
    const afterB = await waitForThumbnailChange(slideB, bAfterA, colors, 'green');
    expect(await sampleThumbnail(slideA, colors)).toMatchObject({ src: afterA.src });

    await addRectToFrame(page, 'frame-landscape', 'patch-124-visible-drawing-purple', '#7c3aed', 460, 430);
    const afterDrawing = await waitForThumbnailChange(slideA, afterA, colors, 'purple');

    await sidebar.getByRole('button', { name: 'Refresh slide previews' }).click();
    await expect.poll(async () => (await sampleThumbnail(slideA, colors)).src, { timeout: 60_000 }).not.toBe(afterDrawing.src);
    await expect.poll(async () => (await sampleThumbnail(slideB, colors)).src, { timeout: 60_000 }).not.toBe(afterB.src);
    await waitForRefreshButtonIdle(sidebar);

    await assertThumbnailHasNoTransientChrome(slideA);
    await assertThumbnailHasNoTransientChrome(slideB);

    const beforeRapid = await sampleThumbnail(slideA, colors);
    await addRectToFrame(page, 'frame-landscape', 'patch-124-rapid-orange', '#f97316', 620, 420);
    await addRectToFrame(page, 'frame-landscape', 'patch-124-rapid-teal', '#14b8a6', 760, 420);
    const afterRapid = await waitForThumbnailChange(slideA, beforeRapid, colors, 'teal');
    expect(afterRapid.colorHits.orange).toBeGreaterThan(12);
    expect(afterRapid.colorHits.teal).toBeGreaterThan(12);

    await sidebar.locator('div.flex.items-center.gap-1 > button').last().click();
    expect(consoleErrors.filter((entry) => /state update|unmounted|act\(/i.test(entry))).toEqual([]);
  });
});
