// @vitest-environment jsdom
//
// PATCH-277 Addendum 4. The dash array may live on the ATTRIBUTE (AntV writes
// `stroke-dasharray="8 8"` there) rather than in the computed style, so the
// reader must consult both. "8 8" with stroke width 3 is `dashed`; only every
// dash <= 2x the width is `dotted`.
import { describe, expect, it } from 'vitest';

import { strokeStyleOf } from './readPaint';

function el(markup: string): Element {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

function style(overrides: Record<string, string> = {}): CSSStyleDeclaration {
  return {
    strokeDasharray: 'none',
    strokeWidth: '1',
    ...overrides,
  } as unknown as CSSStyleDeclaration;
}

describe('PATCH-277 Addendum 4 dash style', () => {
  it('reads "8 8" from the attribute with width 3 as dashed', () => {
    const path = el('<path stroke-dasharray="8 8" stroke-width="3" />');
    expect(strokeStyleOf(path, style({ strokeWidth: '3' }))).toBe('dashed');
  });

  it('falls back to the computed strokeDasharray when there is no attribute', () => {
    const path = el('<path />');
    expect(strokeStyleOf(path, style({ strokeDasharray: '8 8', strokeWidth: '3' }))).toBe('dashed');
  });

  it('treats every dash <= 2x width as dotted', () => {
    const path = el('<path stroke-dasharray="2 2" stroke-width="3" />');
    expect(strokeStyleOf(path, style({ strokeWidth: '3' }))).toBe('dotted');
  });

  it('is solid when neither source has a dash array', () => {
    const path = el('<path />');
    expect(strokeStyleOf(path, style())).toBe('solid');
  });
});
