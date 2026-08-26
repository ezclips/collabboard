import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_RASTER_BACKGROUND,
  KNOWLEDGE_RASTER_MAX_DOCUMENT_PIXELS,
  KNOWLEDGE_RASTER_MAX_PAGE_PIXELS,
  KNOWLEDGE_RASTER_MAX_SCALE,
  KNOWLEDGE_RASTER_WEBP_QUALITY,
  rasterDimensions,
  rasterizePdfPages,
} from './pdfPageRaster';
import type { RasterCanvas, RasterContext, RasterPdfDocument, RasterPdfPage } from './pdfPageRaster';

const A4 = { width: 595.276, height: 841.89 };
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

/** A canvas factory that records allocations and every context call, in order. */
function fakeCanvases(options: { encode?: () => Promise<Uint8Array> } = {}) {
  const allocations: Array<{ width: number; height: number }> = [];
  const calls: string[] = [];
  const createCanvas = (width: number, height: number): RasterCanvas => {
    allocations.push({ width, height });
    const context: RasterContext = {
      set fillStyle(value: string) { calls.push(`fillStyle=${value}`); },
      get fillStyle() { return KNOWLEDGE_RASTER_BACKGROUND; },
      fillRect: (x, y, w, h) => calls.push(`fillRect(${x},${y},${w},${h})`),
    };
    return {
      getContext: () => context,
      encode: options.encode ?? (async () => WEBP),
    };
  };
  return { allocations, calls, createCanvas };
}

interface FakePageOptions {
  readonly rotate?: number;
  readonly points?: { width: number; height: number };
  readonly render?: () => { promise: Promise<unknown>; cancel: () => void };
  readonly getPageFails?: boolean;
}

function fakeDocument(pages: readonly FakePageOptions[], onRender?: (delta: number) => void) {
  const destroy = vi.fn(async () => undefined);
  const cancels: number[] = [];
  const document: RasterPdfDocument = {
    numPages: pages.length,
    destroy,
    getPage: async (pageNumber: number) => {
      const spec = pages[pageNumber - 1];
      if (spec.getPageFails) throw new Error('page is corrupt');
      const rotate = spec.rotate ?? 0;
      const points = spec.points ?? A4;
      const page: RasterPdfPage = {
        rotate,
        // PDF.js transposes the viewport for quarter-turn rotations.
        getViewport: ({ scale, rotation }) => {
          const swap = rotation === 90 || rotation === 270;
          return {
            width: (swap ? points.height : points.width) * scale,
            height: (swap ? points.width : points.height) * scale,
          };
        },
        render: spec.render ?? (() => {
          onRender?.(1);
          return {
            promise: Promise.resolve().then(() => { onRender?.(-1); }),
            cancel: () => cancels.push(pageNumber),
          };
        }),
      };
      return page;
    },
  };
  return { document, destroy, cancels };
}

const load = (document: RasterPdfDocument) => async () => document;

describe('raster scale and dimensions', () => {
  it('magnifies a small page but never past 2x', () => {
    const small = rasterDimensions(100, 100);
    expect(small).toEqual({ ok: true, scale: KNOWLEDGE_RASTER_MAX_SCALE, widthPx: 200, heightPx: 200, pixelCount: 40_000 });
    expect(KNOWLEDGE_RASTER_MAX_SCALE).toBe(2);
    const a4 = rasterDimensions(A4.width, A4.height);
    expect(a4).toEqual({ ok: true, scale: 2, widthPx: 1191, heightPx: 1684, pixelCount: 1191 * 1684 });
  });

  it('shrinks a wide page to the width cap and a tall page to the height cap', () => {
    const wide = rasterDimensions(8000, 400);
    expect(wide.ok && wide.widthPx).toBe(2000);
    expect(wide.ok && wide.heightPx).toBe(100);

    const tall = rasterDimensions(400, 8000);
    expect(tall.ok && tall.heightPx).toBe(2000);
    expect(tall.ok && tall.widthPx).toBe(100);
  });

  it('honours both dimensions at once and never exceeds any cap', () => {
    for (const [w, h] of [[20000, 18000], [5000, 5000], [1, 20000], [A4.width, A4.height], [12, 9]]) {
      const size = rasterDimensions(w, h);
      if (!size.ok) continue;
      expect(size.widthPx).toBeGreaterThan(0);
      expect(size.heightPx).toBeGreaterThan(0);
      expect(size.widthPx).toBeLessThanOrEqual(2000);
      expect(size.heightPx).toBeLessThanOrEqual(2000);
      expect(size.pixelCount).toBeLessThanOrEqual(KNOWLEDGE_RASTER_MAX_PAGE_PIXELS);
      expect(size.pixelCount).toBe(size.widthPx * size.heightPx);
    }
  });

  it('refuses unusable geometry instead of clamping it into an arbitrary image', () => {
    for (const [w, h] of [[0, 100], [100, 0], [-5, 100], [Number.NaN, 100], [Number.POSITIVE_INFINITY, 100]]) {
      expect(rasterDimensions(w, h)).toEqual({ ok: false, reason: 'invalid_geometry' });
    }
    // An aspect ratio so extreme the short side rounds away is skipped, not clamped to 1px.
    expect(rasterDimensions(200000, 1)).toEqual({ ok: false, reason: 'invalid_geometry' });
  });
});

describe('page rotation', () => {
  it.each([
    [0, 1191, 1684],
    [180, 1191, 1684],
    [90, 1684, 1191],
    [270, 1684, 1191],
  ])('renders rotation %i at %ix%i', async (rotate, widthPx, heightPx) => {
    const canvases = fakeCanvases();
    const { document } = fakeDocument([{ rotate }]);
    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(result.skipped).toEqual([]);
    expect(result.pages[0]).toMatchObject({ pageNumber: 1, widthPx, heightPx });
    expect(canvases.allocations[0]).toEqual({ width: widthPx, height: heightPx });
  });
});

describe('resource ordering and background', () => {
  it('allocates no canvas at all until the limits have accepted the page', async () => {
    const canvases = fakeCanvases();
    const { document } = fakeDocument([{ points: { width: 200000, height: 1 } }]);
    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(canvases.allocations).toEqual([]);
    expect(result.pages).toEqual([]);
    expect(result.skipped).toEqual([{ pageNumber: 1, reason: 'invalid_geometry', detail: undefined }]);
  });

  it('paints the page white before PDF.js draws anything', async () => {
    const canvases = fakeCanvases();
    const order: string[] = [];
    const { document } = fakeDocument([{
      render: () => {
        order.push(...canvases.calls, 'render');
        return { promise: Promise.resolve(), cancel: () => {} };
      },
    }]);
    await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(order).toEqual([`fillStyle=${KNOWLEDGE_RASTER_BACKGROUND}`, 'fillRect(0,0,1191,1684)', 'render']);
    expect(KNOWLEDGE_RASTER_BACKGROUND).toBe('#FFFFFF');
  });

  it('stops adding pages once the document pixel budget is exhausted', async () => {
    const perPage = 1191 * 1684;
    const pageCount = Math.ceil(KNOWLEDGE_RASTER_MAX_DOCUMENT_PIXELS / perPage) + 1;
    const canvases = fakeCanvases();
    const { document } = fakeDocument(Array.from({ length: pageCount }, () => ({})));
    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(result.pages.length).toBeLessThan(pageCount);
    expect(result.skipped.at(-1)).toMatchObject({ reason: 'document_budget_exhausted' });
    const drawn = result.pages.reduce((total, page) => total + page.pixelCount, 0);
    expect(drawn).toBeLessThanOrEqual(KNOWLEDGE_RASTER_MAX_DOCUMENT_PIXELS);
    // The budget must stop the work, not just filter the results: the page it
    // refused was never allocated a canvas at all.
    expect(canvases.allocations).toHaveLength(result.pages.length);
  });

  it('charges attempted render work against the budget, not just successful output', async () => {
    const perPage = 1191 * 1684;
    const admitted = Math.floor(KNOWLEDGE_RASTER_MAX_DOCUMENT_PIXELS / perPage);
    // Every page is individually valid and gets admitted and allocated, then
    // fails after allocation. Under success-only accounting the budget would
    // still read zero and admit all of them.
    const canvases = fakeCanvases({ encode: async () => { throw new Error('codec missing'); } });
    const { document } = fakeDocument(Array.from({ length: admitted + 1 }, () => ({})));

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(result.pages).toEqual([]);
    expect(canvases.allocations).toHaveLength(admitted);
    expect(result.skipped.filter((skip) => skip.reason === 'encode_failed')).toHaveLength(admitted);
    // The page that crossed the budget was refused before allocation even
    // though not one earlier page produced a single WebP byte.
    expect(result.skipped.at(-1)).toEqual({ pageNumber: admitted + 1, reason: 'document_budget_exhausted' });
  });
});

describe('caller-owned bytes', () => {
  it('leaves the caller buffer readable after PDF.js detaches its copy', async () => {
    const original = new Uint8Array([37, 80, 68, 70, 45, 49]);
    const snapshot = Uint8Array.from(original);
    const { document } = fakeDocument([{}]);

    await rasterizePdfPages(original, {
      // Faithfully simulate PDF.js taking ownership: detach what it is handed.
      loadDocument: async (received) => {
        structuredClone(received.buffer, { transfer: [received.buffer] });
        expect(received.byteLength).toBe(0);
        return document;
      },
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(original.byteLength).toBe(snapshot.byteLength);
    expect([...original]).toEqual([...snapshot]);
  });
});

describe('sequential rendering and cleanup', () => {
  it('never runs two page renders at once', async () => {
    let active = 0;
    let peak = 0;
    const { document, destroy } = fakeDocument(
      Array.from({ length: 6 }, () => ({})),
      (delta) => { active += delta; peak = Math.max(peak, active); },
    );

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(peak).toBe(1);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('cancels a hung render, clears its timer, and still destroys the document', async () => {
    const cancel = vi.fn();
    const { document, destroy } = fakeDocument([{
      render: () => ({ promise: new Promise(() => {}), cancel }),
    }]);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: fakeCanvases().createCanvas,
      pageTimeoutMs: 10,
    });

    expect(result.pages).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ pageNumber: 1, reason: 'render_timeout' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    clearTimeoutSpy.mockRestore();
  });
});

describe('typed failures', () => {
  it('reports a document that cannot be loaded without throwing', async () => {
    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: async () => { throw new Error('not a PDF'); },
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(result.pages).toEqual([]);
    expect(result.skipped).toEqual([
      { pageNumber: 0, reason: 'document_load_failed', detail: 'not a PDF' },
    ]);
  });

  it('skips only the page that fails and keeps rendering the rest', async () => {
    const { document, destroy } = fakeDocument([
      {},
      { getPageFails: true },
      { render: () => ({ promise: Promise.reject(new Error('bad stream')), cancel: () => {} }) },
      {},
    ]);

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 4]);
    expect(result.skipped).toEqual([
      { pageNumber: 2, reason: 'page_load_failed', detail: 'page is corrupt' },
      { pageNumber: 3, reason: 'render_failed', detail: 'bad stream' },
    ]);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('reports an encode failure as a skipped page, not an exception', async () => {
    const canvases = fakeCanvases({ encode: async () => { throw new Error('codec missing'); } });
    const { document, destroy } = fakeDocument([{}]);

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(result.pages).toEqual([]);
    expect(result.skipped).toEqual([{ pageNumber: 1, reason: 'encode_failed', detail: 'codec missing' }]);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

/**
 * PDF.js resolves the page dictionary lazily, so a malformed page throws from
 * `rotate` or `getViewport` long after getPage() resolved. A1c treats rasters
 * as optional enhancement data, so none of these may escape as an exception.
 */
describe('page geometry that throws', () => {
  const goodPage = (): RasterPdfPage => ({
    rotate: 0,
    getViewport: ({ scale }) => ({ width: A4.width * scale, height: A4.height * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  });

  const withBadFirstPage = (bad: RasterPdfPage) => {
    const destroy = vi.fn(async () => undefined);
    const document: RasterPdfDocument = {
      numPages: 2,
      destroy,
      getPage: async (pageNumber: number) => (pageNumber === 1 ? bad : goodPage()),
    };
    return { document, destroy };
  };

  it('contains a synchronous getViewport throw and still renders later pages', async () => {
    const canvases = fakeCanvases();
    const { document, destroy } = withBadFirstPage({
      rotate: 0,
      getViewport: () => { throw new Error('malformed page dictionary'); },
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    });

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: canvases.createCanvas,
    });

    expect(result.skipped).toEqual([
      { pageNumber: 1, reason: 'invalid_geometry', detail: 'malformed page dictionary' },
    ]);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([2]);
    // The unreadable page never reached allocation.
    expect(canvases.allocations).toHaveLength(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('contains a synchronous throw from the rotate getter', async () => {
    const { document } = withBadFirstPage({
      get rotate(): number { throw new Error('bad /Rotate entry'); },
      getViewport: ({ scale }) => ({ width: A4.width * scale, height: A4.height * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    });

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(result.skipped).toEqual([
      { pageNumber: 1, reason: 'invalid_geometry', detail: 'bad /Rotate entry' },
    ]);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([2]);
  });

  it('contains a canvas allocation failure as a typed render skip', async () => {
    const { document } = withBadFirstPage(goodPage());
    const real = fakeCanvases();
    let attempts = 0;

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(document),
      createCanvas: (width, height) => {
        attempts += 1;
        if (attempts === 1) throw new Error('no native canvas backend');
        return real.createCanvas(width, height);
      },
    });

    expect(result.skipped).toEqual([
      { pageNumber: 1, reason: 'render_failed', detail: 'no native canvas backend' },
    ]);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([2]);
  });
});

describe('document teardown cannot discard the result', () => {
  it('survives a destroy() that throws synchronously', async () => {
    const { document } = fakeDocument([{}]);
    const exploding: RasterPdfDocument = {
      ...document,
      destroy: (() => { throw new Error('teardown exploded'); }) as unknown as () => Promise<void>,
    };

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(exploding),
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([1]);
    expect(result.skipped).toEqual([]);
  });

  it('survives a destroy() that rejects', async () => {
    const { document } = fakeDocument([{}]);
    const rejecting: RasterPdfDocument = {
      ...document,
      destroy: async () => { throw new Error('teardown rejected'); },
    };

    const result = await rasterizePdfPages(new Uint8Array([1]), {
      loadDocument: load(rejecting),
      createCanvas: fakeCanvases().createCanvas,
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([1]);
    expect(result.skipped).toEqual([]);
  });
});

/**
 * One unfaked proof that the real native backend encodes real WebP. Everything
 * above injects a canvas; if this were faked too, nothing would show that
 * @napi-rs/canvas actually works on the platform the worker runs on.
 */
describe('native @napi-rs/canvas WebP encoding', () => {
  it('produces real RIFF/WEBP bytes at the locked quality', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(1191, 1684);
    const context = canvas.getContext('2d');
    context.fillStyle = KNOWLEDGE_RASTER_BACKGROUND;
    context.fillRect(0, 0, 1191, 1684);
    const bytes = await canvas.encode('webp', KNOWLEDGE_RASTER_WEBP_QUALITY);

    expect(bytes.length).toBeGreaterThan(16);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(canvas.width).toBe(1191);
    expect(canvas.height).toBe(1684);
  });
});
