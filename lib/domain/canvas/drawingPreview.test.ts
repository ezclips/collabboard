import { describe, expect, it } from 'vitest';

import { stripDrawingPreviewBackground } from './drawingPreview';

const PREFIX = 'data:image/svg+xml;base64,';

const encode = (svg: string): string => PREFIX + Buffer.from(svg, 'utf8').toString('base64');
const decode = (url: string): string =>
  Buffer.from(url.slice(PREFIX.length), 'base64').toString('utf8');

/** The shape Excalidraw's exportToSvg emits with exportBackground: true: the
 *  background rect is the first real child, right after <metadata>/<defs>. */
const EXCALIDRAW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150" version="1.1">' +
  '<!-- svg-source:excalidraw -->' +
  '<metadata></metadata>' +
  '<defs><style class="style-fonts">.a{}</style></defs>' +
  '<rect fill="#ffffff" height="150" width="200" x="0" y="0"></rect>' +
  '<g data-id="e1"><path d="M0 0 L10 10" fill="none" stroke="#000000"></path></g>' +
  '</svg>';

describe('PATCH-222 stripDrawingPreviewBackground', () => {
  it('removes the full-size background rect and keeps every other element', () => {
    const out = stripDrawingPreviewBackground(encode(EXCALIDRAW_SVG));

    // Still a valid base64 SVG data URL.
    expect(out.startsWith(PREFIX)).toBe(true);
    const svg = decode(out);
    expect(svg.startsWith('<svg')).toBe(true);

    expect(svg).not.toContain('<rect');
    expect(svg).not.toContain('#ffffff');
    // Everything else survives, including the comment, metadata, defs and path.
    expect(svg).toContain('svg-source:excalidraw');
    expect(svg).toContain('<metadata');
    expect(svg).toContain('<defs>');
    expect(svg).toContain('<path');
    expect(svg).toContain('data-id="e1"');
  });

  it('also handles the self-closing rect form', () => {
    const svg = EXCALIDRAW_SVG.replace(
      '<rect fill="#ffffff" height="150" width="200" x="0" y="0"></rect>',
      '<rect fill="#ffffff" height="150" width="200" x="0" y="0"/>',
    );
    expect(decode(stripDrawingPreviewBackground(encode(svg)))).not.toContain('<rect');
  });

  it('keeps a rect that is NOT full-size', () => {
    const svg = EXCALIDRAW_SVG.replace('height="150" width="200"', 'height="20" width="20"');
    const out = decode(stripDrawingPreviewBackground(encode(svg)));
    expect(out).toContain('<rect fill="#ffffff" height="20" width="20"');
  });

  it('keeps a full-size rect that is not the first real child', () => {
    const svg =
      '<svg width="200" height="150" viewBox="0 0 200 150">' +
      '<g><path d="M0 0"></path></g>' +
      '<rect fill="#ffffff" height="150" width="200" x="0" y="0"/>' +
      '</svg>';
    expect(decode(stripDrawingPreviewBackground(encode(svg)))).toContain('<rect');
  });

  it('keeps a full-size rect not anchored at 0,0', () => {
    const svg = EXCALIDRAW_SVG.replace('x="0" y="0"', 'x="5" y="5"');
    expect(decode(stripDrawingPreviewBackground(encode(svg)))).toContain('<rect');
  });

  it('returns a PNG data URL unchanged', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    expect(stripDrawingPreviewBackground(png)).toBe(png);
  });

  it('returns an http URL unchanged', () => {
    const httpUrl = 'https://example.com/drawing.svg';
    expect(stripDrawingPreviewBackground(httpUrl)).toBe(httpUrl);
  });

  it('returns garbage and unparsable input unchanged, and never throws', () => {
    for (const input of ['', 'not a url', PREFIX + 'not*base64*!', 'data:image/svg+xml,<svg/>']) {
      expect(stripDrawingPreviewBackground(input)).toBe(input);
    }
  });

  it('leaves an SVG whose first child is not the background rect unchanged', () => {
    const svg = '<svg width="200" height="150"><path d="M0 0"></path></svg>';
    expect(stripDrawingPreviewBackground(encode(svg))).toBe(encode(svg));
  });
});
