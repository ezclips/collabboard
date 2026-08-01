import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';

const LANDSCAPE_TITLE = 'PATCH-064 Landscape';
const PORTRAIT_TITLE = 'PATCH-064 Portrait';
const CENTER_TOLERANCE_PX = 4;
const EDGE_TOLERANCE_PX = 2;
const DRIFT_TOLERANCE_PX = 1;

const VIEWPORTS = [
  { name: 'full-hd', width: 1920, height: 1080 },
  { name: 'workstation', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'narrower-practical', width: 1180, height: 760 },
] as const;

type NavigationMeasurement = {
  activeFrameId: string;
  frameName: string | null;
  liveFrameId: string;
  selectedIds: string[];
  zoom: number;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  panelWidth: number;
  rightInset: number;
  usable: { left: number; top: number; right: number; bottom: number; width: number; height: number; centerX: number; centerY: number };
  frameScreen: { left: number; top: number; right: number; bottom: number; width: number; height: number; centerX: number; centerY: number };
  centerOffset: { x: number; y: number };
  sceneFrame: { x: number; y: number; width: number; height: number };
};

registerDrawingCleanup(test);

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
  await expect.poll(async () => sidebar.evaluate((element) => element.getBoundingClientRect().width), { timeout: 10_000 }).toBeGreaterThan(250);
  return sidebar;
}

function slideRow(sidebar: Locator, title: string): Locator {
  return sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

function slideCard(row: Locator): Locator {
  return row.locator('div.rounded-xl').first();
}

async function clickSlide(sidebar: Locator, title: string): Promise<void> {
  const row = slideRow(sidebar, title);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator('button').first().click();
}

async function frameIdByTitle(page: Page, title: string): Promise<string> {
  return page.evaluate((targetTitle) => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getSceneElements?: () => any[] }; elements?: any[] } }).h;
    const elements = h?.app?.getSceneElements?.() ?? h?.elements ?? [];
    const frame = elements.find((element: any) =>
      element?.type === 'frame' && !element.isDeleted && element.name === targetTitle
    );
    if (!frame) throw new Error(`PATCH-130 frame not found: ${targetTitle}`);
    return frame.id;
  }, title);
}

async function measureNavigation(page: Page, frameId: string): Promise<NavigationMeasurement> {
  return page.evaluate((targetFrameId) => {
    const h = (window as Window & typeof globalThis & {
      h?: { app?: { getSceneElements?: () => any[]; getAppState?: () => any }; elements?: any[]; state?: any };
    }).h;
    const elements = h?.app?.getSceneElements?.() ?? h?.elements ?? [];
    const appState = h?.app?.getAppState?.() ?? h?.state;
    if (!appState) throw new Error('PATCH-130 Excalidraw appState unavailable');
    const frame = elements.find((element: any) =>
      element?.id === targetFrameId && element.type === 'frame' && !element.isDeleted
    );
    if (!frame) throw new Error(`PATCH-130 live frame missing: ${targetFrameId}`);

    const zoom = Number(appState?.zoom?.value ?? 1);
    const scrollX = Number(appState?.scrollX ?? 0);
    const scrollY = Number(appState?.scrollY ?? 0);
    const offsetLeft = Number(appState?.offsetLeft ?? 0);
    const offsetTop = Number(appState?.offsetTop ?? 0);
    const viewportEl = Array.from(document.querySelectorAll<HTMLElement>('*')).find((element) =>
      element.style.getPropertyValue('--drawing-visible-canvas-right-inset')
    ) ?? document.querySelector<HTMLElement>('.excalidraw')?.parentElement ?? document.body;
    const viewportRect = viewportEl.getBoundingClientRect();
    const sidebar = document.querySelector<HTMLElement>('.fixed.top-0.right-0.bottom-0.w-80');
    const sidebarRect = sidebar?.getBoundingClientRect() ?? null;
    if (!sidebarRect || sidebarRect.width <= 0) throw new Error('PATCH-130 presentation panel is not measurable');
    const visibleRight = Math.min(Math.max(sidebarRect.left, viewportRect.left), viewportRect.right);
    const measuredLeftInset = Number.isFinite(offsetLeft) ? Math.max(0, offsetLeft - viewportRect.left) : 0;
    const measuredTopInset = Number.isFinite(offsetTop) ? Math.max(0, offsetTop - viewportRect.top) : 0;
    const usable = {
      left: Math.min(viewportRect.right, viewportRect.left + measuredLeftInset),
      top: Math.min(viewportRect.bottom, viewportRect.top + measuredTopInset),
      right: Math.max(viewportRect.left + measuredLeftInset, visibleRight),
      bottom: Math.max(viewportRect.top + measuredTopInset, viewportRect.bottom),
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
    usable.width = usable.right - usable.left;
    usable.height = usable.bottom - usable.top;
    usable.centerX = usable.left + usable.width / 2;
    usable.centerY = usable.top + usable.height / 2;

    const left = (frame.x + scrollX) * zoom + offsetLeft;
    const top = (frame.y + scrollY) * zoom + offsetTop;
    const width = frame.width * zoom;
    const height = frame.height * zoom;
    const frameScreen = {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
    const selectedIds = Object.keys(appState?.selectedElementIds ?? {});

    return {
      activeFrameId: targetFrameId,
      frameName: (frame as { name?: string | null }).name ?? null,
      liveFrameId: frame.id,
      selectedIds,
      zoom,
      scrollX,
      scrollY,
      viewportWidth: window.innerWidth,
      panelWidth: sidebarRect.width,
      rightInset: viewportRect.right - visibleRight,
      usable,
      frameScreen,
      centerOffset: {
        x: frameScreen.centerX - usable.centerX,
        y: frameScreen.centerY - usable.centerY,
      },
      sceneFrame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    };
  }, frameId);
}

async function waitForCenteredFrame(page: Page, frameId: string): Promise<NavigationMeasurement> {
  await expect.poll(async () => {
    const m = await measureNavigation(page, frameId);
    return {
      liveFrameId: m.liveFrameId,
      selected: m.selectedIds,
      leftFits: m.frameScreen.left >= m.usable.left - EDGE_TOLERANCE_PX,
      rightFits: m.frameScreen.right <= m.usable.right + EDGE_TOLERANCE_PX,
      topFits: m.frameScreen.top >= m.usable.top - EDGE_TOLERANCE_PX,
      bottomFits: m.frameScreen.bottom <= m.usable.bottom + EDGE_TOLERANCE_PX,
      centerX: Math.abs(m.centerOffset.x) <= CENTER_TOLERANCE_PX,
      centerY: Math.abs(m.centerOffset.y) <= CENTER_TOLERANCE_PX,
      finiteZoom: Number.isFinite(m.zoom) && m.zoom > 0 && m.zoom <= 1,
      excludesSidebar: m.rightInset > 250 && m.usable.right <= m.viewportWidth - 250,
    };
  }, { timeout: 15_000, intervals: [100, 250, 500] }).toEqual({
    liveFrameId: frameId,
    selected: [frameId],
    leftFits: true,
    rightFits: true,
    topFits: true,
    bottomFits: true,
    centerX: true,
    centerY: true,
    finiteZoom: true,
    excludesSidebar: true,
  });
  return measureNavigation(page, frameId);
}

function assertStable(before: NavigationMeasurement, after: NavigationMeasurement): void {
  expect(Math.abs(after.scrollX - before.scrollX)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
  expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
  expect(Math.abs(after.zoom - before.zoom)).toBeLessThanOrEqual(0.001);
  expect(Math.abs(after.frameScreen.centerX - before.frameScreen.centerX)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
  expect(Math.abs(after.frameScreen.centerY - before.frameScreen.centerY)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
}

async function collectFrameIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getSceneElements?: () => any[] }; elements?: any[] } }).h;
    const elements = h?.app?.getSceneElements?.() ?? h?.elements ?? [];
    return elements
      .filter((element: any) => element?.type === 'frame' && !element.isDeleted)
      .map((element: any) => element.id);
  });
}

async function assertManualPanIsNotOverwritten(page: Page): Promise<void> {
  const canvas = page.locator('canvas.excalidraw__canvas.interactive').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('PATCH-130 interactive canvas missing for manual pan assertion');
  const before = await page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getAppState?: () => any }; state?: any } }).h;
    const state = h?.app?.getAppState?.() ?? h?.state;
    return { scrollX: Number(state?.scrollX ?? 0), scrollY: Number(state?.scrollY ?? 0) };
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(180, 120);
  await expect.poll(async () => page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getAppState?: () => any }; state?: any } }).h;
    const state = h?.app?.getAppState?.() ?? h?.state;
    return { scrollX: Number(state?.scrollX ?? 0), scrollY: Number(state?.scrollY ?? 0) };
  }), { timeout: 5_000, intervals: [100, 250] }).not.toEqual(before);
  const afterPan = await page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getAppState?: () => any }; state?: any } }).h;
    const state = h?.app?.getAppState?.() ?? h?.state;
    return { scrollX: Number(state?.scrollX ?? 0), scrollY: Number(state?.scrollY ?? 0) };
  });
  await page.waitForTimeout(800);
  const afterWait = await page.evaluate(() => {
    const h = (window as Window & typeof globalThis & { h?: { app?: { getAppState?: () => any }; state?: any } }).h;
    const state = h?.app?.getAppState?.() ?? h?.state;
    return { scrollX: Number(state?.scrollX ?? 0), scrollY: Number(state?.scrollY ?? 0) };
  });
  expect(Math.abs(afterWait.scrollX - afterPan.scrollX)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
  expect(Math.abs(afterWait.scrollY - afterPan.scrollY)).toBeLessThanOrEqual(DRIFT_TOLERANCE_PX);
}

test.describe('PATCH-130 slide navigation uses visible canvas geometry', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('existing and newly-created slides center and fit with the Presentation panel open', async ({ page }) => {
    test.setTimeout(240_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const viewportResults: NavigationMeasurement[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { supabase, fixture } = await createDisposableDrawingBoard(`patch-130-nav-${viewport.name}`);
      await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);
      await openDrawingBoard(page, fixture.boardId);
      await waitForHarness(page);
      await waitForFramesLoaded(page, 2);

      const sidebar = await openPresentationSidebar(page, 2);
      const landscapeId = await frameIdByTitle(page, LANDSCAPE_TITLE);
      const portraitId = await frameIdByTitle(page, PORTRAIT_TITLE);
      await expect(slideRow(sidebar, LANDSCAPE_TITLE).locator('img[alt="Slide preview"]')).toBeVisible({ timeout: 60_000 });
      await expect(slideRow(sidebar, PORTRAIT_TITLE).locator('img[alt="Slide preview"]')).toBeVisible({ timeout: 60_000 });

      const beforePortrait = await measureNavigation(page, portraitId);
      await clickSlide(sidebar, PORTRAIT_TITLE);
      await expect(slideCard(slideRow(sidebar, PORTRAIT_TITLE))).toHaveClass(/border-violet-400/, { timeout: 10_000 });
      const portrait = await waitForCenteredFrame(page, portraitId);
      expect(
        Math.abs(portrait.scrollX - beforePortrait.scrollX) > 1
          || Math.abs(portrait.scrollY - beforePortrait.scrollY) > 1
          || Math.abs(portrait.zoom - beforePortrait.zoom) > 0.001,
      ).toBe(true);

      await clickSlide(sidebar, PORTRAIT_TITLE);
      const portraitAgain = await waitForCenteredFrame(page, portraitId);
      assertStable(portrait, portraitAgain);

      await clickSlide(sidebar, LANDSCAPE_TITLE);
      await expect(slideCard(slideRow(sidebar, LANDSCAPE_TITLE))).toHaveClass(/border-violet-400/, { timeout: 10_000 });
      const landscape = await waitForCenteredFrame(page, landscapeId);
      expect(landscape.liveFrameId).toBe(landscapeId);
      expect(landscape.selectedIds).toEqual([landscapeId]);

      await clickSlide(sidebar, PORTRAIT_TITLE);
      const portraitAfterSwitch = await waitForCenteredFrame(page, portraitId);
      assertStable(portraitAgain, portraitAfterSwitch);
      viewportResults.push(portraitAfterSwitch);

      await page.setViewportSize({ width: Math.max(980, viewport.width - 180), height: viewport.height });
      await clickSlide(sidebar, PORTRAIT_TITLE);
      const resized = await waitForCenteredFrame(page, portraitId);
      expect(Math.abs(resized.usable.width - portraitAfterSwitch.usable.width)).toBeGreaterThan(20);
      expect(Math.abs(resized.scrollX - portraitAfterSwitch.scrollX) > 1 || Math.abs(resized.zoom - portraitAfterSwitch.zoom) > 0.001).toBe(true);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const beforeFrameIds = await collectFrameIds(page);
      await sidebar.getByTitle('Add slide').click();
      await waitForFramesLoaded(page, 3);
      await expect(sidebar.getByText('Slide 3', { exact: true })).toBeVisible({ timeout: 30_000 });
      const afterFrameIds = await collectFrameIds(page);
      const newFrameIds = afterFrameIds.filter((id) => !beforeFrameIds.includes(id));
      expect(newFrameIds).toHaveLength(1);
      const newFrame = await waitForCenteredFrame(page, newFrameIds[0]);
      expect(newFrame.frameName).toBe('Slide 3');
      await expect(sidebar.getByText('Slide 3', { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]').locator('div.rounded-xl').first()).toHaveClass(/border-violet-400/);

      if (viewport.name === 'full-hd') {
        await assertManualPanIsNotOverwritten(page);
      }
    }

    const fullHd = viewportResults.find((result) => result.activeFrameId && result.usable.width > 1500);
    const laptop = viewportResults.find((result) => result.usable.width < 1200);
    expect(fullHd).toBeTruthy();
    expect(laptop).toBeTruthy();
    expect(
      Math.abs((fullHd!.scrollX) - (laptop!.scrollX)) > 10
        || Math.abs((fullHd!.scrollY) - (laptop!.scrollY)) > 10
        || Math.abs((fullHd!.zoom) - (laptop!.zoom)) > 0.01,
    ).toBe(true);

    expect(
      consoleErrors.filter((entry) => !/favicon|Failed to load resource|unpkg\.com\/@excalidraw\/excalidraw.*Virgil-Regular\.woff2/i.test(entry)),
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
