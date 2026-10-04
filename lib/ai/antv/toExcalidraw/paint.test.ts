import { describe, expect, it } from 'vitest';

import {
  blendOver,
  colorToHex,
  gradientColorAt,
  isPaintNone,
  parseColor,
  resolvePaint,
  type GradientStop,
} from './paint';

/** Independent channel maths, so the test is not the implementation's mirror. */
function expectedOver(fg: number[], a: number, bg: number[]): string {
  const mix = (i: number) => Math.round(fg[i] * a + bg[i] * (1 - a));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(mix(0))}${hex(mix(1))}${hex(mix(2))}`;
}

describe('PATCH-277 paint parsing', () => {
  it('parses every colour syntax AntV emits', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('#4f9d8f')).toEqual({ r: 79, g: 157, b: 143, a: 1 });
    expect(parseColor('#4f9d8f80')?.a).toBeCloseTo(128 / 255);
    expect(parseColor('#abcd')?.a).toBeCloseTo(221 / 255);
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(0, 0, 255, 0.5)')).toEqual({ r: 0, g: 0, b: 255, a: 0.5 });
    expect(parseColor('rgb(100% 0% 0% / 25%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 });
    expect(parseColor('rebeccapurple')).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor('none')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('not-a-colour')).toBeNull();
  });

  it('recognises paint-none and transparent', () => {
    expect(isPaintNone(undefined)).toBe(true);
    expect(isPaintNone('none')).toBe(true);
    expect(isPaintNone('#000')).toBe(false);
    expect(parseColor('transparent')?.a).toBe(0);
  });
});

describe('PATCH-277 alpha blending', () => {
  it('blends #4f9d8f1a over #ffffff to the exact expected hex', () => {
    // 0x1a / 255 = 0.10196078...
    const alpha = 0x1a / 255;
    const expected = expectedOver([79, 157, 143], alpha, [255, 255, 255]);
    expect(blendOver({ r: 79, g: 157, b: 143, a: alpha }, '#ffffff')).toBe(expected);
    expect(resolvePaint('#4f9d8f1a', 1, '#ffffff')).toEqual({ color: expected, blended: true });
  });

  it('multiplies colour alpha by fill-opacity and the opacity chain', () => {
    const expected = expectedOver([79, 157, 143], (0x1a / 255) * 0.5 * 0.5, [255, 255, 255]);
    const result = resolvePaint('#4f9d8f1a', 0.5 * 0.5, '#ffffff');
    expect(result.color).toBe(expected);
    expect(result.blended).toBe(true);
  });

  it('leaves a fully opaque colour untouched', () => {
    expect(resolvePaint('#4f9d8f', 1, '#ffffff')).toEqual({ color: '#4f9d8f', blended: false });
  });

  it('treats a fully transparent colour as none', () => {
    expect(resolvePaint('#00000000', 1, '#ffffff')).toEqual({ color: 'none', blended: false });
    expect(resolvePaint('transparent', 1, '#ffffff')).toEqual({ color: 'none', blended: false });
    expect(resolvePaint('none', 1, '#ffffff')).toEqual({ color: 'none', blended: false });
  });
});

describe('PATCH-277 gradient flattening', () => {
  const stops: GradientStop[] = [
    { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
    { offset: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
  ];

  it('takes the middle colour between two stops', () => {
    const mid = gradientColorAt(stops, 0.5);
    expect(mid).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(colorToHex(mid!)).toBe('#808080');
  });

  it('clamps outside the stop range and interpolates between the nearest stops', () => {
    const three: GradientStop[] = [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 0.5, color: { r: 0, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
    ];
    expect(gradientColorAt(three, -1)?.r).toBe(255);
    expect(gradientColorAt(three, 2)?.b).toBe(255);
    // Between stop 1 and 2 at 0.5 -> a blend of black and blue.
    expect(gradientColorAt(three, 0.75)).toEqual({ r: 0, g: 0, b: 127.5, a: 1 });
  });

  it('flattens a url() gradient to its 0.5 colour and blends it', () => {
    const result = resolvePaint('url(#g)', 1, '#ffffff', stops);
    expect(result).toEqual({ color: '#808080', blended: false });
    // With a translucent gradient the middle colour is blended too.
    const faded = resolvePaint('url(#g)', 0.5, '#ffffff', stops);
    expect(faded).toEqual({
      color: expectedOver([127.5, 127.5, 127.5], 0.5, [255, 255, 255]),
      blended: true,
    });
  });
});
