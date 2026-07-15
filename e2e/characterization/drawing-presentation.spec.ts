import { test, expect, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  openDrawingBoard,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';

const NATIVE_TEXT_VALUE = 'PATCH-064 native text';
const NATIVE_SHAPE_ID = 'shape-landscape';

async function nativeRasterCounts(page: Page) {
  const nativeLayers = page.locator('img[src^="data:image/png"][alt=""]');
  await expect(nativeLayers.first()).toBeVisible({ timeout: 60_000 });
  const counts = await nativeLayers.evaluateAll(async (images) => Promise.all(images.map(async (img) => {
    const source = img as HTMLImageElement;
    await source.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable for PATCH-064 native raster assertion');
    context.drawImage(source, 0, 0);
    const countNonWhite = (x: number, y: number, width: number, height: number) => {
      const scaleX = source.naturalWidth / 1280;
      const scaleY = source.naturalHeight / 720;
      const data = context.getImageData(
        Math.round(x * scaleX),
        Math.round(y * scaleY),
        Math.round(width * scaleX),
        Math.round(height * scaleY),
      ).data;
      let count = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245) count += 1;
      }
      return count;
    };
    const allPixels = context.getImageData(0, 0, source.naturalWidth, source.naturalHeight).data;
    let total = 0;
    let minX = source.naturalWidth;
    let minY = source.naturalHeight;
    let maxX = 0;
    let maxY = 0;
    for (let index = 0; index < allPixels.length; index += 4) {
      if (allPixels[index] < 245 || allPixels[index + 1] < 245 || allPixels[index + 2] < 245) {
        const pixel = index / 4;
        const x = pixel % source.naturalWidth;
        const y = Math.floor(pixel / source.naturalWidth);
        total += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      text: countNonWhite(76, 76, 280, 48),
      shape: countNonWhite(76, 146, 130, 80),
      total,
      bounds: total > 0 ? { minX, minY, maxX, maxY } : null,
    };
  })));
  return counts.sort((a, b) => b.total - a.total)[0] ?? { text: 0, shape: 0, total: 0, bounds: null };
}

test.describe('drawing presentation browser characterization (PATCH-064)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('discovers real seeded frames and opens the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('presentation');

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      const visitedUrl = await openDrawingBoard(page, fixture.boardId);
      expect(visitedUrl).toContain(`/dashboard/canvas/${fixture.boardId}`);
      await expect(page.locator(`[data-padlet-id="${fixture.containerIds[0]}"]`).first()).toBeVisible({ timeout: 90_000 });

      await page.getByTitle('Present Frames').click();
      const sidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
      await expect(page.getByText('Presentation', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(sidebar.getByText('Slides (2)', { exact: true })).toBeVisible();
      await expect(sidebar.getByText('PATCH-064 Landscape', { exact: true })).toBeVisible();
      await expect(sidebar.getByText('PATCH-064 Portrait', { exact: true })).toBeVisible();

      const slideTitles = await page
        .locator('.fixed.top-0.right-0.bottom-0.w-80')
        .getByText(/PATCH-064 (Landscape|Portrait)/)
        .allTextContents();
      const seededFrameTitles = fixture.frameIds.map((frameId) => (
        frameId === 'frame-portrait' ? 'PATCH-064 Portrait' : 'PATCH-064 Landscape'
      ));
      expect(slideTitles).toEqual(['PATCH-064 Landscape', 'PATCH-064 Portrait']);
      expect(seededFrameTitles).toEqual(['PATCH-064 Portrait', 'PATCH-064 Landscape']);
      expect(slideTitles).not.toEqual(seededFrameTitles);

      await expect(page.getByAltText('Slide preview').first()).toBeVisible({ timeout: 60_000 });

      await page.getByRole('button', { name: /Start presentation/i }).last().click();
      const fullscreen = page.locator('div[style*="z-index: 9999"]').first();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toBeVisible({ timeout: 60_000 });
      const slideOneHasPortraitChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child B`)).isVisible().catch(() => false);
      const slideOneHasLandscapeChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child A`)).isVisible().catch(() => false);
      expect(slideOneHasPortraitChild).toBe(true);
      expect(slideOneHasLandscapeChild).toBe(false);

      await page.getByTitle('Next (→)').click();
      await expect(fullscreen.getByText('Slide 2 / 2', { exact: true })).toBeVisible();
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child A`))).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByAltText('PATCH-064 uploaded template image')).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByAltText('PATCH-064 uploaded template image')).toHaveAttribute('src', '/templates/moodboard.png');
      const rasterCounts = await nativeRasterCounts(page);
      expect(rasterCounts, `${NATIVE_TEXT_VALUE} / ${NATIVE_SHAPE_ID} current native PNG rendering defect`).toEqual({
        text: 0,
        shape: 0,
        total: 0,
        bounds: null,
      });

      await page.getByTitle('Previous (←)').click();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toBeVisible();
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child B`))).toBeVisible({ timeout: 60_000 });
      await fullscreen.getByText('End presentation', { exact: true }).click();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toHaveCount(0);

      await page.getByTitle('Back to Dashboard').click();
      await page.waitForURL(/dashboard\/?$/, { timeout: 45_000 });
      await page.goto(`/dashboard/canvas/${fixture.boardId}`, { waitUntil: 'domcontentloaded' });
      await page.getByTitle('Present Frames').click();
      const reopenedSidebar = page.locator('.fixed.top-0.right-0.bottom-0.w-80');
      await expect(reopenedSidebar.getByText('Slides (2)', { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(reopenedSidebar.getByText('PATCH-064 Landscape', { exact: true })).toBeVisible();
      await expect(reopenedSidebar.getByText('PATCH-064 Portrait', { exact: true })).toBeVisible();
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
        boards: 0,
        padlets: 0,
        canvasLines: 0,
      });
    }
  });

  test.skip('external uploaded-image storage cleanup is narrowly skipped: deterministic fixture uses existing public/templates/moodboard.png and creates no storage object', async () => {
    // The real runtime assertion above covers uploaded-image rendering through
    // a seeded image padlet backed by an existing local public asset.
  });

  test.skip('AI-image slide behavior is narrowly skipped: no deterministic PATCH-064 AI-image fixture support exists in the approved harness', async () => {
    // Amendment 5 explicitly permits this AI-specific skip.
  });
});
