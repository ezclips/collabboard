import { describe, expect, it } from 'vitest';

import { iconDisplayName, wallpaperLabel } from './canvasSettingsDisplay';

describe('iconDisplayName', () => {
  it('never returns a raw lucide id', () => {
    expect(iconDisplayName('lucide:layout')).toBe('Layout');
    expect(iconDisplayName('lucide:book-open')).toBe('Book open');
    expect(iconDisplayName('lucide:graduation-cap')).toBe('Graduation cap');
    for (const icon of ['lucide:layout', 'lucide:book-open', 'lucide:graduation-cap']) {
      expect(iconDisplayName(icon)).not.toContain('lucide:');
    }
  });

  it('names an image without printing the url, and an emoji as an emoji', () => {
    expect(iconDisplayName('https://example.com/i.png')).toBe('Image');
    expect(iconDisplayName('data:image/png;base64,AAAA')).toBe('Image');
    expect(iconDisplayName('🎨')).toBe('Emoji');
  });

  it('is null only when there is no icon at all', () => {
    expect(iconDisplayName('')).toBeNull();
  });

  it('falls back to "Icon" for a lucide id with nothing after the prefix', () => {
    expect(iconDisplayName('lucide:')).toBe('Icon');
  });
});

describe('wallpaperLabel', () => {
  it('names the kinds', () => {
    expect(wallpaperLabel('image', 'https://example.com/w.png')).toBe('Image');
    expect(wallpaperLabel('gradient', 'linear-gradient(#fff, #000)')).toBe('Gradient');
  });

  it('names the two values that carry a name of their own', () => {
    expect(wallpaperLabel('color', '#ffffff')).toBe('White');
    expect(wallpaperLabel('color', '#FFFFFF')).toBe('White');
    // The window's own fallback value IS "Default".
    expect(wallpaperLabel('color', '#f3f4f6')).toBe('Default');
  });

  it('calls any other colour a colour, never a raw value', () => {
    expect(wallpaperLabel('color', '#ef4444')).toBe('Colour');
    expect(wallpaperLabel('color', '#ef4444')).not.toContain('#');
  });

  it('is "Default" when there is no wallpaper at all', () => {
    expect(wallpaperLabel(null, null)).toBe('Default');
    expect(wallpaperLabel(undefined, undefined)).toBe('Default');
    expect(wallpaperLabel('color', null)).toBe('Default');
    expect(wallpaperLabel(null, '#ef4444')).toBe('Default');
    expect(wallpaperLabel('', '')).toBe('Default');
  });
});
