/**
 * PATCH-314. The one place that decides the colours of a container/item badge
 * from its background, so the Scheduler event counter and the container card
 * counter cannot drift.
 */
export type ContainerBadgeColors = {
  textColor: '#0f172a' | '#f8fafc';
  badgeBg: string;
};

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim();
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

export function containerBadgeColors(bgColor: string): ContainerBadgeColors {
  const rgb = hexToRgb(bgColor);
  if (!rgb) return { textColor: '#0f172a', badgeBg: 'rgba(15,23,42,0.08)' };
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  const textColor = luminance > 0.45 ? '#0f172a' : '#f8fafc';
  const badgeBg = textColor === '#f8fafc' ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)';
  return { textColor, badgeBg };
}
