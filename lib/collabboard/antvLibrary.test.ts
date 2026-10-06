// PATCH-282. The AntV built-in library loader. It fetches the generated
// same-origin file once per page and must always resolve (the editor still
// opens with no library). One console.error per failure, never a throw.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isAntvChartTemplate, parseAntvChartData } from '../ai/antv/chartValues/data';
import { ANTV_LIBRARY_TEMPLATES } from '../ai/antv/toExcalidraw/libraryTemplates';

const VALID_FILE = {
  type: 'excalidrawlib',
  version: 2,
  source: 'antv',
  libraryItems: [
    {
      id: 'antv:chart-pie-donut-pill-badge',
      status: 'published',
      created: 0,
      name: 'Charts · Pie donut pill badge',
      elements: [{ id: 'e0', type: 'rectangle' }],
    },
  ],
};

/** Fresh module per test, so the module-level promise cache does not leak. */
async function freshLoader() {
  vi.resetModules();
  return await import('./antvLibrary');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PATCH-282: loadAntvLibraryItems', () => {
  it('returns the libraryItems of a valid file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_FILE,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadAntvLibraryItems } = await freshLoader();
    const items = await loadAntvLibraryItems();

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('antv:chart-pie-donut-pill-badge');
    expect(items[0].status).toBe('published');
    expect(items[0].elements).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/libraries/antv-diagrams.excalidrawlib');
  });

  it('returns [] and logs one error on a 404', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    const { loadAntvLibraryItems } = await freshLoader();
    await expect(loadAntvLibraryItems()).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns [] and logs one error on bad JSON', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    const { loadAntvLibraryItems } = await freshLoader();
    await expect(loadAntvLibraryItems()).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns [] and logs one error on the wrong shape', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ libraryItems: [{ id: 1, status: 'published' }] }),
      }),
    );

    const { loadAntvLibraryItems } = await freshLoader();
    await expect(loadAntvLibraryItems()).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('fetches the file once for two calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_FILE,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadAntvLibraryItems } = await freshLoader();
    await loadAntvLibraryItems();
    await loadAntvLibraryItems();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// The CTO generates this file from the export view; until then the assertions
// are skipped rather than faked.
const GENERATED_FILE = path.resolve('public/libraries/antv-diagrams.excalidrawlib');
const GENERATED_EXISTS = fs.existsSync(GENERATED_FILE);
const MAX_BYTES = 10 * 1024 * 1024;

describe.skipIf(!GENERATED_EXISTS)('PATCH-292: generated antv-diagrams.excalidrawlib', () => {
  interface GeneratedFile {
    libraryItems: Array<{ id: string; elements: Array<{ customData?: { antvChart?: unknown } }> }>;
  }

  function readGeneratedFile(): GeneratedFile {
    return JSON.parse(fs.readFileSync(GENERATED_FILE, 'utf8')) as GeneratedFile;
  }

  it('parses and holds image-free items with unique element ids', () => {
    const file = JSON.parse(fs.readFileSync(GENERATED_FILE, 'utf8')) as {
      libraryItems: Array<{ id: string; elements: Array<{ id: string; type: string }> }>;
    };
    expect(Array.isArray(file.libraryItems)).toBe(true);
    expect(file.libraryItems.length).toBeGreaterThan(0);
    for (const item of file.libraryItems) {
      expect(item.elements.some((element) => element.type === 'image')).toBe(false);
      const ids = item.elements.map((element) => element.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('holds exactly one item per ANTV_LIBRARY_TEMPLATES entry, in order', () => {
    const file = readGeneratedFile();
    expect(file.libraryItems.map((item) => item.id)).toEqual(
      ANTV_LIBRARY_TEMPLATES.map((entry) => `antv:${entry.template}`),
    );
  });

  it('attaches parseable chart data to supported chart items only', () => {
    const file = readGeneratedFile();
    ANTV_LIBRARY_TEMPLATES.forEach((entry, index) => {
      const item = file.libraryItems[index];
      const isChart = isAntvChartTemplate(entry.template);
      for (const element of item.elements) {
        const chart = element.customData?.antvChart;
        if (isChart) {
          expect(parseAntvChartData(chart), `${entry.template} element chart data`).not.toBeNull();
        } else {
          expect(chart, `${entry.template} element chart data`).toBeUndefined();
        }
      }
    });
  });

  it('fits the 10 MB budget', () => {
    expect(fs.statSync(GENERATED_FILE).size).toBeLessThanOrEqual(MAX_BYTES);
  });
});
