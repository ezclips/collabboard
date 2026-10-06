import { describe, expect, it } from 'vitest';

import {
  hashWithoutLibraryReturn,
  parseLibraryFile,
  parseLibraryReturn,
} from './excalidrawLibraryReturn';

const REAL_URL =
  'https://libraries.excalidraw.com/libraries/excalidrawlibs/rho.excalidrawlib';

function returnHash(url: string): string {
  return `#addLibrary=${encodeURIComponent(url)}&token=abc123`;
}

function rect(id = 'e') {
  return { id, type: 'rectangle' };
}

describe('PATCH-299 parseLibraryReturn', () => {
  it('accepts a real-site https .excalidrawlib URL', () => {
    expect(parseLibraryReturn(returnHash(REAL_URL))).toEqual({
      libraryUrl: REAL_URL,
    });
  });

  it('rejects http:', () => {
    expect(
      parseLibraryReturn(returnHash('http://libraries.excalidraw.com/a.excalidrawlib')),
    ).toBeNull();
  });

  it('rejects look-alike and unrelated hosts', () => {
    expect(
      parseLibraryReturn(
        returnHash('https://libraries.excalidraw.com.evil.test/a.excalidrawlib'),
      ),
    ).toBeNull();
    expect(
      parseLibraryReturn(returnHash('https://evil.test/a.excalidrawlib')),
    ).toBeNull();
  });

  it('rejects a path not ending in .excalidrawlib', () => {
    expect(
      parseLibraryReturn(returnHash('https://libraries.excalidraw.com/a.json')),
    ).toBeNull();
  });

  it('rejects a missing addLibrary key and a malformed URL', () => {
    expect(parseLibraryReturn('#token=abc')).toBeNull();
    expect(parseLibraryReturn('#addLibrary=not-a-url&token=abc')).toBeNull();
  });
});

describe('PATCH-299 hashWithoutLibraryReturn', () => {
  it('keeps other keys', () => {
    expect(
      hashWithoutLibraryReturn('#addLibrary=x&keep=1&token=y&other=2'),
    ).toBe('#keep=1&other=2');
  });

  it('returns an empty string when nothing is left', () => {
    expect(hashWithoutLibraryReturn('#addLibrary=x&token=y')).toBe('');
  });
});

describe('PATCH-299 parseLibraryFile', () => {
  it('parses a version 1 file (each inner array is an item)', () => {
    const text = JSON.stringify({
      type: 'excalidrawlib',
      version: 1,
      library: [[rect('a'), rect('b')], [rect('c')]],
    });
    const result = parseLibraryFile(text, REAL_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.items[0].elements).toHaveLength(2);
    expect(result.items[0].name).toBe('Rho 1');
  });

  it('parses a version 2 file (libraryItems[i].elements) and uses its name', () => {
    const text = JSON.stringify({
      type: 'excalidrawlib',
      version: 2,
      libraryItems: [
        { id: 'a', status: 'published', name: 'Named item', elements: [rect('a')] },
        { id: 'b', status: 'published', elements: [rect('b')] },
      ],
    });
    const result = parseLibraryFile(text, REAL_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Named item');
    expect(result.items[1].name).toBe('Rho 2');
  });

  it('skips empty and non-array element lists', () => {
    const v1 = JSON.stringify({
      type: 'excalidrawlib',
      version: 1,
      library: [[], [rect('a')]],
    });
    const v1Result = parseLibraryFile(v1, REAL_URL);
    expect(v1Result.ok).toBe(true);
    if (v1Result.ok) expect(v1Result.items).toHaveLength(1);

    const v2 = JSON.stringify({
      type: 'excalidrawlib',
      version: 2,
      libraryItems: [
        { id: 'a', status: 'published', elements: 'nope' },
        { id: 'b', status: 'published', elements: [] },
        { id: 'c', status: 'published', elements: [rect('c')] },
      ],
    });
    const v2Result = parseLibraryFile(v2, REAL_URL);
    expect(v2Result.ok).toBe(true);
    if (v2Result.ok) expect(v2Result.items).toHaveLength(1);
  });

  it('skips items containing image, embeddable or iframe elements', () => {
    const text = JSON.stringify({
      type: 'excalidrawlib',
      version: 2,
      libraryItems: [
        { id: 'a', status: 'published', elements: [{ type: 'image' }] },
        { id: 'b', status: 'published', elements: [{ type: 'embeddable' }] },
        { id: 'c', status: 'published', elements: [{ type: 'iframe' }] },
        { id: 'd', status: 'published', elements: [rect('d')] },
      ],
    });
    const result = parseLibraryFile(text, REAL_URL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0].elements).toEqual([rect('d')]);
    }
  });

  it('keeps only the first 500 of 501 items', () => {
    const text = JSON.stringify({
      type: 'excalidrawlib',
      version: 1,
      library: Array.from({ length: 501 }, (_, i) => [rect(`e${i}`)]),
    });
    const result = parseLibraryFile(text, REAL_URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toHaveLength(500);
  });

  it('gives the exact reasons for oversized, non-JSON and missing-array files', () => {
    const tooLarge = parseLibraryFile('a'.repeat(5_000_001), REAL_URL);
    expect(tooLarge).toEqual({
      ok: false,
      reason: 'The library file is too large.',
    });

    const notJson = parseLibraryFile('not json', REAL_URL);
    expect(notJson).toEqual({
      ok: false,
      reason: 'This is not an Excalidraw library file.',
    });

    const noArray = parseLibraryFile(
      JSON.stringify({ type: 'excalidrawlib', version: 1 }),
      REAL_URL,
    );
    expect(noArray).toEqual({
      ok: false,
      reason: 'This is not an Excalidraw library file.',
    });

    const noneUsable = parseLibraryFile(
      JSON.stringify({ type: 'excalidrawlib', version: 1, library: [[{ type: 'image' }]] }),
      REAL_URL,
    );
    expect(noneUsable).toEqual({
      ok: false,
      reason: 'The library has no items this app can use.',
    });
  });

  it('derives fallback names from the URL (r.excalidrawlib, dashed)', () => {
    const text = JSON.stringify({
      type: 'excalidrawlib',
      version: 1,
      library: [[rect('a')], [rect('b')]],
    });

    const short = parseLibraryFile(
      text,
      'https://libraries.excalidraw.com/r.excalidrawlib',
    );
    expect(short.ok).toBe(true);
    if (short.ok) expect(short.items.map((i) => i.name)).toEqual(['R 1', 'R 2']);

    const dashed = parseLibraryFile(
      text,
      'https://libraries.excalidraw.com/aws-architecture-icons.excalidrawlib',
    );
    expect(dashed.ok).toBe(true);
    if (dashed.ok) {
      expect(dashed.items.map((i) => i.name)).toEqual([
        'Aws architecture icons 1',
        'Aws architecture icons 2',
      ]);
    }
  });
});
