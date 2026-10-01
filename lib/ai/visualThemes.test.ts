import { describe, expect, it } from 'vitest';

import { VISUAL_PALETTE } from './visualPalette';
import { VISUAL_THEMES, contrastRatio, themeById, type VisualThemeId } from './visualThemes';

const IDS: VisualThemeId[] = ['classic', 'ocean', 'sunset', 'forest', 'mono', 'teal-night', 'midnight', 'hand-drawn'];

describe('PATCH-238/241 visual themes', () => {
  it('exposes exactly the eight themes', () => {
    expect(Object.keys(VISUAL_THEMES).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(VISUAL_THEMES[id].id).toBe(id);
  });

  it('every theme has six palette entries', () => {
    for (const id of IDS) expect(VISUAL_THEMES[id].palette).toHaveLength(6);
  });

  it('classic is exactly today\u2019s palette, white ground and root colour', () => {
    const classic = VISUAL_THEMES.classic;
    expect(classic.palette).toEqual(VISUAL_PALETTE);
    expect(classic.background).toBe('#FFFFFF');
    expect(classic.centreFill).toBe('#1F2937');
    expect(classic.dark).toBe(false);
  });

  it('two of the themes are dark', () => {
    expect(VISUAL_THEMES['teal-night'].dark).toBe(true);
    expect(VISUAL_THEMES.midnight.dark).toBe(true);
  });

  it('PATCH-241 hand-drawn is light, reuses the classic palette, and is readable', () => {
    const handDrawn = VISUAL_THEMES['hand-drawn'];
    expect(handDrawn.dark).toBe(false);
    expect(handDrawn.palette).toEqual(VISUAL_PALETTE);
    expect(contrastRatio(handDrawn.text, handDrawn.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('themeById falls back to classic for unknown or missing ids', () => {
    expect(themeById('teal-night').id).toBe('teal-night');
    expect(themeById('not-a-theme').id).toBe('classic');
    expect(themeById(undefined).id).toBe('classic');
    expect(themeById().id).toBe('classic');
  });

  it('contrastRatio matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('every theme is readable: text/fill, text+bg, title+bg, muted+bg, stroke/bg', () => {
    for (const id of IDS) {
      const theme = VISUAL_THEMES[id];
      for (const entry of theme.palette) {
        expect(contrastRatio(entry.text, entry.fill), `${id}: text on fill`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(entry.detail, entry.fill), `${id}: detail on fill`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(entry.stroke, theme.background), `${id}: stroke vs background`).toBeGreaterThanOrEqual(1.5);
      }
      expect(contrastRatio(theme.text, theme.background), `${id}: text on background`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.title, theme.background), `${id}: title on background`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.muted, theme.background), `${id}: muted on background`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.centreText, theme.centreFill), `${id}: centre text on centre fill`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
