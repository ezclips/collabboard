import { describe, expect, it } from 'vitest';
import { parseTextStyle, textStyleToCss, TEXT_STYLE_FONT_FAMILIES } from './textStyle';

describe('parseTextStyle', () => {
  it('keeps valid values', () => {
    expect(
      parseTextStyle({ fontFamily: 'serif', fontSize: 18, bold: true, align: 'center', color: '#ef4444' }),
    ).toEqual({ fontFamily: 'serif', fontSize: 18, bold: true, align: 'center', color: '#ef4444' });
  });

  it('drops bad font keys, sizes outside the list and non-hex colours', () => {
    expect(
      parseTextStyle({ fontFamily: 'comic', fontSize: 17, bold: 'yes', align: 'justify', color: 'red' }),
    ).toEqual({});
  });

  it('accepts #rgb but rejects other colour forms', () => {
    expect(parseTextStyle({ color: '#abc' })).toEqual({ color: '#abc' });
    expect(parseTextStyle({ color: '#abcd' })).toEqual({});
    expect(parseTextStyle({ color: 'rgb(0,0,0)' })).toEqual({});
  });

  it('returns {} for a non-object', () => {
    expect(parseTextStyle(null)).toEqual({});
    expect(parseTextStyle('x')).toEqual({});
  });
});

describe('textStyleToCss', () => {
  it('maps each field', () => {
    expect(textStyleToCss({ fontFamily: 'serif' })).toEqual({ fontFamily: TEXT_STYLE_FONT_FAMILIES.serif });
    expect(textStyleToCss({ fontSize: 18 })).toEqual({ fontSize: '18px' });
    expect(textStyleToCss({ bold: true })).toEqual({ fontWeight: 700 });
    expect(textStyleToCss({ align: 'right' })).toEqual({ textAlign: 'right' });
    expect(textStyleToCss({ color: '#ef4444' })).toEqual({ color: '#ef4444' });
  });

  it('maps nothing for an empty style', () => {
    expect(textStyleToCss({})).toEqual({});
  });
});
