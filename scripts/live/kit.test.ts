import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  closeLibrary,
  drawingElementsFromBody,
  isExtensionNoise,
  isReadMethod,
  lockedTabs,
  openBoard,
  openLibrary,
  openNewDraw,
  padletIdFromBody,
} from './kit.mjs';

const FORBIDDEN = [
  'setViewportSize(',
  'setViewport(',
  'setDeviceMetricsOverride',
  'browser.close(',
  'context.close(',
  'browser.contexts()[0].close(',
];

describe('isReadMethod', () => {
  it('accepts the read verbs case-insensitively', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get', 'Head', 'options']) {
      expect(isReadMethod(method)).toBe(true);
    }
  });

  it('rejects the write verbs', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'post', 'delete']) {
      expect(isReadMethod(method)).toBe(false);
    }
  });
});

describe('padletIdFromBody', () => {
  it('reads the id from a Supabase array response', () => {
    expect(padletIdFromBody(JSON.stringify([{ id: 'abc-123' }]))).toBe('abc-123');
  });

  it('reads the id from a single-row response', () => {
    expect(padletIdFromBody(JSON.stringify({ id: 'abc-123' }))).toBe('abc-123');
  });

  it('returns null on junk and on missing/non-string ids', () => {
    expect(padletIdFromBody('not json')).toBeNull();
    expect(padletIdFromBody(JSON.stringify({}))).toBeNull();
    expect(padletIdFromBody(JSON.stringify([{ id: 7 }]))).toBeNull();
    expect(padletIdFromBody(JSON.stringify([]))).toBeNull();
  });
});

describe('drawingElementsFromBody', () => {
  const body = (drawingData: unknown) => JSON.stringify({ type: 'drawing', metadata: { drawingData } });

  it('returns non-deleted elements', () => {
    const elements = drawingElementsFromBody(body({
      elements: [{ id: 'a' }, { id: 'b', isDeleted: true }, { id: 'c' }],
    }));
    expect(elements).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('parses a drawingData stored as a JSON string', () => {
    const elements = drawingElementsFromBody(body(JSON.stringify({ elements: [{ id: 'a' }] })));
    expect(elements).toEqual([{ id: 'a' }]);
  });

  it('survives junk and malformed shapes with an empty array', () => {
    expect(drawingElementsFromBody('not json')).toEqual([]);
    expect(drawingElementsFromBody(JSON.stringify({}))).toEqual([]);
    expect(drawingElementsFromBody(body(null))).toEqual([]);
    expect(drawingElementsFromBody(body({ elements: 'nope' }))).toEqual([]);
    expect(drawingElementsFromBody(body({ elements: [null, { id: 'a' }] }))).toEqual([{ id: 'a' }]);
  });

  it('reads an array request body whose row carries drawingData as a JSON string', () => {
    const request = JSON.stringify([{
      type: 'drawing',
      metadata: { drawingData: JSON.stringify({ elements: [{ id: 'a' }, { id: 'b', isDeleted: true }, { id: 'c' }] }) },
    }]);
    expect(drawingElementsFromBody(request)).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('reads drawingData that is the element array itself (string or array)', () => {
    const asString = JSON.stringify([{
      type: 'drawing',
      metadata: { drawingData: JSON.stringify([{ id: 'a' }, { id: 'b', isDeleted: true }, { id: 'c' }]) },
    }]);
    expect(drawingElementsFromBody(asString)).toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(drawingElementsFromBody(body([{ id: 'a' }, { id: 'c' }]))).toEqual([{ id: 'a' }, { id: 'c' }]);
  });
});

describe('closeLibrary', () => {
  function fakePage(behaviors: Record<string, { visible?: boolean }>) {
    const clicks: string[] = [];
    const waits: Array<{ selector: string; state?: string; timeout?: number }> = [];
    const page = {
      locator(selector: string) {
        const behavior = behaviors[selector] ?? {};
        const locator = {
          first: () => locator,
          isVisible: async () => behavior.visible ?? false,
          click: async () => { clicks.push(selector); },
          waitFor: async (options: { state?: string; timeout?: number }) => {
            waits.push({ selector, state: options.state, timeout: options.timeout });
          },
        };
        return locator;
      },
    };
    return { page, clicks, waits };
  }

  it('does not reopen the sidebar when the library is already hidden, and waits at most 5 s', async () => {
    const { page, clicks, waits } = fakePage({ '.library-unit': { visible: false } });
    await closeLibrary({ page });
    expect(clicks).toEqual([]);
    expect(waits).toEqual([{ selector: '.library-unit', state: 'hidden', timeout: 5000 }]);
  });

  it('clicks the trigger when the library is open, then waits at most 5 s', async () => {
    const { page, clicks, waits } = fakePage({
      '.library-unit': { visible: true },
      '.excalidraw .sidebar-trigger': { visible: true },
    });
    await closeLibrary({ page });
    expect(clicks).toEqual(['.excalidraw .sidebar-trigger']);
    expect(waits).toContainEqual({ selector: '.library-unit', state: 'hidden', timeout: 5000 });
  });
});

describe('library trigger preference', () => {
  function fakePage(behaviors: Record<string, { visible?: boolean }>) {
    const clicks: string[] = [];
    const page = {
      locator(selector: string) {
        const behavior = behaviors[selector] ?? {};
        const locator: {
          first: () => unknown;
          isVisible: () => Promise<boolean>;
          click: () => Promise<void>;
          waitFor: () => Promise<void>;
        } = {
          first: () => locator,
          isVisible: async () => behavior.visible ?? false,
          click: async () => { clicks.push(selector); },
          waitFor: async () => {},
        };
        return locator;
      },
    };
    return { page, clicks };
  }

  it('openLibrary prefers our own toolbar button when it is present', async () => {
    const { page, clicks } = fakePage({
      '[data-drawing-library-button]': { visible: true },
      '.library-unit': { visible: false },
      '.excalidraw .sidebar-trigger': { visible: true },
    });
    await openLibrary({ page });
    expect(clicks).toEqual(['[data-drawing-library-button]']);
  });

  it('openLibrary falls back to the stock sidebar trigger', async () => {
    const { page, clicks } = fakePage({
      '[data-drawing-library-button]': { visible: false },
      '.library-unit': { visible: false },
      '.excalidraw .sidebar-trigger': { visible: true },
    });
    await openLibrary({ page });
    expect(clicks).toEqual(['.excalidraw .sidebar-trigger']);
  });

  it('closeLibrary prefers our own toolbar button when it is present', async () => {
    const { page, clicks } = fakePage({
      '.library-unit': { visible: true },
      '[data-drawing-library-button]': { visible: true },
      '.excalidraw .sidebar-trigger': { visible: true },
    });
    await closeLibrary({ page });
    expect(clicks).toEqual(['[data-drawing-library-button]']);
  });
});

describe('openNewDraw', () => {
  it('accepts the item by exact text and gives each point 800 ms', async () => {
    const waits: number[] = [];
    const menuClicks: string[] = [];
    const mouseClicks: Array<{ x: number; y: number }> = [];
    const textLocator = {
      first: () => textLocator,
      waitFor: async (options: { timeout?: number }) => { waits.push(options.timeout ?? -1); },
      click: async () => { menuClicks.push('new-draw'); },
    };
    const roleLocator = { or: () => textLocator };
    const page = {
      getByRole: () => roleLocator,
      getByText: () => textLocator,
      mouse: { click: async (x: number, y: number) => { mouseClicks.push({ x, y }); } },
      keyboard: { press: async () => {} },
      locator: () => ({ first() { return this; }, waitFor: async () => {} }),
    };
    await openNewDraw({ page });
    expect(waits[0]).toBe(800);
    expect(mouseClicks).toHaveLength(1);
    expect(menuClicks).toEqual(['new-draw']);
  });
});

describe('openBoard', () => {
  it('gives the goto a long first-load timeout, not Playwright\'s 30 s default', async () => {
    const gotos: Array<{ url: string; options: unknown }> = [];
    const page = {
      goto: async (url: string, options: unknown) => { gotos.push({ url, options }); },
      waitForSelector: async () => {},
      locator: () => ({ first() { return this; }, waitFor: async () => {} }),
    };
    await openBoard({ page }, 'board-123');
    expect(gotos).toHaveLength(1);
    expect(gotos[0].url).toContain('/dashboard/canvas/board-123');
    expect(gotos[0].options).toEqual({ waitUntil: 'domcontentloaded', timeout: 240000 });
  });
});

describe('lockedTabs', () => {
  it('reports only rows whose innerWidth differs from outerWidth', () => {
    const rows = [
      { url: 'a', innerWidth: 1280, outerWidth: 1280, innerHeight: 800, outerHeight: 800 },
      { url: 'b', innerWidth: 1280, outerWidth: 900, innerHeight: 800, outerHeight: 800 },
    ];
    expect(lockedTabs(rows)).toEqual([rows[1]]);
  });

  it('ignores rows without metrics and non-arrays', () => {
    expect(lockedTabs([{ url: 'a' }, { url: 'b', innerWidth: 1 }])).toEqual([]);
    expect(lockedTabs(null as unknown as unknown[])).toEqual([]);
  });
});

describe('isExtensionNoise', () => {
  it('recognizes the browser-extension message', () => {
    expect(isExtensionNoise(
      'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
    )).toBe(true);
  });

  it('does not treat real page errors as noise', () => {
    expect(isExtensionNoise('TypeError: x is not a function')).toBe(false);
  });
});

describe('kit.mjs source guard', () => {
  const source = readFileSync(join(__dirname, 'kit.mjs'), 'utf8');

  it('contains none of the forbidden live-browser patterns', () => {
    for (const pattern of FORBIDDEN) {
      expect(source).not.toContain(pattern);
    }
  });

  it('has no waitForTimeout above 300 ms', () => {
    const waits = [...source.matchAll(/waitForTimeout\(\s*(\d+)/g)].map((match) => Number(match[1]));
    for (const wait of waits) expect(wait).toBeLessThanOrEqual(300);
  });
});
