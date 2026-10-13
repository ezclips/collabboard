// @vitest-environment jsdom
//
// PATCH-355. The format-preserving segment helpers behind Translate: text nodes
// only, so tags, attributes and lists survive a replacement.
import { describe, expect, it } from 'vitest';

import { extractSegments, replaceSegments } from './noteHtmlSegments';

describe('PATCH-355 noteHtmlSegments', () => {
  it('extracts non-empty text nodes in document order', () => {
    expect(extractSegments('<p>First</p><p>Second <strong>bold</strong></p>').segments)
      .toEqual(['First', 'Second', 'bold']);
  });

  it('skips whitespace-only text nodes and trims each segment', () => {
    expect(extractSegments('<p>  Hello  </p>\n<p>   </p><p>World</p>').segments)
      .toEqual(['Hello', 'World']);
  });

  it('round-trips unchanged HTML', () => {
    const html = '<p>Hello <strong>bold</strong> world</p><ul><li>one</li><li>two</li></ul>';
    expect(replaceSegments(html, extractSegments(html).segments)).toBe(html);
  });

  it('keeps tags, attributes (links) and lists when replacing', () => {
    const html = '<p>See <a href="https://x.test">the link</a></p><ul><li>first</li></ul>';
    const out = replaceSegments(html, ['Siehe', 'den Link', 'erste']);
    expect(out).toBe('<p>Siehe <a href="https://x.test">den Link</a></p><ul><li>erste</li></ul>');
    expect(out).toContain('href="https://x.test"');
    expect(out).toContain('<li>');
  });

  it('keeps each node’s leading and trailing whitespace', () => {
    const html = '<p>a <strong>b</strong> c</p>';
    expect(extractSegments(html).segments).toEqual(['a', 'b', 'c']);
    expect(replaceSegments(html, ['X', 'Y', 'Z'])).toBe('<p>X <strong>Y</strong> Z</p>');
  });

  it('throws when the counts differ', () => {
    expect(() => replaceSegments('<p>a</p><p>b</p>', ['only one'])).toThrow(/expected 2 segments, got 1/);
  });

  it('empty HTML has no segments', () => {
    expect(extractSegments('').segments).toEqual([]);
    expect(replaceSegments('', [])).toBe('');
  });
});
