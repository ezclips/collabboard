import { describe, expect, it } from 'vitest';

import { DrawnParseError, parseDrawnPicture } from './format';

/**
 * PATCH-283 A. The tolerant DrawnPicture v1 parser: valid pictures round-trip,
 * invalid elements drop with a reason, and only a non-object root throws.
 */

describe('PATCH-283 parseDrawnPicture', () => {
  it('round-trips a valid picture, normalising colours', () => {
    const raw = {
      version: 1,
      width: 800,
      height: 600,
      background: '#FFFFFF',
      elements: [
        { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50, fill: '#ABC', stroke: '#123456' },
        { id: 't1', type: 'text', text: 'Hi', x: 0, y: 0, w: 200, size: 16, color: '#000000', in: 'r1' },
      ],
    };
    const { picture, dropped } = parseDrawnPicture(raw);
    expect(dropped).toEqual([]);
    expect(picture).toMatchObject({ version: 1, width: 800, height: 600, background: '#ffffff' });
    expect(picture.elements).toHaveLength(2);
    const rect = picture.elements[0];
    if (rect.type !== 'rect') throw new Error('expected rect');
    expect(rect.fill).toBe('#aabbcc');
    expect(rect.stroke).toBe('#123456');
    const text = picture.elements[1];
    if (text.type !== 'text') throw new Error('expected text');
    expect(text.in).toBe('r1');
  });

  it('clamps width and height to 240..2400', () => {
    const { picture } = parseDrawnPicture({
      width: 100,
      height: 5000,
      elements: [{ id: 'e', type: 'ellipse', x: 0, y: 0, w: 10, h: 10, fill: 'none', stroke: '#000000' }],
    });
    expect(picture.width).toBe(240);
    expect(picture.height).toBe(2400);
  });

  it('drops bad colour, huge size, unknown icon, unknown in and non-finite numbers', () => {
    const { picture, dropped } = parseDrawnPicture({
      width: 800,
      height: 600,
      elements: [
        { id: 'bad-colour', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: 'red', stroke: '#000000' },
        { id: 'huge', type: 'text', text: 'x', x: 0, y: 0, w: 100, size: 500, color: '#000000' },
        { id: 'icon', type: 'icon', name: 'not-a-real-icon', x: 0, y: 0, size: 24, color: '#000000' },
        { id: 'in', type: 'text', text: 'x', x: 0, y: 0, w: 100, size: 16, color: '#000000', in: 'missing' },
        { id: 'nan', type: 'ellipse', x: Infinity, y: 0, w: 10, h: 10, fill: 'none', stroke: '#000000' },
        { id: 'good', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ffffff', stroke: '#000000' },
      ],
    });
    expect(picture.elements).toHaveLength(1);
    expect(dropped).toHaveLength(5);
    expect(dropped.every((reason) => typeof reason === 'string' && reason.length > 0)).toBe(true);
  });

  it('keeps only the first 150 elements', () => {
    const elements = Array.from({ length: 151 }, (_, i) => ({
      id: `r${i}`,
      type: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      fill: '#ffffff',
      stroke: '#000000',
    }));
    const { picture } = parseDrawnPicture({ width: 800, height: 600, elements });
    expect(picture.elements).toHaveLength(150);
  });

  it('suffixes duplicate ids', () => {
    const { picture } = parseDrawnPicture({
      width: 800,
      height: 600,
      elements: [
        { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ffffff', stroke: '#000000' },
        { id: 'a', type: 'rect', x: 20, y: 0, w: 10, h: 10, fill: '#ffffff', stroke: '#000000' },
      ],
    });
    expect(picture.elements.map((element) => element.id)).toEqual(['a', 'a-2']);
  });

  it('rejects a non-object root with DrawnParseError', () => {
    expect(() => parseDrawnPicture('nope')).toThrow(DrawnParseError);
    expect(() => parseDrawnPicture(null)).toThrow(DrawnParseError);
  });

  it('throws when no valid element remains', () => {
    expect(() => parseDrawnPicture({ width: 800, height: 600 })).toThrow(DrawnParseError);
    expect(() => parseDrawnPicture({ width: 800, height: 600, elements: [] })).toThrow(DrawnParseError);
  });

  it('keeps a known icon with a normalised colour', () => {
    const { picture } = parseDrawnPicture({
      width: 800,
      height: 600,
      elements: [{ id: 'i', type: 'icon', name: 'sun', x: 5, y: 6, size: 24, color: '#AABBCC', item: 0 }],
    });
    const icon = picture.elements[0];
    if (icon.type !== 'icon') throw new Error('expected icon');
    expect(icon.name).toBe('sun');
    expect(icon.color).toBe('#aabbcc');
    expect(icon.item).toBe(0);
  });
});
