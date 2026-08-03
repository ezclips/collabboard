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

// PATCH-137 claim map (C1-C13 from PATCH-124 governance §3), migrated off private `window.h`
// mutation onto real UI + the read-only PATCH-136 bridge:
//   C1  both slides render >100px thumbnails        -> initial baseline samples
//   C2  a shape drawn in A appears in A's thumbnail  -> red-in-landscape assertion
//   C3  a change to A does not alter B               -> bAfterA hash equality
//   C4  a shape drawn in B refreshes B                -> green-in-portrait assertion
//   C5  a change to B does not alter A (PATCH-142 also owns unrelated-slide isolation
//       generally; this retains PATCH-124's own equivalent claim)  -> afterA unchanged
//   C6  a further change to A refreshes A again       -> purple-in-landscape assertion
//   C7  manual refresh yields a genuinely new render for unchanged content
//                                                      -> raster-count increase, hash same
//   C8  refresh cycle terminates                      -> waitForRefreshButtonIdle
//   C9  no transient chrome in thumbnails              -> assertThumbnailHasNoTransientChrome
//   C10 split per PATCH-137 §10a (conflated two properties, cannot both survive real UI):
//       C10a coalescing (new) -> draw + two Ctrl+D, exactly one new landscape raster
//       C10b two colours (kept, race removed) -> poll until both colours present
//   C11 no React state-update/unmounted/act() console errors -> consoleErrors assertion
//   C12 exact colour content (+-20/channel, alpha>160, >12px) -> colorHits thresholds
//   C13 frame targeting is by frameId                  -> resolvesToFrame + el.frameId checks
//   C5c (obsolete) `src` identity as a cross-frame contract -> retired, PATCH-142 §24 owns this
// No persistence/reload requirement: none of C1-C13 reload or read back (PATCH-137 §21f).

const LANDSCAPE = 'frame-landscape';
const PORTRAIT = 'frame-portrait';
const SLIDE_A_TITLE = 'PATCH-064 Landscape';
const SLIDE_B_TITLE = 'PATCH-064 Portrait';
// Exact per-slide raster dimensions for this fixture (PATCH-142 §22b/§24e: never aspect ratio).
const LANDSCAPE_DIMS = { width: 569, height: 320 };
const PORTRAIT_DIMS = { width: 180, height: 320 };
const FRAME_BOUNDS: Record<string, { id: string; x: number; y: number; width: number; height: number }> = {
  [LANDSCAPE]: { id: LANDSCAPE, x: 0, y: 0, width: 1280, height: 720 },
  [PORTRAIT]: { id: PORTRAIT, x: 1400, y: 0, width: 720, height: 1280 },
};

type SceneElement = Record<string, unknown> & { id: string; type: string; frameId?: string | null; x: number; y: number; width: number; height: number; isDeleted?: boolean };
type RasterEvent = { width: number; height: number };
type ThumbnailSample = { src: string; hash: string; nonWhitePixels: number; colorHits: Record<string, number> };

registerDrawingCleanup(test);

// Mirrors lib/infra/drawing/frameMembership.ts's resolveFrameMembership: explicit frameId
// first, else strict center-point containment. Real-UI-drawn native elements always receive
// an explicit frameId from the app on drop, so the fallback branch is defence in depth, not
// the primary proof -- the created element's own frameId is (§13).
function resolvesToFrame(el: SceneElement, frameId: string): boolean {
  const frame = FRAME_BOUNDS[frameId]!;
  if (el.frameId !== null && el.frameId !== undefined) return el.frameId === frameId;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return cx > frame.x && cx < frame.x + frame.width && cy > frame.y && cy < frame.y + frame.height;
}

async function installRasterLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __patch124Rasters: RasterEvent[] }).__patch124Rasters = [];
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function patched(...args: unknown[]) {
      (window as unknown as { __patch124Rasters: RasterEvent[] }).__patch124Rasters.push({ width: this.width, height: this.height });
      return (original as (...a: unknown[]) => string).apply(this, args as never);
    };
  });
}
async function rasterCount(page: Page, dims: { width: number; height: number }): Promise<number> {
  return page.evaluate(({ w, h }) =>
    (((window as unknown as { __patch124Rasters?: RasterEvent[] }).__patch124Rasters ?? []) as RasterEvent[])
      .filter((e) => e.width === w && e.height === h).length,
  { w: dims.width, h: dims.height });
}

async function sceneElements(page: Page): Promise<SceneElement[]> {
  return page.evaluate(() => (window.__COLLABBOARD_E2E__?.getSceneElements() ?? []) as unknown as SceneElement[]);
}
async function sceneToScreen(page: Page, x: number, y: number) {
  const viewport = await page.evaluate(() => window.__COLLABBOARD_E2E__?.getViewport() as { scrollX: number; scrollY: number; zoom: { value: number }; offsetLeft: number; offsetTop: number });
  return { x: (x + viewport.scrollX) * viewport.zoom.value + viewport.offsetLeft, y: (y + viewport.scrollY) * viewport.zoom.value + viewport.offsetTop };
}

async function openPresentationSidebar(page: Page): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByRole('button', { name: 'Refresh slide previews' })).toBeVisible();
  return sidebar;
}
function slideRows(sidebar: Locator): Locator { return sidebar.locator('div.space-y-3 > div.group'); }
function slideRow(sidebar: Locator, title: string): Locator {
  return sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
}
function slideThumbnail(row: Locator): Locator { return row.locator('img[alt="Slide preview"]').first(); }

async function sampleThumbnail(row: Locator, colors: Record<string, [number, number, number]>): Promise<ThumbnailSample> {
  const image = slideThumbnail(row);
  await expect(image).toBeVisible({ timeout: 60_000 });
  return image.evaluate(async (imgEl, expectedColors) => {
    const source = imgEl as HTMLImageElement;
    await source.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for PATCH-124 thumbnail sample');
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let nonWhitePixels = 0;
    const colorHits: Record<string, number> = {};
    for (const name of Object.keys(expectedColors)) colorHits[name] = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0, g = data[index + 1] ?? 0, b = data[index + 2] ?? 0, a = data[index + 3] ?? 0;
      hash ^= r + (g << 8) + (b << 16) + (a << 24); hash = Math.imul(hash, 16777619);
      if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhitePixels += 1;
      for (const [name, [er, eg, eb]] of Object.entries(expectedColors)) {
        if (Math.abs(r - er) <= 20 && Math.abs(g - eg) <= 20 && Math.abs(b - eb) <= 20 && a > 160) colorHits[name] += 1;
      }
    }
    return { src: source.src, hash: String(hash >>> 0), nonWhitePixels, colorHits };
  }, colors);
}

async function waitForThumbnailChange(row: Locator, previous: ThumbnailSample, colors: Record<string, [number, number, number]>, expectedColor: string): Promise<ThumbnailSample> {
  await expect.poll(async () => {
    const next = await sampleThumbnail(row, colors);
    return next.hash !== previous.hash;
  }, { timeout: 60_000, intervals: [500, 1_000, 2_000] }).toBe(true);
  const next = await sampleThumbnail(row, colors);
  expect(next.colorHits[expectedColor]).toBeGreaterThan(12);
  return next;
}
async function waitForRefreshButtonIdle(sidebar: Locator): Promise<void> {
  await expect(sidebar.getByText('Generating previews...', { exact: true })).toHaveCount(0, { timeout: 60_000 });
}
async function assertThumbnailHasNoTransientChrome(row: Locator): Promise<void> {
  const thumbBox = slideThumbnail(row).locator('xpath=ancestor::button[1]');
  await expect(thumbBox.locator('input[type="checkbox"], [role="menu"], .context-menu, .excalidraw')).toHaveCount(0);
}

// Real-UI colour entry: click the trigger (opens the popover), type the hex value (no
// leading '#'), click the same trigger again to close it (ColorPicker.tsx's own toggle-off
// path) -- a stable control, not a CSS implementation selector.
async function setColor(page: Page, type: 'elementStroke' | 'elementBackground', hex: string): Promise<void> {
  const trigger = page.locator(`[data-openpopup="${type}"]`);
  await trigger.click();
  await expect(page.locator('.color-picker-content')).toBeVisible();
  await page.locator('input.color-picker-input').fill(hex.replace(/^#/, ''));
  await trigger.click();
  await expect(page.locator('.color-picker-content')).toHaveCount(0);
}

// Real UI only: toolbar tool + stroke/background hex + Solid fill + pointer drag. No
// window.h, no updateScene, no raw API, no database mutation. `navigateVia` clicks the
// slide's own thumbnail first, which pans/zooms the live canvas to that frame -- required
// because the last navigation may have left the other frame focused/off-screen.
async function drawStyledRectangle(page: Page, navigateVia: Locator, frameId: string, strokeHex: string, bgHex: string, x1: number, y1: number, x2: number, y2: number): Promise<string> {
  await slideThumbnail(navigateVia).click();
  await page.waitForTimeout(500);
  const before = (await sceneElements(page)).map((el) => String(el.id));
  await page.locator('[data-testid="toolbar-rectangle"]').click({ force: true });
  await setColor(page, 'elementStroke', strokeHex);
  await setColor(page, 'elementBackground', bgHex);
  await page.locator('[data-testid="fill-solid"]').click();
  const a = await sceneToScreen(page, x1, y1);
  const b = await sceneToScreen(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  let newId = '';
  await expect.poll(async () => {
    const elements = await sceneElements(page);
    const created = elements.find((el) => !before.includes(String(el.id)) && el.type === 'rectangle' && !el.isDeleted && resolvesToFrame(el, frameId));
    if (created) newId = String(created.id);
    return Boolean(created);
  }, { timeout: 15_000, intervals: [250, 500] }).toBe(true);
  return newId;
}

test.describe('PATCH-124 slide thumbnail refresh', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('real Slides panel thumbnails refresh through real UI drawing, manually, and settle on newest render', async ({ page }) => {
    test.setTimeout(240_000);
    await installRasterLog(page);
    const consoleErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-124-thumbnails');
    await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);
    await openDrawingBoard(page, fixture.boardId);
    await waitForE2EBridge(page);
    // The vendored fork's dev/test hook (App.tsx createTestHook) is gated to test/dev NODE_ENV
    // and must never appear in this governed production E2E artifact (PATCH-137 §21c).
    expect(await page.evaluate(() => typeof (window as unknown as { h?: unknown }).h)).toBe('undefined');

    const sidebar = await openPresentationSidebar(page);
    await expect(slideRows(sidebar)).toHaveCount(2);
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
    const initialA = await sampleThumbnail(slideA, colors);
    const initialB = await sampleThumbnail(slideB, colors);
    expect(initialA.src).toMatch(/^data:image\/png/);
    const portraitRastersBeforeA = await rasterCount(page, PORTRAIT_DIMS);

    // C2, C13: a real red rectangle drawn in the landscape frame.
    await drawStyledRectangle(page, slideA, LANDSCAPE, '#dc2626', '#dc2626', 650, 400, 750, 460);
    const afterA = await waitForThumbnailChange(slideA, initialA, colors, 'red');
    // C3: unrelated (portrait) slide unaffected -- content and raster count both.
    expect((await sampleThumbnail(slideB, colors)).hash).toBe(initialB.hash);
    expect(await rasterCount(page, PORTRAIT_DIMS)).toBe(portraitRastersBeforeA);

    // C4, C13: a real green rectangle drawn in the portrait frame (mirror direction).
    await drawStyledRectangle(page, slideB, PORTRAIT, '#16a34a', '#16a34a', 1550, 500, 1650, 560);
    const afterB = await waitForThumbnailChange(slideB, initialB, colors, 'green');
    // C5: unrelated (landscape) slide unaffected by the portrait edit.
    expect((await sampleThumbnail(slideA, colors)).hash).toBe(afterA.hash);

    // C6: a further change to A refreshes A again.
    await drawStyledRectangle(page, slideA, LANDSCAPE, '#7c3aed', '#7c3aed', 800, 400, 900, 460);
    const afterDrawing = await waitForThumbnailChange(slideA, afterA, colors, 'purple');

    // C7, C8: manual refresh yields a genuinely new render for both, content unchanged.
    const beforeManualA = await sampleThumbnail(slideA, colors);
    const landscapeBeforeManual = await rasterCount(page, LANDSCAPE_DIMS);
    const portraitBeforeManual = await rasterCount(page, PORTRAIT_DIMS);
    await sidebar.getByRole('button', { name: 'Refresh slide previews' }).click();
    await expect.poll(async () => rasterCount(page, LANDSCAPE_DIMS), { timeout: 60_000 }).toBeGreaterThan(landscapeBeforeManual);
    await expect.poll(async () => rasterCount(page, PORTRAIT_DIMS), { timeout: 60_000 }).toBeGreaterThan(portraitBeforeManual);
    await waitForRefreshButtonIdle(sidebar);
    const afterManualA = await sampleThumbnail(slideA, colors);
    expect(afterManualA.colorHits.red).toBeGreaterThan(12);
    expect(afterManualA.colorHits.purple).toBeGreaterThan(12);
    expect(afterManualA.hash).toBe(beforeManualA.hash);

    // C9: no transient chrome.
    await assertThumbnailHasNoTransientChrome(slideA);
    await assertThumbnailHasNoTransientChrome(slideB);

    // C10a: coalescing. Draw once, let it settle, then Ctrl+D twice back-to-back (measured
    // 40-55ms, PATCH-137 §7d) and prove exactly one new landscape raster for both duplicates.
    await drawStyledRectangle(page, slideA, LANDSCAPE, '#f97316', '#f97316', 650, 480, 750, 540);
    await waitForThumbnailChange(slideA, afterDrawing, colors, 'orange');
    const beforeDup = (await sceneElements(page)).length;
    const landscapeRastersBeforeDup = await rasterCount(page, LANDSCAPE_DIMS);
    await page.keyboard.press('ControlOrMeta+d');
    await page.keyboard.press('ControlOrMeta+d');
    await expect.poll(async () => (await sceneElements(page)).length).toBe(beforeDup + 2);
    await expect.poll(async () => rasterCount(page, LANDSCAPE_DIMS), { timeout: 15_000 }).toBeGreaterThan(landscapeRastersBeforeDup);
    expect(await rasterCount(page, LANDSCAPE_DIMS)).toBe(landscapeRastersBeforeDup + 1);

    // C10b: two-colour polling (race removed -- poll until BOTH are present, never assert
    // an intermediate single-colour state as settled).
    const beforeTeal = await sampleThumbnail(slideA, colors);
    await drawStyledRectangle(page, slideA, LANDSCAPE, '#14b8a6', '#14b8a6', 800, 480, 900, 540);
    await expect.poll(async () => {
      const sample = await sampleThumbnail(slideA, colors);
      return sample.colorHits.orange > 12 && sample.colorHits.teal > 12;
    }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(true);
    expect((await sampleThumbnail(slideA, colors)).hash).not.toBe(beforeTeal.hash);

    // C11: no React state-update/unmounted/act() console errors across the whole flow.
    expect(consoleErrors.filter((entry) => /state update|unmounted|act\(/i.test(entry))).toEqual([]);
  });
});
