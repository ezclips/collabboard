import { describe, expect, it } from 'vitest';

import { contrastRatio, VISUAL_THEMES, type VisualTheme } from './visualThemes';
import { fontStack, sanitizeVisualStyle, themeWithStyle, VISUAL_FONTS } from './visualStyle';

describe('PATCH-253 fontStack', () => {
  it('returns a system font stack for every listed font', () => {
    expect(VISUAL_FONTS.map((font) => font.id)).toEqual(['sans', 'serif', 'rounded', 'mono', 'hand']);
    expect(fontStack('sans')).toContain('system-ui');
    expect(fontStack('serif')).toContain('Georgia');
    expect(fontStack('rounded')).toContain('ui-rounded');
    expect(fontStack('mono')).toContain('ui-monospace');
    expect(fontStack('hand')).toContain('Segoe Print');
  });
});

describe('PATCH-253 sanitizeVisualStyle', () => {
  it('keeps a valid background, colours (lower-cased) and fonts', () => {
    const style = sanitizeVisualStyle({
      background: '#AABBCC',
      colors: ['#112233', '#ABCDEF'],
      fonts: { title: { family: 'serif', weight: 700 }, desc: { family: 'mono', weight: 400 } },
    });
    expect(style).toEqual({
      background: '#aabbcc',
      colors: ['#112233', '#abcdef'],
      fonts: { title: { family: 'serif', weight: 700 }, desc: { family: 'mono', weight: 400 } },
    });
  });

  it('drops non-hex colours but keeps the valid ones and caps at six', () => {
    const style = sanitizeVisualStyle({
      background: 'url(javascript:1)',
      colors: ['red;x', '#010101', '#020202', '#030303', '#040404', '#050505', '#060606', '#070707'],
    });
    expect(style?.background).toBeUndefined();
    expect(style?.colors).toEqual(['#010101', '#020202', '#030303', '#040404', '#050505', '#060606']);
  });

  it('drops unknown font ids and unsupported weights', () => {
    const style = sanitizeVisualStyle({
      fonts: {
        title: { family: 'comic', weight: 700 },
        label: { family: 'sans', weight: 600 },
        desc: { family: 'sans', weight: 500 },
      },
    });
    expect(style).toEqual({ fonts: { desc: { family: 'sans', weight: 500 } } });
  });

  it('drops a 3- and 8-digit hex, keeping only #rrggbb', () => {
    expect(sanitizeVisualStyle({ background: '#abc' })).toBeUndefined();
    expect(sanitizeVisualStyle({ background: '#aabbccdd' })).toBeUndefined();
  });

  it('returns undefined when nothing valid remains, and never throws', () => {
    expect(sanitizeVisualStyle({})).toBeUndefined();
    expect(sanitizeVisualStyle({ colors: [], fonts: { title: { family: 'Comic</style>' } } })).toBeUndefined();
    expect(sanitizeVisualStyle(null)).toBeUndefined();
    expect(sanitizeVisualStyle('nope')).toBeUndefined();
    expect(sanitizeVisualStyle({ colors: 'nope', fonts: 42 })).toBeUndefined();
  });
});

describe('PATCH-253 themeWithStyle', () => {
  it('returns the same theme untouched when there is no style', () => {
    const theme = VISUAL_THEMES.classic;
    expect(themeWithStyle(theme)).toBe(theme);
    expect(themeWithStyle(theme, undefined)).toBe(theme);
    expect(themeWithStyle(theme, {})).toBe(theme);
  });

  it('returns a NEW theme and never mutates the input', () => {
    const theme = VISUAL_THEMES.classic;
    const before = JSON.stringify(theme);
    const next = themeWithStyle(theme, { background: '#112233', colors: ['#ff0000'] });
    expect(next).not.toBe(theme);
    expect(JSON.stringify(theme)).toBe(before);
    expect(next.background).toBe('#112233');
    expect(next.palette[0].stroke).toBe('#ff0000');
    expect(theme.palette[0].stroke).toBe('#E9A23B');
  });

  it('keeps readable text on every palette fill for a light and a dark background', () => {
    const colors = ['#ff8800', '#0055ff', '#00a050'];
    for (const background of ['#FFFFFF', '#0F1E3D']) {
      const themed = themeWithStyle(VISUAL_THEMES.classic, { background, colors });
      for (const entry of themed.palette.slice(0, colors.length)) {
        expect(contrastRatio(entry.text, entry.fill), `${background}/${entry.stroke}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(themed.title, themed.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(themed.text, themed.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(themed.muted, themed.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the theme colour when it already reaches 4.5, and resolves fonts to stacks', () => {
    const next = themeWithStyle(VISUAL_THEMES.classic, {
      fonts: { title: { family: 'sans', weight: 700 }, label: { family: 'hand', weight: 400 } },
    });
    expect(next.title).toBe(VISUAL_THEMES.classic.title);
    expect(next.background).toBe(VISUAL_THEMES.classic.background);
    expect(next.fonts).toEqual({
      title: { family: fontStack('sans'), weight: 700 },
      label: { family: fontStack('hand'), weight: 400 },
    });
  });

  it('re-checks title/text/muted against a new background', () => {
    const onDark = themeWithStyle(VISUAL_THEMES.classic as VisualTheme, { background: '#111111' });
    expect(contrastRatio(onDark.title, '#111111')).toBeGreaterThanOrEqual(4.5);
    expect(onDark.title).not.toBe(VISUAL_THEMES.classic.title);
  });
});
