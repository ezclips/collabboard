import { describe, expect, it } from 'vitest';

import {
  boardWikiExportFilename,
  parseBoardWikiExportBundle,
} from './boardWikiExportBundle';
import { boardWikiOkfFilename, boardWikiOkfIndex } from './boardWikiOkfDocument';

/**
 * The export bundle's client-side boundary.
 *
 * The parse exists because a bundle entry's name becomes a path inside a zip,
 * so the last group here is a security group rather than a shape group: those
 * cases are the ones that would let a response name a file outside the archive.
 */

const bundle = (files: Record<string, unknown>) => ({ files });

const valid = bundle({
  'index.md': '# Board wiki\n',
  'horn-replacement.md': '---\ntype: wiki_page\n---\n',
});

describe('what counts as a bundle', () => {
  it('returns every file it was given', () => {
    const files = parseBoardWikiExportBundle(valid);
    expect(files?.map((file) => file.name)).toEqual(['index.md', 'horn-replacement.md']);
    expect(files?.[1].content).toBe('---\ntype: wiki_page\n---\n');
  });

  it('puts the index first and the rest alphabetically, whatever order it arrived in', () => {
    const files = parseBoardWikiExportBundle(bundle({
      'zebra.md': 'z',
      'index.md': 'i',
      'alpha.md': 'a',
    }));
    expect(files?.map((file) => file.name)).toEqual(['index.md', 'alpha.md', 'zebra.md']);
  });

  it('builds the same bundle from two responses that differ only in key order', () => {
    const one = parseBoardWikiExportBundle(bundle({ 'index.md': 'i', 'a.md': 'a', 'b.md': 'b' }));
    const two = parseBoardWikiExportBundle(bundle({ 'b.md': 'b', 'index.md': 'i', 'a.md': 'a' }));
    expect(one).toEqual(two);
  });

  it('accepts a board whose only page is the index', () => {
    expect(parseBoardWikiExportBundle(bundle({ 'index.md': 'i' }))).toHaveLength(1);
  });
});

describe('a payload that is not a bundle is refused whole', () => {
  it.each([
    ['null', null],
    ['a string', 'files'],
    ['an array', []],
    ['no files key', {}],
    ['files as an array', { files: [] }],
    ['files as null', { files: null }],
  ])('%s', (_label, payload) => {
    expect(parseBoardWikiExportBundle(payload)).toBeNull();
  });

  it('refuses a bundle with no index, however many pages it carries', () => {
    expect(parseBoardWikiExportBundle(bundle({ 'a.md': 'a', 'b.md': 'b' }))).toBeNull();
  });

  it('refuses a bundle whose file content is not text', () => {
    expect(parseBoardWikiExportBundle(bundle({ 'index.md': 'i', 'a.md': 42 }))).toBeNull();
  });

  it('refuses the WHOLE bundle when one entry is bad, never a partial one', () => {
    // The failure being guarded against is someone believing they exported
    // their wiki when they exported some of it.
    expect(parseBoardWikiExportBundle(bundle({
      'index.md': 'i',
      'good.md': 'g',
      'bad.md': null,
    }))).toBeNull();
  });
});

describe('an entry name can never escape the archive', () => {
  it.each([
    ['a parent traversal', '../escape.md'],
    ['a nested traversal', 'pages/../../escape.md'],
    ['a subdirectory', 'pages/nested.md'],
    ['a windows separator', '..\\escape.md'],
    ['an absolute path', '/etc/passwd.md'],
    ['a leading dash', '-hidden.md'],
    ['a non-markdown extension', 'payload.sh'],
    ['no extension', 'payload'],
    ['an uppercase name', 'Payload.md'],
    ['an empty name', ''],
  ])('refuses %s', (_label, name) => {
    expect(parseBoardWikiExportBundle(bundle({ 'index.md': 'i', [name]: 'x' }))).toBeNull();
  });
});

describe('the bundle the server actually produces parses', () => {
  // The guard that matters most: the two modules are independent, and a change
  // to the slug rule that widened a filename would otherwise surface as a
  // failed download rather than a failed test.
  it('accepts real OKF filenames and the real index', () => {
    const pages = [
      { slug: 'audi-a2-stossstange-und-hupe', title: 'Audi A2 Stossstange und Hupe' },
      { slug: 'audi-a2', title: 'Audi A2' },
    ];
    const files = parseBoardWikiExportBundle(bundle({
      'index.md': boardWikiOkfIndex(pages),
      [boardWikiOkfFilename(pages[0].slug)]: 'one',
      [boardWikiOkfFilename(pages[1].slug)]: 'two',
    }));
    expect(files?.map((file) => file.name)).toEqual([
      'index.md',
      'audi-a2-stossstange-und-hupe.md',
      'audi-a2.md',
    ]);
  });
});

describe('the archive name', () => {
  it('mirrors the workspace export, dated', () => {
    expect(boardWikiExportFilename(new Date('2026-09-20T14:32:11.000Z')))
      .toBe('board-wiki-export-2026-09-20.zip');
  });

  it('names the same day the same way regardless of the time', () => {
    expect(boardWikiExportFilename(new Date('2026-09-20T00:00:00.000Z')))
      .toBe(boardWikiExportFilename(new Date('2026-09-20T23:59:59.000Z')));
  });
});
