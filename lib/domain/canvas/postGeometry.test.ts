import { describe, expect, it } from 'vitest';

import { roundPostGeometry } from './postGeometry';

/**
 * PATCH-212. Position and size are integer columns, but any geometry computed at
 * a zoom other than 100% comes out fractional. This helper is the ONE place that
 * makes them whole, applied at the repository seam so no write path can miss it.
 */
describe('roundPostGeometry', () => {
  it('rounds fractional geometry (the live 22P02 values)', () => {
    expect(roundPostGeometry({ position_x: -2995.9999999999995 }).position_x).toBe(-2996);
    expect(roundPostGeometry({ width: 12.5 }).width).toBe(13);
    expect(roundPostGeometry({ height: 12.5 }).height).toBe(13);
    expect(roundPostGeometry({ position_y: 0.2 }).position_y).toBe(0);
    expect(roundPostGeometry({ position_x: 47.6 }).position_x).toBe(48);
  });

  it('leaves integers exactly as they are', () => {
    expect(roundPostGeometry({ position_x: 100, position_y: -50, width: 300, height: 200 }))
      .toEqual({ position_x: 100, position_y: -50, width: 300, height: 200 });
  });

  it('leaves null and undefined untouched', () => {
    const input = { position_x: null, position_y: undefined, width: null, height: undefined };
    expect(roundPostGeometry(input)).toEqual(input);
  });

  it('leaves strings and other non-numbers untouched', () => {
    const input = { position_x: '100', width: {}, height: [], position_y: true };
    expect(roundPostGeometry(input)).toEqual(input);
  });

  it('leaves NaN and Infinity untouched, so they still fail loudly', () => {
    const input = { position_x: Number.NaN, width: Number.POSITIVE_INFINITY, height: Number.NEGATIVE_INFINITY };
    const out = roundPostGeometry(input);
    expect(Number.isNaN(out.position_x)).toBe(true);
    expect(out.width).toBe(Number.POSITIVE_INFINITY);
    expect(out.height).toBe(Number.NEGATIVE_INFINITY);
  });

  it('leaves every other key untouched', () => {
    const input = { position_x: 1.7, title: 'A post', metadata: { a: 1 }, updated_at: 'x', content: 'c' };
    const out = roundPostGeometry(input);
    expect(out.position_x).toBe(2);
    expect(out.title).toBe('A post');
    expect(out.metadata).toEqual({ a: 1 });
    expect(out.updated_at).toBe('x');
    expect(out.content).toBe('c');
  });

  it('never mutates its input', () => {
    const input = { position_x: 1.7, width: 2.2 };
    const out = roundPostGeometry(input);
    expect(input.position_x).toBe(1.7);
    expect(input.width).toBe(2.2);
    expect(out).not.toBe(input);
  });

  it('rounds only the four geometry keys, not nested ones', () => {
    // A nested metadata blob is not geometry and must not be rewritten.
    const out = roundPostGeometry({ position_x: 1.4, metadata: { width: 3.7 } });
    expect(out.position_x).toBe(1);
    expect(out.metadata).toEqual({ width: 3.7 });
  });
});
