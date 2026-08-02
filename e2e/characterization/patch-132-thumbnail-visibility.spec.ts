import { expect, test, type Locator, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasE2ECredentials } from '../helpers/env';
import {
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  type DrawingFixture,
} from './drawingBridgeHarness';

// PATCH-132: characterizes active-slide thumbnail auto-scroll in the Presentation
// sidebar. Diagnosis (PATCH-132 §19) proved the thumbnail scheduler itself is not
// the bottleneck at this scale (queue concurrency 1, ~0.8-2.0ms per slide, changed-
// signature suppression intact) -- the only reproduced defect was that the active
// slide's thumbnail was never scrolled into view. This spec covers only that.
//
// Do not modify the closed PATCH-128, PATCH-129 or PATCH-130 characterization specs.

const SLIDE_COUNT = 12;
const OFFSCREEN_SLIDE_TITLE = `Slide ${SLIDE_COUNT}`;
const EDGE_TOLERANCE_PX = 2;
const DRIFT_TOLERANCE_PX = 1;

registerDrawingCleanup(test);

let fixtureIndexCounter = 0;
function nextFixtureFractionalIndex(): string {
  const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const next = fixtureIndexCounter;
  fixtureIndexCounter += 1;
  if (next >= digits.length) {
    throw new Error('PATCH-132 fixture needs more valid Excalidraw order keys');
  }
  return `a${digits[next]}`;
}

function frameElement(id: string, name: string, x: number, y: number): Record<string, unknown> {
  return {
    id,
    type: 'frame',
    name,
    x,
    y,
    width: 1280,
    height: 720,
    angle: 0,
    strokeColor: '#000000',
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
    index: nextFixtureFractionalIndex(),
    boundElements: null,
    link: null,
    locked: false,
  };
}

// Matches drawingBridgeHarness.ts's own (unexported) embeddableElement() shape --
// the scene element that makes a padlet render as an on-canvas [data-padlet-id]
// overlay card. Without at least one of these, openDrawingBoard's readiness wait
// never resolves, even though the padlet row itself exists in the database.
function embeddableElement(
  id: string,
  padletId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  frameId: string | null,
): Record<string, unknown> {
  return {
    id,
    type: 'embeddable',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: nextFixtureFractionalIndex(),
    isDeleted: false,
    groupIds: [],
    frameId,
    boundElements: null,
    updated: Date.now(),
    link: `padlet://${padletId}`,
    locked: false,
    customData: {},
  };
}

// Seeds a many-frame Drawing scene as a single master "drawing" padlet, matching
// the shape drawingBridgeHarness.ts's own (unexported) insertMasterPadlet produces.
// Not added to the shared harness: this spec is the only authorized test file for
// PATCH-132, and the harness file is not on the production/test allowlist.
//
// containerId is embedded inside "Slide 1" so the board has real, visible content
// on the one frame used for the "already visible slide" assertions, and so the
// containers seedDrawingContainers creates actually render as [data-padlet-id]
// overlays (a bare padlet row with no embeddable scene element renders nothing).
async function seedManySlides(
  supabase: SupabaseClient,
  fixture: DrawingFixture,
  count: number,
  containerId: string,
): Promise<void> {
  const frameIds = Array.from({ length: count }, (_unused, i) => `p132-frame-${i + 1}`);
  const elements: Record<string, unknown>[] = frameIds.map((id, i) =>
    frameElement(id, `Slide ${i + 1}`, i * 2000, 0),
  );
  elements.push(embeddableElement('p132-embeddable-1', containerId, 100, 100, 320, 220, frameIds[0]));

  const { error } = await supabase.from('padlets').insert({
    board_id: fixture.boardId,
    title: `${fixture.prefix} master`,
    content: JSON.stringify(elements),
    type: 'drawing',
    position_x: 0,
    position_y: 0,
    width: 0,
    height: 0,
    metadata: {
      patch132Harness: true,
      drawingAppState: JSON.stringify({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      drawingFiles: JSON.stringify({}),
    },
  });
  if (error) throw error;
}

async function waitForHarness(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const target = window as Window & typeof globalThis & { h?: { app?: unknown; elements?: unknown[] } };
    return Boolean(target.h?.app && Array.isArray(target.h.elements));
  }, { timeout: 90_000 });
}

async function waitForFramesLoaded(page: Page, expectedFrameCount: number): Promise<void> {
  await page.waitForFunction((count) => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getSceneElements?: () => unknown[] }; elements?: unknown[] } }).h;
    const elements = h?.app?.getSceneElements?.() ?? h?.elements;
    return Array.isArray(elements)
      && elements.filter((element) => {
        const item = element as { type?: string; isDeleted?: boolean };
        return item.type === 'frame' && !item.isDeleted;
      }).length >= count;
  }, expectedFrameCount, { timeout: 60_000 });
}

async function openPresentationSidebar(page: Page, expectedSlideCount: number): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80').first();
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByText(`Slides (${expectedSlideCount})`, { exact: true })).toBeVisible({ timeout: 30_000 });
  return sidebar;
}

function scrollContainer(sidebar: Locator): Locator {
  return sidebar.locator('[data-presentation-scroll-container="true"]');
}

function slideRowByTitle(sidebar: Locator, title: string): Locator {
  return sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[@data-slide-id][1]');
}

async function slideRowIdByTitle(sidebar: Locator, title: string): Promise<string> {
  const id = await slideRowByTitle(sidebar, title).getAttribute('data-slide-id');
  if (!id) throw new Error(`PATCH-132 slide row missing data-slide-id for title: ${title}`);
  return id;
}

function slideCard(row: Locator): Locator {
  return row.locator('div.rounded-xl').first();
}

async function clickSlide(sidebar: Locator, title: string): Promise<void> {
  const row = slideRowByTitle(sidebar, title);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator('button').first().click();
}

async function dispatchSlideActivationWithoutActionability(row: Locator): Promise<void> {
  const dispatched = await row.locator('button').first().evaluate((button) => (
    button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }))
  ));
  expect(dispatched).toBe(true);
}

// Waits for the warm-up thumbnail pass to fully settle (the "Generating previews…"
// UI state, driven by PATCH-124's useSlideThumbnails isGeneratingAny), so later
// "scrolling causes no new render" assertions aren't confounded by in-flight
// initial renders that have nothing to do with scrolling.
async function waitForThumbnailWarmupSettled(page: Page): Promise<void> {
  const generating = page.getByText('Generating previews…', { exact: true });
  await expect(generating).toBeHidden({ timeout: 120_000 });
  // Confirm it stays hidden rather than flapping mid-batch.
  await page.waitForTimeout(1_500);
  await expect(generating).toBeHidden({ timeout: 5_000 });
}

type RowBox = { top: number; bottom: number; left: number; right: number };

async function box(locator: Locator): Promise<RowBox> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('PATCH-132 element has no bounding box');
  return { top: b.y, bottom: b.y + b.height, left: b.x, right: b.x + b.width };
}

function fullyOutside(row: RowBox, container: RowBox): boolean {
  return row.bottom <= container.top || row.top >= container.bottom;
}

function fullyInside(row: RowBox, container: RowBox, tolerance: number): boolean {
  return row.top >= container.top - tolerance && row.bottom <= container.bottom + tolerance;
}

async function getCanvasAppState(page: Page): Promise<{ scrollX: number; scrollY: number; zoom: number }> {
  return page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getAppState?: () => any }; state?: any } }).h;
    const state = h?.app?.getAppState?.() ?? h?.state ?? {};
    return {
      scrollX: Number(state?.scrollX ?? 0),
      scrollY: Number(state?.scrollY ?? 0),
      zoom: Number(state?.zoom?.value ?? 1),
    };
  });
}

async function getSelectedElementIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getAppState?: () => any }; state?: any } }).h;
    const state = h?.app?.getAppState?.() ?? h?.state ?? {};
    return Object.keys(state?.selectedElementIds ?? {}).filter((id) => state.selectedElementIds[id]);
  });
}

test.describe('PATCH-132 active slide thumbnail auto-scroll', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('active slide thumbnail is scrolled into the sidebar viewport without touching the canvas or document', async ({ page }) => {
    test.setTimeout(300_000);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 900 });

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-132-thumbnail-scroll');
    // seedDrawingContainers gives the board a real app-owned container; the
    // many-frame scene embeds it into "Slide 1" so it renders as a
    // [data-padlet-id] overlay (openDrawingBoard's readiness wait requires this).
    await seedDrawingContainers(supabase, fixture);
    await seedManySlides(supabase, fixture, SLIDE_COUNT, fixture.containerIds[0]);

    await openDrawingBoard(page, fixture.boardId);
    await waitForHarness(page);
    await waitForFramesLoaded(page, SLIDE_COUNT);

    const sidebar = await openPresentationSidebar(page, SLIDE_COUNT);
    const scroller = scrollContainer(sidebar);
    await expect(scroller).toBeVisible({ timeout: 15_000 });

    // Assertion 10: slide order in the sidebar matches creation order (unchanged).
    const renderedTitles = await sidebar.locator('[data-slide-id]').evaluateAll((rows) =>
      rows.map((row) => row.querySelector('span')?.textContent?.trim() ?? ''),
    );
    expect(renderedTitles.filter(Boolean)).toEqual(
      Array.from({ length: SLIDE_COUNT }, (_unused, i) => `Slide ${i + 1}`),
    );

    await waitForThumbnailWarmupSettled(page);

    const offscreenFrameId = await slideRowIdByTitle(sidebar, OFFSCREEN_SLIDE_TITLE);

    // Assertion 1 & 2: sidebar exists; the target thumbnail starts fully outside
    // the sidebar's scrollable viewport (proving the mechanism under test can
    // actually be exercised, not assumed).
    const containerBoxBefore = await box(scroller);
    const targetRowBefore = await box(slideRowByTitle(sidebar, OFFSCREEN_SLIDE_TITLE));
    expect(fullyOutside(targetRowBefore, containerBoxBefore)).toBe(true);

    const documentScrollBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const scrollTopBefore = await scroller.evaluate((el) => el.scrollTop);
    expect(scrollTopBefore).toBe(0);

    // False-green guard, T0: the target row is attached but fully offscreen.
    // The first activation must not use locator.click(), because Playwright's
    // actionability checks scroll overflow ancestors before dispatching the
    // click, which would make the production effect a no-op.
    const targetRow = slideRowByTitle(sidebar, OFFSCREEN_SLIDE_TITLE);
    await expect(targetRow).toBeAttached({ timeout: 30_000 });
    expect(fullyOutside(targetRowBefore, containerBoxBefore)).toBe(true);
    const activeIdsBeforeDispatch = await getSelectedElementIds(page);
    expect(activeIdsBeforeDispatch).not.toEqual([offscreenFrameId]);

    // False-green guard, T1: immediately before dispatching the DOM click,
    // Playwright has not scrolled the sidebar and the row is still fully
    // offscreen. The event below is a real DOM click event on the thumbnail
    // button, but it bypasses Playwright actionability scrolling.
    const scrollTopImmediatelyBeforeDispatch = await scroller.evaluate((el) => el.scrollTop);
    const documentScrollImmediatelyBeforeDispatch = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const containerBoxImmediatelyBeforeDispatch = await box(scroller);
    const targetRowImmediatelyBeforeDispatch = await box(targetRow);
    expect(scrollTopImmediatelyBeforeDispatch).toBe(scrollTopBefore);
    expect(documentScrollImmediatelyBeforeDispatch).toEqual(documentScrollBefore);
    expect(fullyOutside(targetRowImmediatelyBeforeDispatch, containerBoxImmediatelyBeforeDispatch)).toBe(true);

    // Assertion 3 & 11: selecting the offscreen slide through the app's real
    // activation path changes the active slide, identified by stable frame ID
    // (not array index). This invokes DrawingLayout.tsx handleActivateSlide via
    // the thumbnail button's onClick without letting Playwright pre-scroll the
    // sidebar.
    await dispatchSlideActivationWithoutActionability(targetRow);
    await expect(slideCard(slideRowByTitle(sidebar, OFFSCREEN_SLIDE_TITLE))).toHaveClass(/border-violet-400/, { timeout: 15_000 });
    await expect.poll(() => getSelectedElementIds(page), { timeout: 15_000 }).toEqual([offscreenFrameId]);

    // False-green guard, T2 / assertions 4 & 5: the sidebar scroll container
    // moved only after activeSlideId changed, and the active thumbnail is now
    // fully visible (not merely partially).
    await expect.poll(async () => {
      const containerBox = await box(scroller);
      const rowBox = await box(slideRowByTitle(sidebar, OFFSCREEN_SLIDE_TITLE));
      return fullyInside(rowBox, containerBox, EDGE_TOLERANCE_PX);
    }, { timeout: 10_000, intervals: [50, 100, 250] }).toBe(true);
    const scrollTopAfterSelect = await scroller.evaluate((el) => el.scrollTop);
    expect(scrollTopAfterSelect).not.toBe(scrollTopBefore);

    // Assertion 6: the document/page did not scroll -- only the sidebar container.
    const documentScrollAfter = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(documentScrollAfter).toEqual(documentScrollBefore);

    // Assertion 9: reselecting the SAME active slide causes no drift.
    const scrollTopBeforeReselect = await scroller.evaluate((el) => el.scrollTop);
    await clickSlide(sidebar, OFFSCREEN_SLIDE_TITLE);
    await page.waitForTimeout(300);
    const scrollTopAfterReselect = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollTopAfterReselect - scrollTopBeforeReselect)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);

    // Assertion 8: selecting an already-visible slide causes no unnecessary scroll.
    // Which slide is "already visible" depends on where the sidebar scrolled to
    // reveal the offscreen target above, so it is discovered here rather than
    // assumed to be a fixed title (scrolling down to reveal the last slide can
    // scroll the first slide out of view, which the target must not be).
    const allSlideIds = await sidebar.locator('[data-slide-id]').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-slide-id')),
    );
    let alreadyVisibleTitle: string | null = null;
    for (let i = allSlideIds.length - 1; i >= 0; i -= 1) {
      if (allSlideIds[i] === offscreenFrameId) continue;
      const candidateTitle = `Slide ${i + 1}`;
      const candidateBox = await box(slideRowByTitle(sidebar, candidateTitle));
      const currentContainerBox = await box(scroller);
      if (fullyInside(candidateBox, currentContainerBox, EDGE_TOLERANCE_PX)) {
        alreadyVisibleTitle = candidateTitle;
        break;
      }
    }
    if (!alreadyVisibleTitle) throw new Error('PATCH-132 test setup: no other slide is visible alongside the active slide');
    const visibleFrameId = await slideRowIdByTitle(sidebar, alreadyVisibleTitle);

    const visibleRowBoxBefore = await box(slideRowByTitle(sidebar, alreadyVisibleTitle));
    const containerBoxBeforeVisibleClick = await box(scroller);
    expect(fullyInside(visibleRowBoxBefore, containerBoxBeforeVisibleClick, EDGE_TOLERANCE_PX)).toBe(true);
    const scrollTopBeforeVisibleClick = await scroller.evaluate((el) => el.scrollTop);
    await clickSlide(sidebar, alreadyVisibleTitle);
    await expect.poll(() => getSelectedElementIds(page), { timeout: 15_000 }).toEqual([visibleFrameId]);
    await page.waitForTimeout(300);
    const scrollTopAfterVisibleClick = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollTopAfterVisibleClick - scrollTopBeforeVisibleClick)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);

    // Re-select the offscreen slide so the remaining assertions (manual scroll,
    // idle stability, thumbnail-request isolation) run with activeSlideId
    // unchanged across them, per the governed behavior in PATCH-132 §19h/§9i.
    await clickSlide(sidebar, OFFSCREEN_SLIDE_TITLE);
    await expect.poll(() => getSelectedElementIds(page), { timeout: 15_000 }).toEqual([offscreenFrameId]);
    await page.waitForTimeout(300);

    // Assertion 7 (isolated): capture canvas appState immediately before the
    // manual sidebar scroll below, with activeSlideId settled and unchanging for
    // the rest of the test -- so the later comparison measures exactly "did
    // scrolling the sidebar move the canvas", with no intervening navigation to
    // confound it.
    const canvasStateBeforeManualScroll = await getCanvasAppState(page);

    // Assertion 12 (setup): install a non-invasive observer on thumbnail <img>
    // src changes. This reads DOM mutations only -- it does not call any
    // internal render or scroll function.
    await page.evaluate(() => {
      const sidebarEl = document.querySelector('.fixed.top-0.right-0.bottom-0.w-80');
      const scrollerEl = sidebarEl?.querySelector('[data-presentation-scroll-container="true"]');
      const w = window as Window & typeof globalThis & { __patch132ImgMutations?: number };
      w.__patch132ImgMutations = 0;
      if (!scrollerEl) return;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'src' && mutation.target.nodeName === 'IMG') {
            w.__patch132ImgMutations = (w.__patch132ImgMutations ?? 0) + 1;
          }
        }
      });
      observer.observe(scrollerEl, { attributes: true, subtree: true, attributeFilter: ['src'] });
      (w as any).__patch132StopObserving = () => observer.disconnect();
    });

    // Manual sidebar scroll (assertion 7 continued, 10 continued -> "manual
    // scroll stays put", and 13): a real wheel interaction over the sidebar
    // scroll container, not a synthetic scrollTop assignment.
    const scrollerBoxForWheel = await box(scroller);
    await page.mouse.move(
      (scrollerBoxForWheel.left + scrollerBoxForWheel.right) / 2,
      (scrollerBoxForWheel.top + scrollerBoxForWheel.bottom) / 2,
    );
    await page.mouse.wheel(0, -400);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 5_000, intervals: [50, 100, 250] })
      .not.toBe(scrollTopAfterReselect);
    const scrollTopAfterManualScroll = await scroller.evaluate((el) => el.scrollTop);

    // Assertion 13: idle after manual scroll -- no continuous scroll loop, and
    // (assertion 10) manual scroll is not fought/reverted while activeSlideId
    // is unchanged.
    await page.waitForTimeout(1_500);
    const scrollTopAfterIdle = await scroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollTopAfterIdle - scrollTopAfterManualScroll)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);

    // Assertion 12: the manual scroll above produced zero thumbnail <img> src
    // mutations -- sidebar scrolling alone never regenerates a thumbnail.
    const imgMutationsDuringScroll = await page.evaluate(() => {
      const w = window as Window & typeof globalThis & { __patch132ImgMutations?: number; __patch132StopObserving?: () => void };
      w.__patch132StopObserving?.();
      return w.__patch132ImgMutations ?? 0;
    });
    expect(imgMutationsDuringScroll).toBe(0);

    // Assertion 7: canvas appState is unchanged by the manual sidebar scroll --
    // sidebar scrolling never touches the canvas beyond PATCH-130's own existing
    // selection-driven navigation, which did not run again during this window.
    const canvasStateAfterManualScroll = await getCanvasAppState(page);
    expect(Math.abs(canvasStateAfterManualScroll.scrollX - canvasStateBeforeManualScroll.scrollX)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
    expect(Math.abs(canvasStateAfterManualScroll.scrollY - canvasStateBeforeManualScroll.scrollY)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
    expect(Math.abs(canvasStateAfterManualScroll.zoom - canvasStateBeforeManualScroll.zoom)).toBeLessThanOrEqual(0.001);

    expect(
      consoleErrors.filter((entry) => !/favicon|Failed to load resource|unpkg\.com\/@excalidraw\/excalidraw.*Virgil-Regular\.woff2/i.test(entry)),
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
