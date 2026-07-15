import type { SupabaseClient } from '@supabase/supabase-js';
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { planSlideComposition } from '../../components/presentation/slide-renderer/planSlideComposition';
import type { FrameSlide } from '../../components/presentation/PresentationPanel';
import type { Padlet } from '../../types/collabboard';
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
const NATIVE_TEXT_ID = 'text-landscape';
const NATIVE_SHAPE_ID = 'shape-landscape';
const LANDSCAPE_FRAME_ID = 'frame-landscape';
const SEEDED_NATIVE_IDS = [NATIVE_TEXT_ID, NATIVE_SHAPE_ID] as const;

type PersistedSceneElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  frameId?: string | null;
  strokeColor?: string | null;
  backgroundColor?: string | null;
  opacity?: number | null;
  isDeleted?: boolean;
  text?: string | null;
  originalText?: string | null;
  name?: string | null;
  link?: string | null;
};

type ImagePixelSummary = {
  totalPixels: number;
  transparentPixels: number;
  opaquePixels: number;
  meaningfulNonBackgroundPixels: number;
  meaningfulBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  nativeTextNonWhite: number;
  nativeShapeNonWhite: number;
  seededColorHits: {
    textColor: number;
    shapeStroke: number;
    shapeFill: number;
  };
};

type PngCensusEntry = {
  surface: 'fullscreen' | 'thumbnail';
  domOrder: number;
  slideIndex: number | null;
  slideTitle: string | null;
  bandPosition: 'below' | 'above' | 'merged' | 'unknown';
  srcPrefix: string;
  srcLength: number;
  isDataPng: boolean;
  naturalWidth: number;
  naturalHeight: number;
  renderedBox: { x: number; y: number; width: number; height: number };
  visible: boolean;
  loadStatus: 'loaded' | 'errored' | 'pending';
  pixelSummary: ImagePixelSummary | null;
};

type DiagnosisRow = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

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

function coerceSceneElement(raw: unknown): PersistedSceneElement {
  const value = raw as Record<string, unknown>;
  return {
    id: String(value.id ?? ''),
    type: String(value.type ?? ''),
    x: Number(value.x ?? 0),
    y: Number(value.y ?? 0),
    width: Number(value.width ?? 0),
    height: Number(value.height ?? 0),
    frameId: typeof value.frameId === 'string' ? value.frameId : value.frameId === null ? null : undefined,
    strokeColor: typeof value.strokeColor === 'string' ? value.strokeColor : value.strokeColor === null ? null : undefined,
    backgroundColor: typeof value.backgroundColor === 'string' ? value.backgroundColor : value.backgroundColor === null ? null : undefined,
    opacity: typeof value.opacity === 'number' ? value.opacity : value.opacity === null ? null : undefined,
    isDeleted: Boolean(value.isDeleted),
    text: typeof value.text === 'string' ? value.text : value.text === null ? null : undefined,
    originalText: typeof value.originalText === 'string' ? value.originalText : value.originalText === null ? null : undefined,
    name: typeof value.name === 'string' ? value.name : value.name === null ? null : undefined,
    link: typeof value.link === 'string' ? value.link : value.link === null ? null : undefined,
  };
}

function sceneFrameToSlide(element: PersistedSceneElement): FrameSlide {
  return {
    id: element.id,
    name: element.name ?? null,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

async function fetchPersistedScene(
  supabase: SupabaseClient,
  masterPadletId: string,
): Promise<{ sceneElements: PersistedSceneElement[]; rawContentLength: number }> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,content')
    .eq('id', masterPadletId)
    .single();
  if (error) throw error;
  const rawContent = typeof data.content === 'string' ? data.content : '[]';
  const parsed = JSON.parse(rawContent) as unknown[];
  return {
    sceneElements: parsed.map(coerceSceneElement),
    rawContentLength: rawContent.length,
  };
}

async function fetchBoardPadlets(supabase: SupabaseClient, boardId: string): Promise<Padlet[]> {
  const { data, error } = await supabase
    .from('padlets')
    .select('*')
    .eq('board_id', boardId);
  if (error) throw error;
  return (data ?? []) as Padlet[];
}

async function collectPngCensus(
  page: Page,
  surface: 'fullscreen' | 'thumbnail',
  slideTitles: string[],
  activeSlideIndex: number | null,
  activeSlideTitle: string | null,
): Promise<PngCensusEntry[]> {
  const selector = surface === 'fullscreen'
    ? 'div[style*="z-index: 9999"] img[src^="data:image/png"][alt=""]'
    : 'img[src^="data:image/png"][alt="Slide preview"]';
  return page.locator(selector).evaluateAll(async (images, args) => Promise.all(images.map(async (image, domOrder) => {
    const source = image as HTMLImageElement;
    await source.decode().catch(() => undefined);

    const naturalWidth = source.naturalWidth;
    const naturalHeight = source.naturalHeight;
    const rect = source.getBoundingClientRect();
    const style = getComputedStyle(source);
    const pixelSummary = (() => {
      if (!naturalWidth || !naturalHeight) return null;
      const canvas = document.createElement('canvas');
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(source, 0, 0);
      const rgba = context.getImageData(0, 0, naturalWidth, naturalHeight).data;
      const totalPixels = naturalWidth * naturalHeight;
      let transparentPixels = 0;
      let opaquePixels = 0;
      let meaningfulNonBackgroundPixels = 0;
      let minX = naturalWidth;
      let minY = naturalHeight;
      let maxX = 0;
      let maxY = 0;
      let textColor = 0;
      let shapeStroke = 0;
      let shapeFill = 0;

      const isApprox = (r: number, g: number, b: number, target: [number, number, number], tolerance = 24) =>
        Math.abs(r - target[0]) <= tolerance
        && Math.abs(g - target[1]) <= tolerance
        && Math.abs(b - target[2]) <= tolerance;

      for (let index = 0; index < rgba.length; index += 4) {
        const r = rgba[index];
        const g = rgba[index + 1];
        const b = rgba[index + 2];
        const a = rgba[index + 3];
        if (a <= 10) {
          transparentPixels += 1;
          continue;
        }
        opaquePixels += 1;
        if (isApprox(r, g, b, [17, 24, 39])) textColor += 1;
        if (isApprox(r, g, b, [37, 99, 235])) shapeStroke += 1;
        if (isApprox(r, g, b, [219, 234, 254])) shapeFill += 1;
        if (r < 245 || g < 245 || b < 245) {
          const pixel = index / 4;
          const x = pixel % naturalWidth;
          const y = Math.floor(pixel / naturalWidth);
          meaningfulNonBackgroundPixels += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      const countRegionNonWhite = (x: number, y: number, width: number, height: number) => {
        const scaleX = naturalWidth / 1280;
        const scaleY = naturalHeight / 720;
        const region = context.getImageData(
          Math.max(0, Math.round(x * scaleX)),
          Math.max(0, Math.round(y * scaleY)),
          Math.max(1, Math.round(width * scaleX)),
          Math.max(1, Math.round(height * scaleY)),
        ).data;
        let count = 0;
        for (let index = 0; index < region.length; index += 4) {
          if (region[index + 3] > 10 && (region[index] < 245 || region[index + 1] < 245 || region[index + 2] < 245)) {
            count += 1;
          }
        }
        return count;
      };

      return {
        totalPixels,
        transparentPixels,
        opaquePixels,
        meaningfulNonBackgroundPixels,
        meaningfulBounds: meaningfulNonBackgroundPixels > 0 ? { minX, minY, maxX, maxY } : null,
        nativeTextNonWhite: countRegionNonWhite(76, 76, 280, 48),
        nativeShapeNonWhite: countRegionNonWhite(76, 146, 130, 80),
        seededColorHits: {
          textColor,
          shapeStroke,
          shapeFill,
        },
      };
    })();

    return {
      surface: args.surface,
      domOrder,
      slideIndex: args.surface === 'thumbnail' ? domOrder + 1 : args.activeSlideIndex,
      slideTitle: args.surface === 'thumbnail' ? args.slideTitles[domOrder] ?? null : args.activeSlideTitle,
      bandPosition: args.surface === 'fullscreen'
        ? style.zIndex === '1'
          ? 'below'
          : style.zIndex === '3'
            ? 'above'
            : 'unknown'
        : 'merged',
      srcPrefix: source.currentSrc.slice(0, 32),
      srcLength: source.currentSrc.length,
      isDataPng: source.currentSrc.startsWith('data:image/png'),
      naturalWidth,
      naturalHeight,
      renderedBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
      loadStatus: !source.complete ? 'pending' : naturalWidth > 0 && naturalHeight > 0 ? 'loaded' : 'errored',
      pixelSummary,
    } satisfies PngCensusEntry;
  })), {
    surface,
    slideTitles,
    activeSlideIndex,
    activeSlideTitle,
  });
}

function classifySurfaceDiagnosis({
  persistedSceneMatchesSeed,
  missingNativeIds,
  relevantPngPresent,
  relevantPixelSummary,
}: {
  persistedSceneMatchesSeed: boolean;
  missingNativeIds: string[];
  relevantPngPresent: boolean;
  relevantPixelSummary: ImagePixelSummary | null;
}): DiagnosisRow {
  if (!persistedSceneMatchesSeed) return 'N4';
  if (missingNativeIds.length > 0) return 'N1';
  if (!relevantPngPresent) return 'N2';
  if (
    !relevantPixelSummary
    || (
      relevantPixelSummary.nativeTextNonWhite === 0
      && relevantPixelSummary.nativeShapeNonWhite === 0
      && (
        relevantPixelSummary.meaningfulNonBackgroundPixels === 0
        || (
          relevantPixelSummary.seededColorHits.textColor === 0
          && relevantPixelSummary.seededColorHits.shapeStroke === 0
          && relevantPixelSummary.seededColorHits.shapeFill === 0
        )
      )
    )
  ) {
    return 'N3';
  }
  return 'N5';
}

function recordConsoleSignal(entries: { type: string; text: string }[], message: ConsoleMessage) {
  if (message.type() === 'error' || message.type() === 'warning') {
    entries.push({ type: message.type(), text: message.text() });
  }
}

test.describe('drawing presentation browser characterization (PATCH-064)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('discovers real seeded frames and opens the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('presentation');
    const runtimeConsoleSignals: { type: string; text: string }[] = [];
    const runtimePageErrors: string[] = [];
    page.on('console', (message) => recordConsoleSignal(runtimeConsoleSignals, message));
    page.on('pageerror', (error) => runtimePageErrors.push(error.message));

    try {
      await seedDrawingContainers(supabase, fixture);
      await seedPresentationScene(supabase, fixture);

      expect(fixture.masterPadletId).not.toBeNull();
      const persistedScene = await fetchPersistedScene(supabase, fixture.masterPadletId!);
      const persistedPadlets = await fetchBoardPadlets(supabase, fixture.boardId);
      const landscapeFrame = persistedScene.sceneElements.find((element) => element.id === LANDSCAPE_FRAME_ID);
      expect(landscapeFrame).toBeTruthy();
      const landscapeSlide = sceneFrameToSlide(landscapeFrame!);
      const persistedElementSummaries = persistedScene.sceneElements.map((element, sceneIndex) => ({
        sceneIndex,
        id: element.id,
        type: element.type,
        frameId: element.frameId ?? null,
        link: element.link ?? null,
      }));
      const nativeElements = SEEDED_NATIVE_IDS.map((id) => persistedScene.sceneElements.find((element) => element.id === id));
      expect(nativeElements.every(Boolean)).toBe(true);
      const [persistedTextElement, persistedShapeElement] = nativeElements as PersistedSceneElement[];
      const nativeElementIndexes = SEEDED_NATIVE_IDS.map((id) => persistedScene.sceneElements.findIndex((element) => element.id === id));
      const persistedSceneMatchesSeed =
        persistedTextElement.id === NATIVE_TEXT_ID
        && persistedTextElement.type === 'text'
        && persistedTextElement.frameId === LANDSCAPE_FRAME_ID
        && persistedTextElement.x === 80
        && persistedTextElement.y === 80
        && persistedTextElement.width === 220
        && persistedTextElement.height === 32
        && persistedTextElement.strokeColor === '#111827'
        && persistedTextElement.backgroundColor === 'transparent'
        && persistedTextElement.opacity === 100
        && persistedTextElement.isDeleted === false
        && persistedTextElement.text === NATIVE_TEXT_VALUE
        && persistedTextElement.originalText === NATIVE_TEXT_VALUE
        && persistedShapeElement.id === NATIVE_SHAPE_ID
        && persistedShapeElement.type === 'rectangle'
        && persistedShapeElement.frameId === LANDSCAPE_FRAME_ID
        && persistedShapeElement.x === 80
        && persistedShapeElement.y === 150
        && persistedShapeElement.width === 120
        && persistedShapeElement.height === 70
        && persistedShapeElement.strokeColor === '#2563eb'
        && persistedShapeElement.backgroundColor === '#dbeafe'
        && persistedShapeElement.opacity === 100
        && persistedShapeElement.isDeleted === false;
      expect(nativeElementIndexes).toEqual([4, 5]);
      expect(persistedTextElement).toMatchObject({
        id: NATIVE_TEXT_ID,
        type: 'text',
        frameId: LANDSCAPE_FRAME_ID,
        x: 80,
        y: 80,
        width: 220,
        height: 32,
        strokeColor: '#111827',
        backgroundColor: 'transparent',
        opacity: 100,
        isDeleted: false,
        text: NATIVE_TEXT_VALUE,
        originalText: NATIVE_TEXT_VALUE,
      });
      expect(persistedShapeElement).toMatchObject({
        id: NATIVE_SHAPE_ID,
        type: 'rectangle',
        frameId: LANDSCAPE_FRAME_ID,
        x: 80,
        y: 150,
        width: 120,
        height: 70,
        strokeColor: '#2563eb',
        backgroundColor: '#dbeafe',
        opacity: 100,
        isDeleted: false,
      });
      expect(persistedTextElement.width).toBeGreaterThan(0);
      expect(persistedTextElement.height).toBeGreaterThan(0);
      expect(persistedShapeElement.width).toBeGreaterThan(0);
      expect(persistedShapeElement.height).toBeGreaterThan(0);
      expect(persistedTextElement.strokeColor).not.toBe('#ffffff');
      expect(persistedShapeElement.strokeColor).not.toBe('#ffffff');
      expect(persistedShapeElement.backgroundColor).not.toBe('#ffffff');

      const compositionPlan = planSlideComposition(landscapeSlide, persistedScene.sceneElements, persistedPadlets);
      const resolvedPadletIndexes = compositionPlan.resolvedPadlets.map((entry) => entry.zIndex);
      const padletIndexRange = resolvedPadletIndexes.length > 0
        ? {
            first: Math.min(...resolvedPadletIndexes),
            last: Math.max(...resolvedPadletIndexes),
          }
        : null;
      const nativeBelowIds = compositionPlan.nativeBelowElements.map((element) => String((element as { id: string }).id));
      const nativeAboveIds = compositionPlan.nativeAboveElements.map((element) => String((element as { id: string }).id));
      const missingNativeIds = SEEDED_NATIVE_IDS.filter((id) => !nativeBelowIds.includes(id) && !nativeAboveIds.includes(id));
      const expectedNativeBand = missingNativeIds.length > 0
        ? 'absent'
        : nativeAboveIds.some((id) => SEEDED_NATIVE_IDS.includes(id as typeof SEEDED_NATIVE_IDS[number]))
          ? 'above'
          : nativeBelowIds.some((id) => SEEDED_NATIVE_IDS.includes(id as typeof SEEDED_NATIVE_IDS[number]))
            ? 'below'
            : 'unknown';
      expect(resolvedPadletIndexes).toEqual([2, 3]);
      expect(compositionPlan.resolvedPadlets.map((entry) => String(entry.embeddable.id))).toEqual([
        'emb-slide-a',
        'emb-uploaded-image',
      ]);
      expect(nativeBelowIds).toEqual([]);
      expect(nativeAboveIds).toEqual([NATIVE_TEXT_ID, NATIVE_SHAPE_ID]);
      expect(expectedNativeBand).toBe('above');
      expect(missingNativeIds).toEqual([]);

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
      const thumbnailPngCensus = await collectPngCensus(page, 'thumbnail', slideTitles, null, null);
      const landscapeThumbnailPng = thumbnailPngCensus.find((entry) => entry.slideTitle === 'PATCH-064 Landscape') ?? null;
      expect(thumbnailPngCensus.length).toBeGreaterThanOrEqual(1);
      expect(landscapeThumbnailPng).not.toBeNull();
      expect(landscapeThumbnailPng).toMatchObject({
        surface: 'thumbnail',
        slideIndex: 1,
        slideTitle: 'PATCH-064 Landscape',
        bandPosition: 'merged',
        isDataPng: true,
        loadStatus: 'loaded',
      });

      await page.getByRole('button', { name: /Start presentation/i }).last().click();
      const fullscreen = page.locator('div[style*="z-index: 9999"]').first();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toBeVisible({ timeout: 60_000 });
      const slideOneHasPortraitChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child B`)).isVisible().catch(() => false);
      const slideOneHasLandscapeChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child A`)).isVisible().catch(() => false);
      expect(slideOneHasPortraitChild).toBe(true);
      expect(slideOneHasLandscapeChild).toBe(false);

      await page.getByTitle(/Next/).click();
      await expect(fullscreen.getByText('Slide 2 / 2', { exact: true })).toBeVisible();
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child A`))).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByAltText('PATCH-064 uploaded template image')).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByAltText('PATCH-064 uploaded template image')).toHaveAttribute('src', '/templates/moodboard.png');

      const fullscreenPngCensus = await collectPngCensus(page, 'fullscreen', slideTitles, 2, 'PATCH-064 Landscape');
      const expectedFullscreenNativeBand = fullscreenPngCensus.find((entry) => entry.bandPosition === expectedNativeBand) ?? null;
      const fullscreenBelowBand = fullscreenPngCensus.find((entry) => entry.bandPosition === 'below') ?? null;
      const fullscreenRow = classifySurfaceDiagnosis({
        persistedSceneMatchesSeed,
        missingNativeIds,
        relevantPngPresent: Boolean(expectedFullscreenNativeBand),
        relevantPixelSummary: expectedFullscreenNativeBand?.pixelSummary ?? null,
      });
      const thumbnailRow = classifySurfaceDiagnosis({
        persistedSceneMatchesSeed,
        missingNativeIds,
        relevantPngPresent: Boolean(landscapeThumbnailPng),
        relevantPixelSummary: landscapeThumbnailPng?.pixelSummary ?? null,
      });
      const primaryRow: DiagnosisRow = fullscreenRow;
      const defectIsSurfaceSpecific = fullscreenRow !== thumbnailRow;
      const visibleRuntimeErrors = [
        ...runtimeConsoleSignals.map((entry) => ({ source: 'console', ...entry })),
        ...runtimePageErrors.map((message) => ({ source: 'pageerror', type: 'error', text: message })),
      ];

      expect(fullscreenPngCensus.length).toBeGreaterThanOrEqual(1);
      expect(fullscreenBelowBand).not.toBeNull();
      expect(fullscreenBelowBand).toMatchObject({
        surface: 'fullscreen',
        slideIndex: 2,
        slideTitle: 'PATCH-064 Landscape',
        bandPosition: 'below',
        isDataPng: true,
        loadStatus: 'loaded',
      });
      expect(expectedFullscreenNativeBand).toBeNull();
      expect(fullscreenBelowBand?.pixelSummary).not.toBeNull();
      expect(fullscreenBelowBand?.pixelSummary?.nativeTextNonWhite ?? -1).toBe(0);
      expect(fullscreenBelowBand?.pixelSummary?.nativeShapeNonWhite ?? -1).toBe(0);
      expect(fullscreenBelowBand?.pixelSummary?.meaningfulNonBackgroundPixels ?? -1).toBe(0);
      expect(landscapeThumbnailPng?.pixelSummary).not.toBeNull();
      expect(landscapeThumbnailPng?.pixelSummary?.nativeTextNonWhite ?? 0).toBeGreaterThan(0);
      expect(landscapeThumbnailPng?.pixelSummary?.nativeShapeNonWhite ?? 0).toBeGreaterThan(0);
      expect(landscapeThumbnailPng?.pixelSummary?.meaningfulNonBackgroundPixels ?? 0).toBeGreaterThan(0);
      expect(primaryRow).toBe('N2');
      expect(fullscreenRow).toBe('N2');
      expect(thumbnailRow).toBe('N5');

      const rasterCounts = await nativeRasterCounts(page);
      expect(rasterCounts, `${NATIVE_TEXT_VALUE} / ${NATIVE_SHAPE_ID} current native PNG rendering defect`).toEqual({
        text: 0,
        shape: 0,
        total: 0,
        bounds: null,
      });

      test.info().annotations.push({
        type: 'patch-069-persisted-scene',
        description: JSON.stringify({
          rawContentLength: persistedScene.rawContentLength,
          persistedSceneMatchesSeed,
          nativeElementIds: SEEDED_NATIVE_IDS,
          nativeElementIndexes,
          elements: persistedElementSummaries,
          textElement: persistedTextElement,
          shapeElement: persistedShapeElement,
        }),
      });
      test.info().annotations.push({
        type: 'patch-069-composition-plan',
        description: JSON.stringify({
          padletIndexRange,
          resolvedPadlets: compositionPlan.resolvedPadlets.map((entry) => ({
            padletId: String(entry.padlet.id),
            embeddableId: String(entry.embeddable.id),
            zIndex: entry.zIndex,
          })),
          nativeBelowIds,
          nativeAboveIds,
          missingNativeIds,
          expectedNativeBand,
        }),
      });
      test.info().annotations.push({
        type: 'patch-069-fullscreen-png-census',
        description: JSON.stringify(fullscreenPngCensus),
      });
      test.info().annotations.push({
        type: 'patch-069-thumbnail-png-census',
        description: JSON.stringify(thumbnailPngCensus),
      });
      test.info().annotations.push({
        type: 'patch-069-native-raster-analysis',
        description: JSON.stringify({
          threshold: 'meaningful pixels require alpha > 10 and at least one RGB channel < 245; seeded-color hits use plus/minus 24 channel tolerance',
          expectedNativeBand,
          fullscreenBelowBand,
          fullscreenNativeBand: expectedFullscreenNativeBand,
          thumbnailLandscape: landscapeThumbnailPng,
        }),
      });
      test.info().annotations.push({
        type: 'patch-069-classification',
        description: JSON.stringify({
          primaryRow,
          fullscreenRow,
          thumbnailRow,
          defectIsSurfaceSpecific,
          persistedSceneMatchesSeed,
          nativeElementIds: SEEDED_NATIVE_IDS,
          nativeElementIndexes,
          padletIndexRange,
          plannedBands: {
            below: nativeBelowIds,
            above: nativeAboveIds,
          },
          expectedNativeBand,
          fullscreenPngCount: fullscreenPngCensus.length,
          thumbnailPngCount: thumbnailPngCensus.length,
          nativeBandPngPresent: Boolean(expectedFullscreenNativeBand),
          pixelAnalysis: {
            fullscreenBelowBand: fullscreenBelowBand?.pixelSummary ?? null,
            fullscreenNativeBand: expectedFullscreenNativeBand?.pixelSummary ?? null,
            thumbnailLandscape: landscapeThumbnailPng?.pixelSummary ?? null,
          },
          visibleRuntimeErrors,
          conciseRootCauseBoundary: 'N2: plan keeps the native elements in the landscape above band, the browser-visible fullscreen runtime never materializes that above-band PNG in RuntimeSlideRenderer.tsx, and the thumbnail path still renders the native content.',
        }),
      });

      await page.getByTitle(/Previous/).click();
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
