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

const LANDSCAPE_TITLE = 'PATCH-064 Landscape';
const PORTRAIT_TITLE = 'PATCH-064 Portrait';
const LANDSCAPE_ASPECT = 1280 / 720;
const PORTRAIT_ASPECT = 720 / 1280;
const ASPECT_TOLERANCE = 0.02;

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  expectedAspect: number;
};

type PreviewMeasurement = {
  viewport: { width: number; height: number };
  viewer: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  slide: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  image: { width: number; height: number; naturalWidth: number; naturalHeight: number; srcLength: number };
  footerHeight: number;
  slideAspect: number;
  imageNaturalAspect: number;
  viewerScrollHeight: number;
  viewerClientHeight: number;
  documentScrollHeight: number;
  documentClientHeight: number;
  insideViewer: boolean;
  noViewerOverflow: boolean;
  noPageOverflow: boolean;
};

const VIEWPORTS: ViewportCase[] = [
  { name: 'full-hd', width: 1920, height: 1080, expectedAspect: LANDSCAPE_ASPECT },
  { name: 'wide-height-constrained', width: 1600, height: 700, expectedAspect: LANDSCAPE_ASPECT },
  { name: 'very-short-height-constrained', width: 1920, height: 600, expectedAspect: LANDSCAPE_ASPECT },
  { name: 'workstation', width: 1440, height: 900, expectedAspect: LANDSCAPE_ASPECT },
  { name: 'laptop', width: 1366, height: 768, expectedAspect: LANDSCAPE_ASPECT },
  { name: 'narrower-practical', width: 1024, height: 768, expectedAspect: LANDSCAPE_ASPECT },
];

registerDrawingCleanup(test);

async function waitForHarness(page: Page): Promise<void> {
  await waitForE2EBridge(page);
}

async function waitForFramesLoaded(page: Page, expectedFrameCount: number): Promise<void> {
  await page.waitForFunction((count) => {
    const elements = window.__COLLABBOARD_E2E__?.getSceneElements();
    return Array.isArray(elements)
      && elements.filter((element) => {
        const item = element as { type?: string; isDeleted?: boolean };
        return item.type === 'frame' && !item.isDeleted;
      }).length >= count;
  }, expectedFrameCount, { timeout: 60_000 });
}

async function openPresentationSidebar(page: Page, expectedSlideCount: number): Promise<Locator> {
  await page.getByTitle('Present Frames').click();
  const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
  await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByText(`Slides (${expectedSlideCount})`, { exact: true })).toBeVisible({ timeout: 30_000 });
  return sidebar;
}

function slideRow(sidebar: Locator, title: string): Locator {
  return sidebar.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

function previewHeader(page: Page): Locator {
  return page.locator('[data-preview-viewport="true"]').locator('xpath=preceding-sibling::div[1]');
}

function previewModal(page: Page): Locator {
  return page.locator('[data-preview-viewport="true"]').locator('xpath=ancestor::div[contains(@class,"absolute")][1]');
}

async function openPreviewModal(page: Page, sidebar: Locator, title: string): Promise<Locator> {
  const row = slideRow(sidebar, title);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator('button').last().click();
  await page.getByRole('button', { name: 'Preview slide', exact: true }).click();

  const viewer = page.locator('[data-preview-viewport="true"]');
  await expect(viewer).toBeVisible({ timeout: 30_000 });
  await expect(previewHeader(page).getByText(title, { exact: true })).toBeVisible({ timeout: 30_000 });
  await waitForPreviewImage(page);
  return viewer;
}

async function waitForPreviewImage(page: Page): Promise<void> {
  const image = page.locator('[data-preview-slide="true"] img[alt="Slide"]');
  await expect(image).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => image.evaluate((img) => {
    const source = img as HTMLImageElement;
    return source.complete && source.naturalWidth > 100 && source.naturalHeight > 100 && source.src.length > 1000;
  }), { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe(true);
}

async function measurePreview(page: Page): Promise<PreviewMeasurement> {
  return page.evaluate(() => {
    const viewer = document.querySelector('[data-preview-viewport="true"]') as HTMLElement | null;
    const slide = document.querySelector('[data-preview-slide="true"]') as HTMLElement | null;
    const footer = document.querySelector('[data-preview-content="true"] [class*="text-center"]') as HTMLElement | null;
    const image = document.querySelector('[data-preview-slide="true"] img[alt="Slide"]') as HTMLImageElement | null;
    if (!viewer || !slide || !image) throw new Error('PATCH-129 preview nodes were not mounted');

    const viewerBox = viewer.getBoundingClientRect();
    const slideBox = slide.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    const viewerStyle = getComputedStyle(viewer);
    const footerStyle = footer ? getComputedStyle(footer) : null;
    const footerHeight = footer
      ? footer.getBoundingClientRect().height
        + (footerStyle ? parseFloat(footerStyle.marginTop) + parseFloat(footerStyle.marginBottom) : 0)
      : 0;

    const viewerBounds = {
      left: viewerBox.left + parseFloat(viewerStyle.paddingLeft),
      right: viewerBox.right - parseFloat(viewerStyle.paddingRight),
      top: viewerBox.top + parseFloat(viewerStyle.paddingTop),
      bottom: viewerBox.bottom - parseFloat(viewerStyle.paddingBottom) - footerHeight,
      width: viewerBox.width - parseFloat(viewerStyle.paddingLeft) - parseFloat(viewerStyle.paddingRight),
      height: viewerBox.height - parseFloat(viewerStyle.paddingTop) - parseFloat(viewerStyle.paddingBottom) - footerHeight,
    };
    const slideBounds = {
      left: slideBox.left,
      right: slideBox.right,
      top: slideBox.top,
      bottom: slideBox.bottom,
      width: slideBox.width,
      height: slideBox.height,
    };
    const tolerance = 1.5;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      viewer: viewerBounds,
      slide: slideBounds,
      image: {
        width: imageBox.width,
        height: imageBox.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        srcLength: image.src.length,
      },
      footerHeight,
      slideAspect: slideBox.width / slideBox.height,
      imageNaturalAspect: image.naturalWidth / image.naturalHeight,
      viewerScrollHeight: viewer.scrollHeight,
      viewerClientHeight: viewer.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
      insideViewer:
        slideBox.left >= viewerBounds.left - tolerance
        && slideBox.right <= viewerBounds.right + tolerance
        && slideBox.top >= viewerBounds.top - tolerance
        && slideBox.bottom <= viewerBounds.bottom + tolerance,
      noViewerOverflow: viewer.scrollHeight <= viewer.clientHeight + tolerance,
      noPageOverflow: document.documentElement.scrollHeight <= document.documentElement.clientHeight + tolerance,
    };
  });
}

async function assertPreviewFits(page: Page, viewport: ViewportCase): Promise<PreviewMeasurement> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await waitForPreviewImage(page);
  await expect.poll(async () => {
    const measurement = await measurePreview(page);
    return {
      enteredPreview: measurement.image.naturalWidth > 100 && measurement.image.srcLength > 1000,
      insideViewer: measurement.insideViewer,
      noViewerOverflow: measurement.noViewerOverflow,
      noPageOverflow: measurement.noPageOverflow,
    };
  }, { timeout: 10_000, intervals: [100, 250, 500] }).toEqual({
    enteredPreview: true,
    insideViewer: true,
    noViewerOverflow: true,
    noPageOverflow: true,
  });

  const measurement = await measurePreview(page);
  expect(measurement.slide.width, `${viewport.name} slide has visible width`).toBeGreaterThan(100);
  expect(measurement.slide.height, `${viewport.name} slide has visible height`).toBeGreaterThan(60);
  expect(measurement.slide.bottom, `${viewport.name} bottom edge clipped`).toBeLessThanOrEqual(measurement.viewer.bottom + 1.5);
  expect(measurement.slide.top, `${viewport.name} top edge unreachable`).toBeGreaterThanOrEqual(measurement.viewer.top - 1.5);
  expect(measurement.slideAspect, `${viewport.name} slide aspect ratio`).toBeCloseTo(viewport.expectedAspect, 2);
  expect(Math.abs(measurement.imageNaturalAspect - viewport.expectedAspect), `${viewport.name} PNG natural aspect ratio`).toBeLessThan(ASPECT_TOLERANCE);
  expect(measurement.viewerScrollHeight, `${viewport.name} viewer scroll height`).toBeLessThanOrEqual(measurement.viewerClientHeight + 1.5);
  expect(measurement.documentScrollHeight, `${viewport.name} page scroll height`).toBeLessThanOrEqual(measurement.documentClientHeight + 1.5);
  return measurement;
}

test.describe('PATCH-129 presentation preview viewport fit', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('real preview modal contains the selected slide across width and height constrained viewports', async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const { supabase, fixture } = await createDisposableDrawingBoard('patch-129-fit');
    await seedDrawingContainers(supabase, fixture);
    await seedPresentationScene(supabase, fixture);
    await openDrawingBoard(page, fixture.boardId);
    await waitForHarness(page);
    await waitForFramesLoaded(page, 2);

    const sidebar = await openPresentationSidebar(page, 2);
    await expect(slideRow(sidebar, LANDSCAPE_TITLE).locator('img[alt="Slide preview"]')).toBeVisible({ timeout: 60_000 });
    await expect(slideRow(sidebar, PORTRAIT_TITLE).locator('img[alt="Slide preview"]')).toBeVisible({ timeout: 60_000 });

    const viewer = await openPreviewModal(page, sidebar, LANDSCAPE_TITLE);
    await expect(viewer).toBeVisible();
    await expect(previewHeader(page).getByRole('button', { name: /Prev/ })).toBeVisible();
    await expect(previewHeader(page).getByRole('button', { name: /Next/ })).toBeVisible();
    await expect(previewModal(page).getByRole('button', { name: 'Close' })).toBeVisible();

    const measurements: Record<string, PreviewMeasurement> = {};
    for (const viewport of VIEWPORTS) {
      measurements[viewport.name] = await assertPreviewFits(page, viewport);
    }

    expect(
      measurements['very-short-height-constrained'].slide.height,
      'short viewport must shrink from full HD height',
    ).toBeLessThan(measurements['full-hd'].slide.height - 120);

    await page.setViewportSize({ width: 1600, height: 900 });
    const tall = await assertPreviewFits(page, { name: 'resize-tall', width: 1600, height: 900, expectedAspect: LANDSCAPE_ASPECT });
    await page.setViewportSize({ width: 1600, height: 700 });
    const short = await assertPreviewFits(page, { name: 'resize-short', width: 1600, height: 700, expectedAspect: LANDSCAPE_ASPECT });
    await page.setViewportSize({ width: 1600, height: 900 });
    const tallAgain = await assertPreviewFits(page, { name: 'resize-tall-again', width: 1600, height: 900, expectedAspect: LANDSCAPE_ASPECT });
    expect(short.slide.height).toBeLessThan(tall.slide.height - 80);
    expect(tallAgain.slide.height).toBeGreaterThan(short.slide.height + 80);

    const landscapeSrc = await page.locator('[data-preview-slide="true"] img[alt="Slide"]').evaluate((img) => (img as HTMLImageElement).src);
    await previewHeader(page).getByRole('button', { name: /Next/ }).click();
    await expect(previewHeader(page).getByText(PORTRAIT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await waitForPreviewImage(page);
    await expect.poll(async () => page.locator('[data-preview-slide="true"] img[alt="Slide"]').evaluate((img) => (img as HTMLImageElement).src), {
      timeout: 60_000,
      intervals: [250, 500, 1_000],
    }).not.toBe(landscapeSrc);
    await assertPreviewFits(page, { name: 'portrait-next-slide', width: 1600, height: 700, expectedAspect: PORTRAIT_ASPECT });
    const activePortraitThumb = previewModal(page).getByRole('button', { name: new RegExp(`Slide preview\\s*${PORTRAIT_TITLE}`) });
    await expect(activePortraitThumb).toBeVisible();
    await expect(activePortraitThumb).toHaveClass(/border-violet-400/);

    expect(
      consoleErrors.filter((entry) => !/favicon|Failed to load resource|unpkg\.com\/@excalidraw\/excalidraw.*Virgil-Regular\.woff2/i.test(entry)),
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
