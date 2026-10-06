import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BoardIconGlyph from './BoardIconGlyph';

/**
 * PATCH-301. One glyph for every board-icon shape.
 */
describe('BoardIconGlyph', () => {
  it('renders a known lucide icon as an svg', () => {
    const html = renderToStaticMarkup(<BoardIconGlyph icon="lucide:star" />);
    expect(html).toContain('data-icon-kind="line"');
    expect(html).toContain('<svg');
    expect(html).toContain('lucide-star');
  });

  it('falls back to layout for an unknown lucide name', () => {
    const unknown = renderToStaticMarkup(<BoardIconGlyph icon="lucide:not-a-real-icon" />);
    const layout = renderToStaticMarkup(<BoardIconGlyph icon="lucide:layout" />);
    expect(unknown).toContain('data-icon-kind="line"');
    expect(unknown).toBe(layout);
  });

  it('renders an http url as an image', () => {
    const html = renderToStaticMarkup(<BoardIconGlyph icon="https://cdn.example/logo.png" />);
    expect(html).toContain('data-icon-kind="image"');
    expect(html).toContain('src="https://cdn.example/logo.png"');
  });

  it('renders a data url as an image', () => {
    const html = renderToStaticMarkup(<BoardIconGlyph icon="data:image/png;base64,AAAA" />);
    expect(html).toContain('data-icon-kind="image"');
  });

  it('renders an emoji as text', () => {
    const html = renderToStaticMarkup(<BoardIconGlyph icon="🎨" />);
    expect(html).toContain('data-icon-kind="text"');
    expect(html).toContain('🎨');
  });

  it('renders nothing for an empty icon', () => {
    expect(renderToStaticMarkup(<BoardIconGlyph icon="" />)).toBe('');
    expect(renderToStaticMarkup(<BoardIconGlyph icon={null} />)).toBe('');
  });
});
