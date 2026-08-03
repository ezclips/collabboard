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
// DB-seeded placeholder geometry for 'emb-slide-a', per embeddableElement()'s literal
// call site in seedPresentationScene() (drawingBridgeHarness.ts): height=260, and
// embeddableElement()'s own defaults version=1, versionNonce=1. Read as a constant
// rather than re-queried from the live page, because the natural-height convergence
// runs fast enough (see PATCH-145 §3a: t~1.8s) to race ahead of waitForE2EBridge --
// confirmed empirically: a live "at mount" read already showed the settled height.
const SEEDED_EMB_SLIDE_A = { height: 260, version: 1, versionNonce: 1 };

type EmbeddableGeometry = {
  id: string;
  link: string;
  frameId: string | null;
  width: number;
  height: number;
  version: number;
  versionNonce: number;
};

registerDrawingCleanup(test);

async function openSidebar(page: Page): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible({ timeout: 30_000 });
  return sidebar;
}

const row = (sidebar: Locator, title: string) =>
  sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
const thumb = (slideRow: Locator) => slideRow.locator('img[alt="Slide preview"]').first();

async function landscapeEmbeddables(page: Page): Promise<EmbeddableGeometry[]> {
  return page.evaluate((frameId) =>
    ((window.__COLLABBOARD_E2E__?.getSceneElements() ?? []) as Array<Record<string, unknown>>)
      .filter((el) => el.type === 'embeddable' && el.frameId === frameId && !el.isDeleted)
      .map((el) => ({
        id: String(el.id),
        link: String(el.link),
        frameId: typeof el.frameId === 'string' ? el.frameId : null,
        width: Number(el.width),
        height: Number(el.height),
        version: Number(el.version),
        versionNonce: Number(el.versionNonce),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  LANDSCAPE);
}

async function waitForStableLandscape(page: Page): Promise<EmbeddableGeometry[]> {
  let stableSince = 0;
  let previous = '';
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const current = await landscapeEmbeddables(page);
    expect(current.length).toBeGreaterThan(0);
    expect(current.some((entry) => entry.height > 80)).toBe(true);
    const serialized = JSON.stringify(current);
    if (serialized === previous) {
      stableSince ||= Date.now();
      if (Date.now() - stableSince >= 2_000) return current;
    } else {
      previous = serialized;
      stableSince = 0;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('PATCH-145 landscape embeddables did not converge to stable geometry');
}

async function sceneToScreen(page: Page, x: number, y: number) {
  const viewport = await page.evaluate(() => window.__COLLABBOARD_E2E__?.getViewport() as any);
  return {
    x: (x + viewport.scrollX) * viewport.zoom.value + viewport.offsetLeft,
    y: (y + viewport.scrollY) * viewport.zoom.value + viewport.offsetTop,
  };
}

async function attemptPortraitRectangle(page: Page, before: string[]): Promise<boolean> {
  await page.locator('[data-testid="toolbar-rectangle"]').click({ force: true });
  const a = await sceneToScreen(page, 2000, 950);
  const b = await sceneToScreen(page, 2140, 1050);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  try {
    await expect.poll(async () => page.evaluate(({ ids, frameId }) =>
      ((window.__COLLABBOARD_E2E__?.getSceneElements() ?? []) as Array<Record<string, unknown>>).some((el) =>
        !ids.includes(String(el.id)) && el.type === 'rectangle' && el.frameId === frameId && !el.isDeleted),
    { ids: before, frameId: PORTRAIT }), { timeout: 10_000, intervals: [250, 500] }).toBe(true);
    return true;
  } catch {
    return false;
  }
}

// KNOWN ENVIRONMENT LIMITATION (recorded in PATCH-145's governance record, not a defect in
// the fix under test): in this local harness, this specific gesture -- click the rectangle
// tool, drag on the portrait frame -- reliably registers zero scene mutation starting at a
// fixed later iteration (observed at iteration index 7) when many "create board, navigate,
// interact" cycles run back-to-back within one test. Ruled out as the cause, each tested to
// full reproduction across independent executions: draw coordinates/card overlap, click vs.
// keyboard tool-selection, poll timeout width (15s/40s), retry count, a fresh page per
// iteration, a fresh browser context per iteration (clears localStorage/IndexedDB, the one
// thing a fresh page does not), a 15s inter-iteration delay (rules out any time/rate-limit
// cause), and stale leftover database rows from prior runs (confirmed zero via direct query
// -- cleanup works). The remaining mechanism is unresolved. It does not affect the
// PATCH-145 geometry assertions themselves, which is what this file exists to characterize.
async function drawPortraitRectangle(page: Page, run: number): Promise<void> {
  const before = await page.evaluate(() => ((window.__COLLABBOARD_E2E__?.getSceneElements() ?? []) as Array<Record<string, unknown>>).map((el) => String(el.id)));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await attemptPortraitRectangle(page, before)) return;
    console.log(`PATCH145_DRAW_RETRY run=${run} attempt=${attempt} failed`);
  }
  const diag = await page.evaluate(({ ids }) => ({
    viewport: (window.__COLLABBOARD_E2E__?.getViewport() as any) ?? null,
    allElements: ((window.__COLLABBOARD_E2E__?.getSceneElements() ?? []) as Array<Record<string, unknown>>)
      .filter((el) => !ids.includes(String(el.id)))
      .map((el) => ({ id: el.id, type: el.type, frameId: el.frameId, x: el.x, y: el.y, width: el.width, height: el.height, isDeleted: el.isDeleted })),
  }), { ids: before });
  console.log(`PATCH145_DIAG run=${run} ` + JSON.stringify(diag));
  await page.screenshot({ path: `test-results/patch145-diag-run${run}.png`, fullPage: false }).catch(() => undefined);
  throw new Error(`PATCH-145: drawPortraitRectangle did not register after 3 attempts (run ${run})`);
}

test.describe('PATCH-145 embeddable natural-height convergence', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('culling and portrait-only edits do not rewrite landscape embeddable geometry', async ({ page }) => {
    const runs = Number(process.env.PATCH_145_RUNS ?? '1');
    test.setTimeout(Math.max(120_000, runs * 130_000));
    const metrics = [];
    for (let run = 0; run < runs; run += 1) {
      // createDisposableDrawingBoard() signs in fresh via GoTrue on every call (no shared
      // session, no backoff); pace iterations to stay clear of any per-IP sign-in burst
      // window (a 15s gap was tested and made no difference to the unrelated issue recorded
      // above drawPortraitRectangle, so this is a light, cheap precaution, not a fix for that).
      if (run > 0) await page.waitForTimeout(4_000);
      const { supabase, fixture } = await createDisposableDrawingBoard(`patch-145-${run}`);
      await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);
      await openDrawingBoard(page, fixture.boardId);
      await waitForE2EBridge(page);
      const sidebar = await openSidebar(page);
      const landscape = row(sidebar, 'PATCH-064 Landscape');
      const portrait = row(sidebar, 'PATCH-064 Portrait');
      await expect(landscape).toBeVisible();
      const visibleStable = await waitForStableLandscape(page);

      // Negative control (PATCH-145 §14 step 6, characterization acceptance #4):
      // the settle from the seeded placeholder geometry (SEEDED_EMB_SLIDE_A) to the
      // real content height is itself a legitimate natural-height change (real
      // content, no hidden ancestor). It must still update height and bump the
      // revision. The "before" side is the harness's known seed constant rather than
      // a live re-read, because the write happens fast enough to already be applied
      // by the time any in-page read is possible (confirmed empirically).
      const settledEntry = visibleStable.find((entry) => entry.link.endsWith(fixture.containerIds[0]));
      expect(settledEntry).toBeDefined();
      expect(settledEntry!.height).not.toBe(SEEDED_EMB_SLIDE_A.height);
      expect(settledEntry!.version).toBeGreaterThan(SEEDED_EMB_SLIDE_A.version);
      expect(settledEntry!.versionNonce).not.toBe(SEEDED_EMB_SLIDE_A.versionNonce);
      await thumb(portrait).click();
      await page.waitForTimeout(5_000);
      const afterCull = await landscapeEmbeddables(page);
      expect(afterCull).toEqual(visibleStable);
      expect(afterCull.every((entry) => entry.height !== 80)).toBe(true);
      await drawPortraitRectangle(page, run);
      await page.waitForTimeout(2_000);
      const afterPortraitEdit = await landscapeEmbeddables(page);
      expect(afterPortraitEdit).toEqual(afterCull);

      // Hidden -> visible repeat: navigating back to the culled/re-shown landscape
      // frame must not reintroduce the 153 -> 80 -> 153 oscillation PATCH-145 §3d
      // measured (3/3 runs) before the fix.
      await thumb(landscape).click();
      await page.waitForTimeout(3_000);
      const afterReshow = await landscapeEmbeddables(page);
      expect(afterReshow).toEqual(afterPortraitEdit);
      expect(afterReshow.every((entry) => entry.height !== 80)).toBe(true);

      metrics.push({
        visibleStable,
        afterCull,
        afterPortraitEdit,
        afterReshow,
        settledEntry,
      });
    }
    test.info().annotations.push({ type: 'patch-145-geometry', description: JSON.stringify(metrics) });
  });
});
