import { describe, expect, it } from 'vitest';

import { LINE_HEIGHT_FACTOR, lineHeight, measureText, wrapText } from './textMetrics';

/**
 * PATCH-283 B. Pure Helvetica text measuring (embedded AFM widths) and word
 * wrapping. No canvas, no DOM.
 */

describe('PATCH-283 textMetrics', () => {
  it('measures "iii" narrower than "WWW"', () => {
    expect(measureText('iii', 16, false)).toBeLessThan(measureText('WWW', 16, false));
  });

  it('measures bold text wider than regular for the same string', () => {
    expect(measureText('hello world', 16, true)).toBeGreaterThan(measureText('hello world', 16, false));
  });

  it('scales with size', () => {
    expect(measureText('abc', 32, false)).toBeCloseTo(measureText('abc', 16, false) * 2, 5);
  });

  it('treats non-ASCII characters as 0.6 em', () => {
    expect(measureText('€', 10, false)).toBeCloseTo(6, 5);
  });

  it('returns [""] for empty text', () => {
    expect(wrapText('', 16, 100, false)).toEqual(['']);
  });

  it('never returns a line wider than maxWidth except one unbreakable character', () => {
    const lines = wrapText('supercalifragilistic expialidocious words here', 20, 80, false);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      if (line.length === 1) continue;
      expect(measureText(line, 20, false)).toBeLessThanOrEqual(80);
    }
  });

  it('breaks a word wider than the line into fitting chunks', () => {
    const lines = wrapText('aaaaaaaaaaaaaaaaaaaa', 20, 40, false);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines.slice(0, -1)) {
      expect(measureText(line, 20, false)).toBeLessThanOrEqual(40);
    }
  });

  it('honours explicit newlines', () => {
    expect(wrapText('one\ntwo', 16, 1000, false)).toEqual(['one', 'two']);
  });

  it('line height is 1.25x the size', () => {
    expect(LINE_HEIGHT_FACTOR).toBe(1.25);
    expect(lineHeight(16)).toBe(20);
  });
});
