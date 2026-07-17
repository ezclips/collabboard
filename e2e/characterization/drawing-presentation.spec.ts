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
  registerDrawingCleanup,
  seedDrawingContainers,
  seedPresentationScene,
} from './drawingBridgeHarness';

const NATIVE_TEXT_VALUE = 'PATCH-064 native text';
const NATIVE_TEXT_ID = 'text-landscape';
const NATIVE_SHAPE_ID = 'shape-landscape';
const LANDSCAPE_FRAME_ID = 'frame-landscape';
const SEEDED_NATIVE_IDS = [NATIVE_TEXT_ID, NATIVE_SHAPE_ID] as const;

registerDrawingCleanup(test);

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

type ProbePixelSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ProbeToDataUrlEntry = {
  canvasId: number;
  provenance: 'production-or-unknown' | 'test-harness';
  width: number;
  height: number;
  timestamp: number;
  result: 'returned' | 'threw';
  dataUrlLength: number | null;
  errorMessage: string | null;
  topLeftPixel: ProbePixelSample | null;
  centerPixel: ProbePixelSample | null;
  bottomRightPixel: ProbePixelSample | null;
};

type ProbeCanvasTraceEntry = {
  kind: 'createElement' | 'getContext' | 'markHarness';
  canvasId: number;
  provenance: 'production-or-unknown' | 'test-harness';
  width: number;
  height: number;
  timestamp: number;
  contextType: string | null;
  excludedFromProductionAttribution: boolean;
  stackFingerprint: string | null;
};

type ProbeCanvasSummary = {
  canvasId: number;
  provenance: 'production-or-unknown' | 'test-harness';
  createdAt: number;
  width: number;
  height: number;
  getContextCallCount: number;
  getContextTimestamps: number[];
  toDataUrlCallCount: number;
  toDataUrlTimestamps: number[];
  mountedInDom: boolean;
  stackFingerprint: string | null;
  excludedFromProductionAttribution: boolean;
};

type ProbeFontEvent = {
  phase: 'call' | 'resolved' | 'rejected';
  timestamp: number;
  font: string;
  detail: string | null;
};

type ProbeImageMountEvent = {
  timestamp: number;
  mutationType: string;
  alt: string | null;
  zIndex: string | null;
  inferredBand: 'below' | 'above' | 'unknown';
  naturalWidth: number;
  naturalHeight: number;
  mountedOrUpdated: boolean;
  removed: boolean;
  srcPrefix: string;
  dataUrlLength: number;
};

type Patch070ProbeSnapshot = {
  active: boolean;
  resetAt: number;
  allCanvasTrace: ProbeCanvasSummary[];
  toDataUrlTrace: ProbeToDataUrlEntry[];
  canvasTrace: ProbeCanvasTraceEntry[];
  fontStatusTimeline: ProbeFontEvent[];
  imageMounts: ProbeImageMountEvent[];
};

async function nativeRasterCounts(page: Page) {
  const nativeLayers = page.locator('img[src^="data:image/png"][alt=""]');
  await expect(nativeLayers.first()).toBeVisible({ timeout: 60_000 });
  const counts = await nativeLayers.evaluateAll(async (images) => Promise.all(images.map(async (img) => {
    const source = img as HTMLImageElement;
    await source.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    (window as typeof window & {
      __patch070Stage0Probe?: { markHarnessCanvas: (canvas: HTMLCanvasElement) => void };
    }).__patch070Stage0Probe?.markHarnessCanvas(canvas);
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
      (window as typeof window & {
        __patch070Stage0Probe?: { markHarnessCanvas: (canvas: HTMLCanvasElement) => void };
      }).__patch070Stage0Probe?.markHarnessCanvas(canvas);
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

async function installPatch070Probe(page: Page) {
  await page.addInitScript(() => {
    const windowWithProbe = window as typeof window & {
      __patch070Stage0Probe?: {
        markHarnessCanvas: (canvas: HTMLCanvasElement) => void;
        reset: () => void;
        snapshot: () => Patch070ProbeSnapshot;
      };
    };

    if (windowWithProbe.__patch070Stage0Probe) return;

    type CanvasMeta = ProbeCanvasSummary & { canvas: HTMLCanvasElement };

    const canvasMeta = new WeakMap<HTMLCanvasElement, CanvasMeta>();
    const canvasMetas: CanvasMeta[] = [];
    let nextCanvasId = 1;
    const state: Patch070ProbeSnapshot = {
      active: false,
      resetAt: 0,
      allCanvasTrace: [],
      toDataUrlTrace: [],
      canvasTrace: [],
      fontStatusTimeline: [],
      imageMounts: [],
    };

    const ensureCanvasMeta = (canvas: HTMLCanvasElement) => {
      const existing = canvasMeta.get(canvas);
      if (existing) return existing;
      const created: CanvasMeta = {
        canvas,
        canvasId: nextCanvasId++,
        provenance: 'production-or-unknown',
        createdAt: Date.now(),
        width: canvas.width,
        height: canvas.height,
        getContextCallCount: 0,
        getContextTimestamps: [],
        toDataUrlCallCount: 0,
        toDataUrlTimestamps: [],
        mountedInDom: canvas.isConnected,
        stackFingerprint: new Error().stack?.split('\n').slice(2, 7).map((line) => line.trim()).join(' | ') ?? null,
        excludedFromProductionAttribution: false,
      };
      canvasMeta.set(canvas, created);
      canvasMetas.push(created);
      return created;
    };

    const refreshCanvasMeta = (canvas: HTMLCanvasElement, meta = ensureCanvasMeta(canvas)) => {
      meta.width = canvas.width;
      meta.height = canvas.height;
      meta.mountedInDom = canvas.isConnected;
      meta.excludedFromProductionAttribution = meta.provenance === 'test-harness';
      return meta;
    };

    const canvasSummary = (meta: CanvasMeta): ProbeCanvasSummary => ({
      canvasId: meta.canvasId,
      provenance: meta.provenance,
      createdAt: meta.createdAt,
      width: meta.width,
      height: meta.height,
      getContextCallCount: meta.getContextCallCount,
      getContextTimestamps: [...meta.getContextTimestamps],
      toDataUrlCallCount: meta.toDataUrlCallCount,
      toDataUrlTimestamps: [...meta.toDataUrlTimestamps],
      mountedInDom: meta.mountedInDom,
      stackFingerprint: meta.stackFingerprint,
      excludedFromProductionAttribution: meta.excludedFromProductionAttribution,
    });

    const recordCanvasTrace = (
      kind: ProbeCanvasTraceEntry['kind'],
      canvas: HTMLCanvasElement,
      contextType: string | null,
      meta = ensureCanvasMeta(canvas),
    ) => {
      if (!state.active) return;
      refreshCanvasMeta(canvas, meta);
      state.canvasTrace.push({
        kind,
        canvasId: meta.canvasId,
        provenance: meta.provenance,
        width: canvas.width,
        height: canvas.height,
        timestamp: Date.now(),
        contextType,
        excludedFromProductionAttribution: meta.excludedFromProductionAttribution,
        stackFingerprint: meta.stackFingerprint,
      });
    };

    const readPixel = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
    ): ProbePixelSample | null => {
      try {
        const data = context.getImageData(x, y, 1, 1).data;
        return {
          r: data[0] ?? 0,
          g: data[1] ?? 0,
          b: data[2] ?? 0,
          a: data[3] ?? 0,
        };
      } catch {
        return null;
      }
    };

    const recordImage = (image: HTMLImageElement, mutationType: string, removed = false) => {
      if (!state.active) return;
      const src = image.currentSrc || image.getAttribute('src') || '';
      if (!src.startsWith('data:image/png')) return;
      const style = window.getComputedStyle(image);
      const zIndex = style.zIndex || null;
      state.imageMounts.push({
        timestamp: Date.now(),
        mutationType,
        alt: image.getAttribute('alt'),
        zIndex,
        inferredBand: zIndex === '1' ? 'below' : zIndex === '3' ? 'above' : 'unknown',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        mountedOrUpdated: image.isConnected && !removed,
        removed,
        srcPrefix: src.slice(0, 32),
        dataUrlLength: src.length,
      });
    };

    const scanNodeForImages = (node: Node, reason: string) => {
      if (node instanceof HTMLImageElement) {
        recordImage(node, reason);
      }
      if (node instanceof Element) {
        node.querySelectorAll('img').forEach((image) => recordImage(image as HTMLImageElement, reason));
      }
    };

    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function createElementPatched(
      this: Document,
      ...args: Parameters<Document['createElement']>
    ) {
      const element = originalCreateElement.apply(this, args);
      if (String(args[0]).toLowerCase() === 'canvas' && element instanceof HTMLCanvasElement) {
        const meta = ensureCanvasMeta(element);
        recordCanvasTrace('createElement', element, null, meta);
      }
      return element;
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const patchedGetContext = function getContextPatched(
      this: HTMLCanvasElement,
      ...args: Parameters<HTMLCanvasElement['getContext']>
    ) {
      const meta = ensureCanvasMeta(this);
      const timestamp = Date.now();
      meta.getContextCallCount += 1;
      meta.getContextTimestamps.push(timestamp);
      recordCanvasTrace('getContext', this, typeof args[0] === 'string' ? args[0] : null, meta);
      return originalGetContext.apply(this, args as [any, any]);
    };
    const canvasPrototype = HTMLCanvasElement.prototype as any;
    canvasPrototype.getContext = patchedGetContext as any;

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function toDataURLPatched(
      this: HTMLCanvasElement,
      ...args: Parameters<HTMLCanvasElement['toDataURL']>
    ) {
      const meta = ensureCanvasMeta(this);
      const timestamp = Date.now();
      meta.toDataUrlCallCount += 1;
      meta.toDataUrlTimestamps.push(timestamp);
      refreshCanvasMeta(this, meta);
      const context = this.width > 0 && this.height > 0
        ? originalGetContext.call(this, '2d') as CanvasRenderingContext2D | null
        : null;
      const topLeftPixel = context ? readPixel(context, 0, 0) : null;
      const centerPixel = context
        ? readPixel(context, Math.max(0, Math.floor(this.width / 2)), Math.max(0, Math.floor(this.height / 2)))
        : null;
      const bottomRightPixel = context
        ? readPixel(context, Math.max(0, this.width - 1), Math.max(0, this.height - 1))
        : null;

      try {
        const dataUrl = originalToDataURL.apply(this, args);
        if (state.active) {
          state.toDataUrlTrace.push({
            canvasId: meta.canvasId,
            provenance: meta.provenance,
            width: this.width,
            height: this.height,
            timestamp,
            result: 'returned',
            dataUrlLength: dataUrl.length,
            errorMessage: null,
            topLeftPixel,
            centerPixel,
            bottomRightPixel,
          });
        }
        return dataUrl;
      } catch (error) {
        if (state.active) {
          state.toDataUrlTrace.push({
            canvasId: meta.canvasId,
            provenance: meta.provenance,
            width: this.width,
            height: this.height,
            timestamp,
            result: 'threw',
            dataUrlLength: null,
            errorMessage: error instanceof Error ? error.message : String(error),
            topLeftPixel,
            centerPixel,
            bottomRightPixel,
          });
        }
        throw error;
      }
    };

    const fontSetPrototype = Object.getPrototypeOf(document.fonts) as FontFaceSet;
    const originalFontLoad = fontSetPrototype.load;
    fontSetPrototype.load = function loadPatched(this: FontFaceSet, ...args: Parameters<FontFaceSet['load']>) {
      const font = String(args[0] ?? '');
      if (state.active) {
        state.fontStatusTimeline.push({
          phase: 'call',
          timestamp: Date.now(),
          font,
          detail: null,
        });
      }
      return originalFontLoad.apply(this, args).then(
        (result) => {
          if (state.active) {
            state.fontStatusTimeline.push({
              phase: 'resolved',
              timestamp: Date.now(),
              font,
              detail: Array.isArray(result) ? String(result.length) : null,
            });
          }
          return result;
        },
        (error) => {
          if (state.active) {
            state.fontStatusTimeline.push({
              phase: 'rejected',
              timestamp: Date.now(),
              font,
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          throw error;
        },
      );
    };

    const observer = new MutationObserver((mutations) => {
      if (!state.active) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => scanNodeForImages(node, 'childList:add'));
          mutation.removedNodes.forEach((node) => {
            if (node instanceof HTMLImageElement) {
              recordImage(node, 'childList:remove', true);
            }
            if (node instanceof Element) {
              node.querySelectorAll('img').forEach((image) => recordImage(image as HTMLImageElement, 'childList:remove', true));
            }
          });
        }
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
          recordImage(mutation.target, `attr:${mutation.attributeName ?? 'unknown'}`);
        }
      }
    });

    const startObserver = () => {
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'style'],
        });
      }
    };
    startObserver();
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    }

    windowWithProbe.__patch070Stage0Probe = {
      markHarnessCanvas: (canvas: HTMLCanvasElement) => {
        const meta = ensureCanvasMeta(canvas);
        meta.provenance = 'test-harness';
        meta.excludedFromProductionAttribution = true;
        recordCanvasTrace('markHarness', canvas, null, meta);
      },
      reset: () => {
        state.active = true;
        state.resetAt = Date.now();
        state.allCanvasTrace = [];
        state.toDataUrlTrace = [];
        state.canvasTrace = [];
        state.fontStatusTimeline = [];
        state.imageMounts = [];
      },
      snapshot: () => JSON.parse(JSON.stringify({
        ...state,
        allCanvasTrace: canvasMetas.map((meta) => canvasSummary(refreshCanvasMeta(meta.canvas, meta))),
      })) as Patch070ProbeSnapshot,
    };
  });
}

test.describe('drawing presentation browser characterization (PATCH-064)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('discovers real seeded frames and opens the real presentation UI', async ({ page }) => {
    test.setTimeout(240_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('presentation');
    const runtimeConsoleSignals: { type: string; text: string }[] = [];
    const runtimePageErrors: string[] = [];
    await installPatch070Probe(page);
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

      const fullscreenOrderBefore = seededFrameTitles;
      const fullscreenOrderAfter = slideTitles;
      const defaultStartTargetBefore = {
        source: 'raw-activeFrames[0]',
        slideTitle: seededFrameTitles[0] ?? null,
      };
      const defaultStartTargetAfter = {
        source: 'canonical-orderedSlides[0]',
        slideTitle: slideTitles[0] ?? null,
      };
      const fullscreenVisitOrder: string[] = [];

      await page.evaluate(() => {
        const windowWithProbe = window as typeof window & {
          __patch070Stage0Probe?: {
            reset: () => void;
          };
        };
        windowWithProbe.__patch070Stage0Probe?.reset();
      });
      await page.getByRole('button', { name: /Start presentation/i }).last().click();
      const fullscreen = page.locator('div[style*="z-index: 9999"]').first();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toBeVisible({ timeout: 60_000 });
      const slideOneHasLandscapeChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child A`)).isVisible().catch(() => false);
      const slideOneHasPortraitChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child B`)).isVisible().catch(() => false);
      const extraRuntimePadlet = fullscreen.getByText(new RegExp(`${fixture.prefix} child C`));
      expect(slideOneHasLandscapeChild).toBe(true);
      expect(slideOneHasPortraitChild).toBe(false);
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child A`))).toBeVisible({ timeout: 60_000 });
      await expect(extraRuntimePadlet).toBeVisible({ timeout: 60_000 });
      const extraRuntimePadletStillLegitimate = await extraRuntimePadlet.isVisible().catch(() => false);
      await expect(fullscreen.getByAltText('PATCH-064 uploaded template image')).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByAltText('PATCH-064 uploaded template image')).toHaveAttribute('src', '/templates/moodboard.png');
      fullscreenVisitOrder.push('PATCH-064 Landscape');

      const fullscreenPngCensus = await collectPngCensus(page, 'fullscreen', slideTitles, 1, 'PATCH-064 Landscape');
      const patch070Probe = await page.evaluate(() => {
        const windowWithProbe = window as typeof window & {
          __patch070Stage0Probe?: {
            snapshot: () => Patch070ProbeSnapshot;
          };
        };
        return windowWithProbe.__patch070Stage0Probe?.snapshot() ?? {
          active: false,
          resetAt: 0,
          allCanvasTrace: [],
          toDataUrlTrace: [],
          canvasTrace: [],
          fontStatusTimeline: [],
          imageMounts: [],
        } satisfies Patch070ProbeSnapshot;
      });
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
      const activeCanvasIdSet = new Set([
        ...patch070Probe.canvasTrace.map((entry) => entry.canvasId),
        ...patch070Probe.toDataUrlTrace.map((entry) => entry.canvasId),
      ]);
      const activeCanvasTrace = patch070Probe.allCanvasTrace.filter((entry) => activeCanvasIdSet.has(entry.canvasId));
      const harnessCanvasIds = activeCanvasTrace
        .filter((entry) => entry.provenance === 'test-harness')
        .map((entry) => entry.canvasId);
      const productionCandidateCanvasIds = activeCanvasTrace
        .filter((entry) => entry.provenance === 'production-or-unknown' && !entry.excludedFromProductionAttribution)
        .map((entry) => entry.canvasId);
      const productionCandidateCanvasIdSet = new Set(productionCandidateCanvasIds);
      const productionToDataUrlEntries = patch070Probe.toDataUrlTrace.filter((entry) => productionCandidateCanvasIdSet.has(entry.canvasId));
      const successfulProductionToDataUrlEntries = productionToDataUrlEntries.filter((entry) => entry.result === 'returned');
      const belowExportCanvasId = successfulProductionToDataUrlEntries[0]?.canvasId ?? null;
      const aboveAttributableToDataUrlEntries = productionToDataUrlEntries.filter((entry) => entry.canvasId !== belowExportCanvasId);
      const fullscreenAboveImgObserved = Boolean(expectedFullscreenNativeBand);
      const fullscreenAboveImgEverMounted = patch070Probe.imageMounts.some((entry) => entry.zIndex === '3');
      const fullscreenBelowImgObserved = Boolean(fullscreenBelowBand);
      const aboveToDataUrlCalled = aboveAttributableToDataUrlEntries.length > 0;
      const aboveToDataUrlReturned = aboveAttributableToDataUrlEntries.some((entry) => entry.result === 'returned');
      const aboveToDataUrlThrew = aboveAttributableToDataUrlEntries.some((entry) => entry.result === 'threw');
      const postRunPersistedScene = await fetchPersistedScene(supabase, fixture.masterPadletId!);
      const postRunPersistedPadlets = await fetchBoardPadlets(supabase, fixture.boardId);
      const postRunElementOrder = postRunPersistedScene.sceneElements.map((element) => element.id);
      const preRunElementOrder = persistedScene.sceneElements.map((element) => element.id);
      const postRunCompositionPlan = planSlideComposition(landscapeSlide, postRunPersistedScene.sceneElements, postRunPersistedPadlets);
      const postRunNativeBelowIds = postRunCompositionPlan.nativeBelowElements.map((element) => String((element as { id: string }).id));
      const postRunNativeAboveIds = postRunCompositionPlan.nativeAboveElements.map((element) => String((element as { id: string }).id));
      const persistedOrderStable = preRunElementOrder.join('|') === postRunElementOrder.join('|');
      const nodePlanStable = postRunNativeBelowIds.join('|') === nativeBelowIds.join('|')
        && postRunNativeAboveIds.join('|') === nativeAboveIds.join('|')
        && postRunCompositionPlan.resolvedPadlets.map((entry) => entry.zIndex).join('|') === resolvedPadletIndexes.join('|');
      const noNativeMembersDropped = nativeBelowIds.length + nativeAboveIds.length === SEEDED_NATIVE_IDS.length
        && SEEDED_NATIVE_IDS.every((id) => nativeBelowIds.includes(id) || nativeAboveIds.includes(id));
      const fullscreenAbovePngs = fullscreenPngCensus.filter((entry) => entry.bandPosition === 'above');
      const fullscreenBelowPngs = fullscreenPngCensus.filter((entry) => entry.bandPosition === 'below');

      expect(fullscreenPngCensus.length).toBeGreaterThanOrEqual(1);
      expect(fullscreenBelowBand).not.toBeNull();
      expect(fullscreenBelowBand).toMatchObject({
        surface: 'fullscreen',
        slideIndex: 1,
        slideTitle: 'PATCH-064 Landscape',
        bandPosition: 'below',
        isDataPng: true,
        loadStatus: 'loaded',
      });
      expect(expectedFullscreenNativeBand).not.toBeNull();
      expect(expectedFullscreenNativeBand).toMatchObject({
        surface: 'fullscreen',
        slideIndex: 1,
        slideTitle: 'PATCH-064 Landscape',
        bandPosition: 'above',
        isDataPng: true,
        loadStatus: 'loaded',
      });
      expect(expectedFullscreenNativeBand?.naturalWidth ?? 0).toBeGreaterThan(0);
      expect(expectedFullscreenNativeBand?.naturalHeight ?? 0).toBeGreaterThan(0);
      expect(fullscreenBelowBand?.pixelSummary).not.toBeNull();
      expect(fullscreenBelowBand?.pixelSummary?.nativeTextNonWhite ?? -1).toBe(0);
      expect(fullscreenBelowBand?.pixelSummary?.nativeShapeNonWhite ?? -1).toBe(0);
      expect(fullscreenBelowBand?.pixelSummary?.meaningfulNonBackgroundPixels ?? -1).toBe(0);
      expect(expectedFullscreenNativeBand?.pixelSummary).not.toBeNull();
      expect(expectedFullscreenNativeBand?.pixelSummary?.nativeTextNonWhite ?? 0).toBeGreaterThan(0);
      expect(expectedFullscreenNativeBand?.pixelSummary?.nativeShapeNonWhite ?? 0).toBeGreaterThan(0);
      expect(expectedFullscreenNativeBand?.pixelSummary?.meaningfulNonBackgroundPixels ?? 0).toBeGreaterThan(0);
      expect(expectedFullscreenNativeBand?.pixelSummary?.seededColorHits.textColor ?? 0).toBeGreaterThan(0);
      expect(expectedFullscreenNativeBand?.pixelSummary?.seededColorHits.shapeStroke ?? 0).toBeGreaterThan(0);
      expect(landscapeThumbnailPng?.pixelSummary).not.toBeNull();
      expect(landscapeThumbnailPng?.pixelSummary?.nativeTextNonWhite ?? 0).toBeGreaterThan(0);
      expect(landscapeThumbnailPng?.pixelSummary?.nativeShapeNonWhite ?? 0).toBeGreaterThan(0);
      expect(landscapeThumbnailPng?.pixelSummary?.meaningfulNonBackgroundPixels ?? 0).toBeGreaterThan(0);
      expect(primaryRow).toBe('N5');
      expect(fullscreenRow).toBe('N5');
      expect(thumbnailRow).toBe('N5');
      expect(defectIsSurfaceSpecific).toBe(false);
      expect(fullscreenAbovePngs).toHaveLength(1);
      expect(fullscreenBelowPngs).toHaveLength(1);
      expect(noNativeMembersDropped).toBe(true);

      const rasterCounts = await nativeRasterCounts(page);
      expect(rasterCounts.text, `${NATIVE_TEXT_VALUE} current native PNG rendering`).toBeGreaterThan(0);
      expect(rasterCounts.shape, `${NATIVE_SHAPE_ID} current native PNG rendering`).toBeGreaterThan(0);
      expect(rasterCounts.total).toBeGreaterThan(0);
      expect(rasterCounts.bounds).not.toBeNull();
      expect(preRunElementOrder).toEqual(postRunElementOrder);
      expect(postRunNativeBelowIds).toEqual(nativeBelowIds);
      expect(postRunNativeAboveIds).toEqual(nativeAboveIds);
      expect(postRunPersistedScene.sceneElements).toEqual(persistedScene.sceneElements);
      expect(fullscreenAboveImgObserved).toBe(true);
      expect(fullscreenAboveImgEverMounted).toBe(true);
      expect(fullscreenBelowImgObserved).toBe(true);
      expect(aboveToDataUrlCalled).toBe(true);
      expect(aboveToDataUrlReturned).toBe(true);
      expect(aboveToDataUrlThrew).toBe(false);
      expect(extraRuntimePadletStillLegitimate).toBe(true);

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
        type: 'patch-070-native-raster-fix',
        description: JSON.stringify({
          originalDiagnosis: 'N2',
          originalStage0Row: 'F4',
          originalStage0BRow: 'G1d',
          primaryRow,
          fullscreenRow,
          thumbnailRow,
          defectIsSurfaceSpecific,
          rootCause: 'planSlideComposition previously assigned native elements between the first and last padlet to neither below nor above, so fullscreen never received an above-band native raster.',
          fixOwner: 'planSlideComposition',
          fixedProductionPath: 'components/presentation/slide-renderer/planSlideComposition.ts',
          planShapeChanged: false,
          resolverChanged: false,
          runtimeInputChanged: false,
          diagnosticsRemoved: true,
          persistedSceneMatchesSeed,
          nativeElementIds: SEEDED_NATIVE_IDS,
          nativeElementIndexes,
          padletIndexRange,
          plannedBands: {
            below: nativeBelowIds,
            above: nativeAboveIds,
          },
          expectedNativeBand,
          fixedNativeBelowIds: nativeBelowIds,
          fixedNativeAboveIds: nativeAboveIds,
          resolvedPadletIndexes,
          extraRuntimePadlet: {
            padletId: `${fixture.prefix} child C`,
            provenance: 'reconciliation-inserted, unpersisted embeddable resolved at runtime',
            stillLegitimate: extraRuntimePadletStillLegitimate,
          },
          fullscreenPngCount: fullscreenPngCensus.length,
          fullscreenBelowPngCount: fullscreenBelowPngs.length,
          fullscreenAbovePngCount: fullscreenAbovePngs.length,
          abovePngDimensions: expectedFullscreenNativeBand
            ? {
                naturalWidth: expectedFullscreenNativeBand.naturalWidth,
                naturalHeight: expectedFullscreenNativeBand.naturalHeight,
                renderedBox: expectedFullscreenNativeBand.renderedBox,
              }
            : null,
          thumbnailPngCount: thumbnailPngCensus.length,
          nativeBandPngPresent: Boolean(expectedFullscreenNativeBand),
          belowBandPngPresent: Boolean(fullscreenBelowBand),
          pixelAnalysis: {
            fullscreenBelowBand: fullscreenBelowBand?.pixelSummary ?? null,
            fullscreenAboveBand: expectedFullscreenNativeBand?.pixelSummary ?? null,
            thumbnailLandscape: landscapeThumbnailPng?.pixelSummary ?? null,
          },
          nativeRasterCounts: rasterCounts,
          thumbnailInvariant: thumbnailRow === 'N5',
          plannerInvariant: {
            nodePlanStable,
            noNativeMembersDropped,
            postRunNativeBelowIds,
            postRunNativeAboveIds,
          },
          persistedSceneInvariant: {
            persistedOrderStable,
            preRunElementOrder,
            postRunElementOrder,
            rawContentLengthBefore: persistedScene.rawContentLength,
            rawContentLengthAfter: postRunPersistedScene.rawContentLength,
          },
          frameOrderInvariant: persistedOrderStable,
          runtimeProbeEvidence: {
            activeCanvasTrace,
            harnessCanvasIds,
            productionCandidateCanvasIds,
            productionToDataUrlEntries,
            aboveAttributableToDataUrlEntries,
            aboveToDataUrlCalled,
            aboveToDataUrlReturned,
            aboveToDataUrlThrew,
            fullscreenBelowImgObserved,
            fullscreenAboveImgObserved,
            fullscreenAboveImgEverMounted,
            imageMounts: patch070Probe.imageMounts,
          },
          visibleRuntimeErrors,
          conciseFixBoundary: 'The planner now assigns every eligible native member to exactly one existing band using a single active-index domain. Native members before the first resolved padlet remain below; all remaining native members render above. The legitimate runtime padlet remains resolved, while the seeded native text and shape are no longer dropped from fullscreen composition.',
        }),
      });

      await page.getByTitle(/Next/).click();
      await expect(fullscreen.getByText('Slide 2 / 2', { exact: true })).toBeVisible();
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child B`))).toBeVisible({ timeout: 60_000 });
      const slideTwoHasLandscapeChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child A`)).isVisible().catch(() => false);
      expect(slideTwoHasLandscapeChild).toBe(false);
      fullscreenVisitOrder.push('PATCH-064 Portrait');

      await page.getByTitle(/Previous/).click();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toBeVisible();
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child A`))).toBeVisible({ timeout: 60_000 });
      await fullscreen.getByText('End presentation', { exact: true }).click();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toHaveCount(0);

      const openNamedPresentation = async (slideTitle: 'PATCH-064 Portrait' | 'PATCH-064 Landscape') => {
        const slideRow = sidebar
          .getByText(slideTitle, { exact: true })
          .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]/parent::div');
        await slideRow.locator('button').last().click();
        const menuStart = slideRow.getByRole('button', { name: 'Start presentation', exact: true });
        await expect(menuStart).toHaveCount(1);
        await expect(menuStart).toBeVisible({ timeout: 60_000 });
        await expect(menuStart).toBeEnabled();
        await menuStart.focus();
        await expect(menuStart).toBeFocused();
        await page.keyboard.press('Enter');
      };

      await openNamedPresentation('PATCH-064 Portrait');
      await expect(fullscreen.getByText('Slide 2 / 2', { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child B`))).toBeVisible({ timeout: 60_000 });
      await fullscreen.getByText('End presentation', { exact: true }).click();
      await expect(fullscreen.getByText('Slide 2 / 2', { exact: true })).toHaveCount(0);

      await openNamedPresentation('PATCH-064 Landscape');
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(fullscreen.getByText(new RegExp(`${fixture.prefix} child A`))).toBeVisible({ timeout: 60_000 });
      const namedLandscapeHasPortraitChild = await fullscreen.getByText(new RegExp(`${fixture.prefix} child B`)).isVisible().catch(() => false);
      expect(namedLandscapeHasPortraitChild).toBe(false);
      await fullscreen.getByText('End presentation', { exact: true }).click();
      await expect(fullscreen.getByText('Slide 1 / 2', { exact: true })).toHaveCount(0);

      test.info().annotations.push({
        type: 'patch-072-presentation-order',
        description: JSON.stringify({
          persistedRawOrder: seededFrameTitles,
          activeSceneOrder: seededFrameTitles,
          canonicalPanelOrder: slideTitles,
          fullscreenOrderBefore,
          fullscreenOrderAfter,
          defaultStartTargetBefore,
          defaultStartTargetAfter,
          bottomStartResult: {
            slideTitle: 'PATCH-064 Landscape',
            counter: 'Slide 1 / 2',
          },
          explicitPortraitStartResult: {
            slideTitle: 'PATCH-064 Portrait',
            counter: 'Slide 2 / 2',
          },
          explicitLandscapeStartResult: {
            slideTitle: 'PATCH-064 Landscape',
            counter: 'Slide 1 / 2',
          },
          startSlideId: {
            bottomStart: null,
            portrait: fixture.frameIds[0] ?? null,
            landscape: fixture.frameIds[1] ?? null,
          },
          startSlideResolvedIndex: {
            bottomStart: 1,
            portrait: 2,
            landscape: 1,
          },
          nextNavigationResult: {
            slideTitle: fullscreenVisitOrder[1] ?? null,
            counter: 'Slide 2 / 2',
          },
          previousNavigationResult: {
            slideTitle: fullscreenVisitOrder[0] ?? null,
            counter: 'Slide 1 / 2',
          },
          panelOrderChanged: false,
          pdfOrderChanged: false,
          pptxOrderChanged: false,
          thumbnailOrderChanged: false,
          plannerChanged: false,
          resolverChanged: false,
          drawingLayoutDefaultFallbackChanged: true,
          namedStartSemanticsPreserved: true,
          exactClassification: 'fullscreen-slide-order-aligned-with-canonical-panel-order',
        }),
      });

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
