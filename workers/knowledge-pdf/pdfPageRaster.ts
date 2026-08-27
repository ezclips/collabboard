/**
 * P6J-F9-A1b -- worker-only PDF page rasterization.
 *
 * Produces WebP bytes for a page and nothing else: no Supabase, no Storage
 * path, no Knowledge status, no eligibility, no browser. A1c owns deciding
 * *whether* to render and *where* the bytes go. PDF.js is imported here and in
 * ./pdfGeometry.ts only -- the two importers workerIsolation.source.test.ts pins.
 */

/** Never magnify past 2x the intrinsic PDF points. */
export const KNOWLEDGE_RASTER_MAX_SCALE = 2;
export const KNOWLEDGE_RASTER_MAX_WIDTH_PX = 2000;
export const KNOWLEDGE_RASTER_MAX_HEIGHT_PX = 2000;
export const KNOWLEDGE_RASTER_MAX_PAGE_PIXELS = 4_000_000;
/** Whole-document ceiling: only this module meters attempted raster work. */
export const KNOWLEDGE_RASTER_MAX_DOCUMENT_PIXELS = 400_000_000;
export const KNOWLEDGE_RASTER_PAGE_TIMEOUT_MS = 20_000;
export const KNOWLEDGE_RASTER_WEBP_QUALITY = 80;
/** PDF pages are paper: undrawn area is white, never transparent. */
export const KNOWLEDGE_RASTER_BACKGROUND = '#FFFFFF';

export interface PdfRasterPage {
  readonly pageNumber: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pixelCount: number;
  readonly bytes: Uint8Array;
}

export type PdfRasterSkipReason =
  | 'document_load_failed' | 'page_load_failed' | 'invalid_geometry' | 'page_too_large'
  | 'document_budget_exhausted' | 'render_failed' | 'render_timeout' | 'encode_failed';

export interface PdfRasterSkip {
  readonly pageNumber: number;
  readonly reason: PdfRasterSkipReason;
  readonly detail?: string;
}

export interface PdfRasterResult {
  readonly pages: readonly PdfRasterPage[];
  readonly skipped: readonly PdfRasterSkip[];
}

// --- Injected seams (real implementations: PDF.js and @napi-rs/canvas) ---

export interface RasterContext {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
}

export interface RasterCanvas {
  getContext(kind: '2d'): RasterContext;
  encode(format: 'webp', quality: number): Promise<Uint8Array>;
}

export type RasterCanvasFactory = (width: number, height: number) => RasterCanvas;
export interface RasterViewport { readonly width: number; readonly height: number }
export interface RasterRenderTask { readonly promise: Promise<unknown>; cancel(): void }

export interface RasterPdfPage {
  readonly rotate: number;
  getViewport(options: { scale: number; rotation: number }): RasterViewport;
  render(options: { canvasContext: RasterContext; viewport: RasterViewport }): RasterRenderTask;
}

export interface RasterPdfDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<RasterPdfPage>;
  destroy(): Promise<void>;
}

export interface PdfPageRasterDeps {
  readonly loadDocument?: (bytes: Uint8Array) => Promise<RasterPdfDocument>;
  readonly createCanvas?: RasterCanvasFactory;
  readonly pageTimeoutMs?: number;
}

class RasterTimeoutError extends Error {}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isUsable = (value: number): boolean => Number.isFinite(value) && value > 0;

export type RasterDimensions =
  | {
      readonly ok: true; readonly scale: number; readonly widthPx: number;
      readonly heightPx: number; readonly pixelCount: number;
    }
  | { readonly ok: false; readonly reason: 'invalid_geometry' | 'page_too_large' };

/**
 * Target pixel size for a rotation-applied page, or why it cannot be drawn.
 *
 * The scale shrinks as needed to fit the pixel caps but never magnifies past
 * KNOWLEDGE_RASTER_MAX_SCALE, and is computed purely from intrinsic PDF
 * points -- server-side, so no device pixel ratio, CSS pixel, drawer width or
 * browser viewport takes part. It travels with the size so the canvas and the
 * render viewport are guaranteed to come from one computation.
 */
export function rasterDimensions(widthPoints: number, heightPoints: number): RasterDimensions {
  if (!isUsable(widthPoints) || !isUsable(heightPoints)) return { ok: false, reason: 'invalid_geometry' };
  const scale = Math.min(
    KNOWLEDGE_RASTER_MAX_SCALE,
    KNOWLEDGE_RASTER_MAX_WIDTH_PX / widthPoints,
    KNOWLEDGE_RASTER_MAX_HEIGHT_PX / heightPoints,
  );
  if (!isUsable(scale)) return { ok: false, reason: 'invalid_geometry' };
  const widthPx = Math.round(widthPoints * scale);
  const heightPx = Math.round(heightPoints * scale);
  // A sub-pixel side rounds to zero: skip the page rather than clamp it to 1px.
  if (!isUsable(widthPx) || !isUsable(heightPx)) return { ok: false, reason: 'invalid_geometry' };
  const pixelCount = widthPx * heightPx;
  if (widthPx > KNOWLEDGE_RASTER_MAX_WIDTH_PX || heightPx > KNOWLEDGE_RASTER_MAX_HEIGHT_PX
    || pixelCount > KNOWLEDGE_RASTER_MAX_PAGE_PIXELS) {
    return { ok: false, reason: 'page_too_large' };
  }
  return { ok: true, scale, widthPx, heightPx, pixelCount };
}

async function awaitRender(task: RasterRenderTask, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task.promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          // Cancelling is best-effort, but settling is not: reject from
          // `finally` so a cancel() that throws cannot leave this race
          // unsettled. An unsettled race would hang the page render until the
          // Worker Pool lease expired instead of degrading to a typed skip.
          try {
            task.cancel();
          } catch {
            // The page is abandoned either way; the timeout still classifies it.
          } finally {
            reject(new RasterTimeoutError('page render timed out'));
          }
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type AcceptedSize = Extract<RasterDimensions, { ok: true }>;

async function rasterizeOnePage(
  pageNumber: number,
  page: RasterPdfPage,
  rotation: number,
  size: AcceptedSize,
  createCanvas: RasterCanvasFactory,
  timeoutMs: number,
): Promise<PdfRasterPage | PdfRasterSkip> {
  let canvas: RasterCanvas;
  // Allocation, setup and the render itself share one guard: a missing native
  // backend or a page whose viewport throws mid-setup is a render failure, not
  // an exception the caller has to handle.
  try {
    canvas = createCanvas(size.widthPx, size.heightPx);
    const canvasContext = canvas.getContext('2d');
    canvasContext.fillStyle = KNOWLEDGE_RASTER_BACKGROUND;
    canvasContext.fillRect(0, 0, size.widthPx, size.heightPx);
    const viewport = page.getViewport({ scale: size.scale, rotation });
    await awaitRender(page.render({ canvasContext, viewport }), timeoutMs);
  } catch (error: unknown) {
    const reason = error instanceof RasterTimeoutError ? 'render_timeout' : 'render_failed';
    return { pageNumber, reason, detail: describe(error) };
  }

  try {
    const bytes = await canvas.encode('webp', KNOWLEDGE_RASTER_WEBP_QUALITY);
    return { pageNumber, widthPx: size.widthPx, heightPx: size.heightPx, pixelCount: size.pixelCount, bytes };
  } catch (error: unknown) {
    return { pageNumber, reason: 'encode_failed', detail: describe(error) };
  }
}

const isSkip = (value: PdfRasterPage | PdfRasterSkip): value is PdfRasterSkip => 'reason' in value;

/**
 * Rasterize every page, one at a time, without ever throwing.
 *
 * Callers get a total result: a page that cannot be drawn is reported as
 * skipped, so A1c can treat visuals as optional enhancement data rather than
 * an extraction failure. Every PDF.js and canvas call is guarded, including
 * the lazy page-dictionary reads and document teardown, so a malformed file
 * cannot turn optional visuals into a failed extraction.
 */
export async function rasterizePdfPages(
  bytes: Uint8Array,
  deps: PdfPageRasterDeps = {},
): Promise<PdfRasterResult> {
  const pages: PdfRasterPage[] = [];
  const skipped: PdfRasterSkip[] = [];
  const timeoutMs = deps.pageTimeoutMs ?? KNOWLEDGE_RASTER_PAGE_TIMEOUT_MS;

  let document: RasterPdfDocument;
  let createCanvas: RasterCanvasFactory;
  try {
    createCanvas = deps.createCanvas ?? (await nativeCanvasFactory());
    // PDF.js takes ownership of `data` and DETACHES it. The caller still needs
    // its bytes -- the worker writes them to the parser input file -- so the
    // loader only ever sees a copy.
    document = await (deps.loadDocument ?? loadWithPdfJs)(Uint8Array.from(bytes));
  } catch (error: unknown) {
    return { pages, skipped: [{ pageNumber: 0, reason: 'document_load_failed', detail: describe(error) }] };
  }

  try {
    let documentPixels = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      let page: RasterPdfPage;
      try {
        page = await document.getPage(pageNumber);
      } catch (error: unknown) {
        skipped.push({ pageNumber, reason: 'page_load_failed', detail: describe(error) });
        continue;
      }

      // Measure the rotation-applied page -- a 90/270 page displays transposed,
      // and the caps apply to what is actually drawn. Both limits are decided
      // here, BEFORE rasterizeOnePage allocates anything: a budget checked
      // after rendering would not have prevented spending the memory.
      //
      // PDF.js resolves the page dictionary lazily, so `rotate` and
      // `getViewport` read the file and can throw on a malformed page well
      // after getPage() succeeded. Guarded here so they become skips.
      let rotation: number;
      let size: RasterDimensions;
      try {
        rotation = page.rotate;
        const intrinsic = page.getViewport({ scale: 1, rotation });
        size = rasterDimensions(intrinsic.width, intrinsic.height);
      } catch (error: unknown) {
        skipped.push({ pageNumber, reason: 'invalid_geometry', detail: describe(error) });
        continue;
      }
      if (!size.ok) {
        skipped.push({ pageNumber, reason: size.reason });
        continue;
      }
      if (documentPixels + size.pixelCount > KNOWLEDGE_RASTER_MAX_DOCUMENT_PIXELS) {
        skipped.push({ pageNumber, reason: 'document_budget_exhausted' });
        continue;
      }

      // Charged on admission, never refunded: a page that allocates a canvas
      // and then times out or fails to encode has already spent the memory the
      // budget exists to bound, so the budget meters attempted work.
      documentPixels += size.pixelCount;
      const rendered = await rasterizeOnePage(pageNumber, page, rotation, size, createCanvas, timeoutMs);
      if (isSkip(rendered)) skipped.push(rendered);
      else pages.push(rendered);
    }
  } finally {
    // Teardown must never lose the pages that did render. try/catch rather than
    // `.catch()` so a destroy() that throws synchronously -- before it ever
    // returns a promise -- cannot escape and replace the result either.
    try {
      await document.destroy();
    } catch {
      // Nothing to salvage: the pages are already collected.
    }
  }

  return { pages, skipped };
}

async function loadWithPdfJs(bytes: Uint8Array): Promise<RasterPdfDocument> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  return (await task.promise) as unknown as RasterPdfDocument;
}

async function nativeCanvasFactory(): Promise<RasterCanvasFactory> {
  const { createCanvas } = await import('@napi-rs/canvas');
  return (width, height) => createCanvas(width, height) as unknown as RasterCanvas;
}
