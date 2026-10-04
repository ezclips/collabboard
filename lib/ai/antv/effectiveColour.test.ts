// @vitest-environment jsdom
//
// PATCH-275. The colour a panel row must show, read from the parts it applies
// to: our override if set, else AntV's own colour (the `data-ai-base-*` value,
// else the attribute/style). Mixed parts report Mixed.
import { describe, expect, it } from 'vitest';

import { effectiveColour, parseColour } from './effectiveColour';

function el(attrs: Record<string, string>): Element {
  const node = document.createElement('div');
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

describe('PATCH-275 parseColour', () => {
  it('expands #rgb lower-case', () => {
    expect(parseColour('#aBc')).toEqual({ hex: '#aabbcc', alpha: 1 });
  });

  it('expands #rgba, keeping the alpha', () => {
    const parsed = parseColour('#abcd')!;
    expect(parsed.hex).toBe('#aabbcc');
    expect(parsed.alpha).toBeCloseTo(0xdd / 255, 6);
  });

  it('accepts #rrggbb', () => {
    expect(parseColour('#4F9D8F')).toEqual({ hex: '#4f9d8f', alpha: 1 });
  });

  it('accepts #rrggbbaa and keeps the alpha separately', () => {
    const parsed = parseColour('#4f9d8f1a')!;
    expect(parsed.hex).toBe('#4f9d8f');
    expect(parsed.alpha).toBeCloseTo(0x1a / 255, 6);
  });

  it('accepts rgb() and rgba()', () => {
    expect(parseColour('rgb(255, 0, 16)')).toEqual({ hex: '#ff0010', alpha: 1 });
    const parsed = parseColour('rgba(0, 128, 255, 0.5)')!;
    expect(parsed.hex).toBe('#0080ff');
    expect(parsed.alpha).toBeCloseTo(0.5, 6);
  });

  it('rejects none, transparent and url()', () => {
    expect(parseColour('none')).toBeNull();
    expect(parseColour('transparent')).toBeNull();
    expect(parseColour('url(#g)')).toBeNull();
    expect(parseColour('#12345')).toBeNull();
    expect(parseColour('')).toBeNull();
    expect(parseColour(undefined)).toBeNull();
  });
});

describe('PATCH-275 effectiveColour', () => {
  it('shows the override when one is set, with AntV base kept for Original', () => {
    const part = el({ fill: '#333333', 'data-ai-base-fill': '#4f9d8f1a' });
    const row = effectiveColour([part], 'fill', '#333333');
    expect(row.current).toEqual({ hex: '#333333', alpha: 1 });
    expect(row.base?.hex).toBe('#4f9d8f');
    expect(row.baseCss).toBe('#4f9d8f1a');
    expect(row.mixed).toBe(false);
  });

  it('falls back to AntV own colour when no override is set', () => {
    const part = el({ fill: '#4f9d8f' });
    const row = effectiveColour([part], 'fill');
    expect(row.current).toEqual({ hex: '#4f9d8f', alpha: 1 });
    expect(row.base?.hex).toBe('#4f9d8f');
  });

  it('reports mixed when the parts disagree, with no current colour', () => {
    const a = el({ fill: '#111111' });
    const b = el({ fill: '#222222' });
    const row = effectiveColour([a, b], 'fill');
    expect(row.mixed).toBe(true);
    expect(row.current).toBeNull();
  });

  it('reads a text row from the inner target', () => {
    const inner = document.createElement('div');
    inner.setAttribute('style', 'color: rgb(10, 20, 30)');
    const foreign = document.createElement('foreignObject');
    foreign.appendChild(inner);
    const row = effectiveColour([foreign], 'text');
    expect(row.current).toEqual({ hex: '#0a141e', alpha: 1 });
  });

  it('returns an empty row for no parts', () => {
    expect(effectiveColour([], 'fill')).toEqual({ current: null, base: null, baseCss: null, mixed: false });
  });
});
