import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';
import { waitForE2EBridge } from './e2eBridge';

const LANDSCAPE = 'frame-landscape';
const PORTRAIT = 'frame-portrait';
// Exact canvas dimensions -- never aspect ratio (PATCH-142 §22b: an aspect-ratio classifier mislabels any wide scratch canvas as "landscape").
const LANDSCAPE_DIMS = { width: 569, height: 320 };
const PORTRAIT_DIMS = { width: 180, height: 320 };
const BLUE: [number, number, number] = [37, 99, 235]; // shape-landscape strokeColor #2563eb
const GREEN: [number, number, number] = [47, 158, 68]; // #2f9e44, drawn portrait rectangle

type SceneElement = Record<string, unknown> & { id: string; type: string; frameId?: string | null; isDeleted?: boolean; x: number; y: number; width: number; height: number };
type EmbeddableGeometry = { id: string; link: string; frameId: string | null; width: number; height: number; version: number; versionNonce: number };
type RasterEvent = { width: number; height: number };
type FrameBounds = { id: string; x: number; y: number; width: number; height: number };
const FRAME_BOUNDS: Record<string, FrameBounds> = {
  [LANDSCAPE]: { id: LANDSCAPE, x: 0, y: 0, width: 1280, height: 720 },
  [PORTRAIT]: { id: PORTRAIT, x: 1400, y: 0, width: 720, height: 1280 },
};
registerDrawingCleanup(test);

// Mirrors lib/infra/drawing/frameMembership.ts's resolveFrameMembership so a late-arriving
// embeddable with frameId: null is classified by the same rule the render signature uses.
function resolvesToFrame(el: SceneElement, frame: FrameBounds): boolean {
  if (el.frameId !== null && el.frameId !== undefined) return el.frameId === frame.id;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return cx > frame.x && cx < frame.x + frame.width && cy > frame.y && cy < frame.y + frame.height;
}

async function installRasterLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __patch142Rasters: RasterEvent[] }).__patch142Rasters = [];
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(...args: unknown[]) {
      (window as unknown as { __patch142Rasters: RasterEvent[] }).__patch142Rasters.push({ width: this.width, height: this.height });
      return (original as (...a: unknown[]) => string).apply(this, args as never);
    };
  });
}

async function rasterCount(page: Page, dims: { width: number; height: number }): Promise<number> {
  return page.evaluate(({ w, h }) =>
    (((window as unknown as { __patch142Rasters?: RasterEvent[] }).__patch142Rasters ?? []) as RasterEvent[])
      .filter((e) => e.width === w && e.height === h).length,
  { w: dims.width, h: dims.height });
}
async function sceneElements(page: Page): Promise<SceneElement[]> {
  return page.evaluate(() => (window.__COLLABBOARD_E2E__?.getSceneElements() ?? []) as unknown as SceneElement[]);
}

async function frameEmbeddables(page: Page, frameKey: string): Promise<EmbeddableGeometry[]> {
  const frame = FRAME_BOUNDS[frameKey];
  const elements = await sceneElements(page);
  return elements
    .filter((el) => el.type === 'embeddable' && !el.isDeleted && resolvesToFrame(el, frame))
    .map((el) => ({
      id: String(el.id), link: String(el.link), frameId: typeof el.frameId === 'string' ? el.frameId : null,
      width: Number(el.width), height: Number(el.height), version: Number(el.version), versionNonce: Number(el.versionNonce),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
async function openSidebar(page: Page): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible({ timeout: 30_000 });
  return sidebar;
}
const row = (sidebar: Locator, title: string) =>
  sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
const thumb = (slideRow: Locator) => slideRow.locator('img[alt="Slide preview"]').first();

async function sampleThumbnail(image: Locator): Promise<{ hash: string; nonWhitePixels: number; colorHits: Record<'blue' | 'green', number> }> {
  await expect(image).toBeVisible({ timeout: 60_000 });
  return image.evaluate(async (imgEl, targets) => {
    const source = imgEl as HTMLImageElement;
    await source.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let nonWhitePixels = 0;
    const colorHits: Record<string, number> = { blue: 0, green: 0 };
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0, g = data[index + 1] ?? 0, b = data[index + 2] ?? 0, a = data[index + 3] ?? 0;
      hash ^= r + (g << 8) + (b << 16) + (a << 24); hash = Math.imul(hash, 16777619);
      if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhitePixels += 1;
      for (const [name, [tr, tg, tb]] of Object.entries(targets)) {
        if (Math.abs(r - tr) <= 20 && Math.abs(g - tg) <= 20 && Math.abs(b - tb) <= 20 && a > 160) colorHits[name] += 1;
      }
    }
    return { hash: String(hash >>> 0), nonWhitePixels, colorHits: colorHits as Record<'blue' | 'green', number> };
  }, { blue: BLUE, green: GREEN });
}

// Cold-completeness precondition (§7): Container A's card, the late-arriving Container C
// card (auto-created by the padlet-scene sync once mounted -- §4 RC-3), and the moodboard
// image must all resolve into the landscape frame with no user edit performed.
async function waitForColdCompleteness(page: Page, expectedLinks: string[]): Promise<void> {
  await expect.poll(async () => {
    const members = await frameEmbeddables(page, LANDSCAPE);
    return expectedLinks.every((link) => members.some((m) => m.link === link));
  }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(true);
}

type Baseline = { geometry: EmbeddableGeometry[]; hash: string };
// Requires geometry + decoded raster unchanged across >=2s -- not a fixed delay (§22l).
async function waitForQuiescentLandscape(page: Page, landscapeThumb: Locator): Promise<Baseline> {
  let stableSince = 0;
  let previousGeometry = '';
  let previousHash = '';
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const geometry = await frameEmbeddables(page, LANDSCAPE);
    const sample = await sampleThumbnail(landscapeThumb);
    const geometrySerialized = JSON.stringify(geometry);
    if (geometrySerialized === previousGeometry && sample.hash === previousHash) {
      stableSince ||= Date.now();
      if (Date.now() - stableSince >= 2_000) return { geometry, hash: sample.hash };
    } else {
      previousGeometry = geometrySerialized;
      previousHash = sample.hash;
      stableSince = 0;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('PATCH-142 landscape did not reach a quiescent (geometry + raster) baseline');
}

async function sceneToScreen(page: Page, x: number, y: number) {
  const viewport = await page.evaluate(() => window.__COLLABBOARD_E2E__?.getViewport() as { scrollX: number; scrollY: number; zoom: { value: number }; offsetLeft: number; offsetTop: number });
  return { x: (x + viewport.scrollX) * viewport.zoom.value + viewport.offsetLeft, y: (y + viewport.scrollY) * viewport.zoom.value + viewport.offsetTop };
}

// Real UI only: toolbar + stroke swatch + mouse drag, no window.h/updateScene/raw API.
// "#2f9e44" is the accessible name of Excalidraw's green top-pick swatch (stable control).
async function drawPortraitRectangle(page: Page): Promise<void> {
  const before = (await sceneElements(page)).map((el) => String(el.id));
  await page.locator('[data-testid="toolbar-rectangle"]').click({ force: true });
  await page.getByRole('button', { name: '#2f9e44', exact: true }).first().click();
  const a = await sceneToScreen(page, 2000, 950);
  const b = await sceneToScreen(page, 2140, 1050);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const elements = await sceneElements(page);
    return elements.some((el) => !before.includes(String(el.id)) && el.type === 'rectangle' && el.frameId === PORTRAIT && !el.isDeleted);
  }, { timeout: 15_000, intervals: [250, 500] }).toBe(true);
}

test.describe('PATCH-142 thumbnail render isolation', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('cold completeness, C5a semantic isolation, C5b invalidation isolation', async ({ page }) => {
    test.setTimeout(150_000);
    await installRasterLog(page);
    const { supabase, fixture } = await createDisposableDrawingBoard('patch-142-isolation');
    await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);
    await openDrawingBoard(page, fixture.boardId);
    await waitForE2EBridge(page);

    const sidebar = await openSidebar(page);
    const landscape = row(sidebar, 'PATCH-064 Landscape');
    const portrait = row(sidebar, 'PATCH-064 Portrait');
    await expect(landscape).toBeVisible();
    await expect(portrait).toBeVisible();

    // COLD COMPLETENESS -- no edit performed before this point.
    const expectedLinks = [fixture.containerIds[0], fixture.containerIds[2], fixture.uploadedImagePadletIds[0]].map((id) => `padlet://${id}`);
    await waitForColdCompleteness(page, expectedLinks);
    const nativeLandscape = (await sceneElements(page)).filter((el) => el.frameId === LANDSCAPE && el.type !== 'embeddable' && el.type !== 'frame');
    expect(['text', 'rectangle'].every((kind) => nativeLandscape.some((el) => el.type === kind))).toBe(true);

    const baseline = await waitForQuiescentLandscape(page, thumb(landscape));
    expect(baseline.geometry.length).toBe(3);
    expect(baseline.geometry.every((entry) => entry.height !== 80)).toBe(true);
    const completeSample = await sampleThumbnail(thumb(landscape));
    expect(completeSample.colorHits.blue).toBeGreaterThan(12);
    expect(completeSample.nonWhitePixels).toBeGreaterThan(2_000);
    const landscapeRastersAtBaseline = await rasterCount(page, LANDSCAPE_DIMS);
    const portraitSampleBefore = await sampleThumbnail(thumb(portrait));

    // PATCH-145 regression check: hidden -> visible must not rewrite landscape geometry.
    await thumb(portrait).click();
    await page.waitForTimeout(3_000);
    expect(await frameEmbeddables(page, LANDSCAPE)).toEqual(baseline.geometry);
    await thumb(landscape).click();
    await page.waitForTimeout(3_000);
    expect(await frameEmbeddables(page, LANDSCAPE)).toEqual(baseline.geometry);

    // PORTRAIT EDIT -- navigate to the portrait frame first so the drag lands inside it.
    await thumb(portrait).click();
    await page.waitForTimeout(1_000);
    await drawPortraitRectangle(page);
    // Portrait thumbnail updates normally (debounced re-render, not instant with the scene write).
    await expect.poll(async () => (await sampleThumbnail(thumb(portrait))).hash,
      { timeout: 20_000, intervals: [250, 500, 1_000] }).not.toBe(portraitSampleBefore.hash);
    await page.waitForTimeout(3_000);

    // C5a -- semantic isolation. C5b -- invalidation isolation.
    const afterEditSample = await sampleThumbnail(thumb(landscape));
    expect(afterEditSample.colorHits.green).toBe(0);
    expect(await rasterCount(page, LANDSCAPE_DIMS)).toBe(landscapeRastersAtBaseline);
    expect(afterEditSample.hash).toBe(completeSample.hash);
    expect(await frameEmbeddables(page, LANDSCAPE)).toEqual(baseline.geometry);
  });
});
