/**
 * PATCH-277 Addendum 4. Pure text measurement and wrapping for the converter,
 * split out of `toSkeleton` to keep each file under the line ceiling. The live
 * path measures with a canvas `measureText` using the SAME font string
 * Excalidraw renders with; node/jsdom falls back to a per-character estimate.
 */

import { EXCALIDRAW_FONT_FAMILY_CASCADIA, EXCALIDRAW_FONT_FAMILY_HELVETICA } from './scene';

const MONO_FACTOR = 0.6;
const SANS_FACTOR = 0.52;

/** Approximate width of one character, used only when no canvas is available. */
function estimateCharWidth(fontSize: number, monospace: boolean): number {
  return fontSize * (monospace ? MONO_FACTOR : SANS_FACTOR);
}

/**
 * Live path: a canvas `measureText` with the SAME font string Excalidraw uses
 * (`getFontString` for FONT_FAMILY.Helvetica/Cascadia, Addendum 2). Test/SSR
 * path: a per-character estimate, because node/jsdom has no canvas.
 */
export function measureWidth(text: string, fontSize: number, monospace: boolean): number {
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        const family = monospace
          ? EXCALIDRAW_FONT_FAMILY_CASCADIA
          : EXCALIDRAW_FONT_FAMILY_HELVETICA;
        context.font = `${fontSize}px ${family}`;
        return context.measureText(text).width;
      }
    } catch {
      // fall through to the estimate
    }
  }
  return text.length * estimateCharWidth(fontSize, monospace);
}

/** Pre-wrap greedily to `maxWidth`, preserving explicit newlines. */
export function wrapToWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  monospace: boolean,
): string {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (measureWidth(candidate, fontSize, monospace) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.join('\n');
}

/**
 * Addendum 4. Keep the SOURCE line count. One source line is never wrapped
 * (AntV's Helvetica box may be a touch narrower than Excalidraw's, but the
 * designer chose one line). For L lines, wrap greedily at the smallest width
 * (binary search) that still yields at most L lines, never wider than the box.
 */
export function wrapToLineCount(
  text: string,
  fontSize: number,
  boxWidth: number,
  monospace: boolean,
  lineCount: number,
): string {
  const natural = text.replace(/\s*\n\s*/g, ' ').trim();
  const target = Math.max(1, Math.floor(lineCount));
  if (target <= 1 || !natural) return natural;
  const countLines = (maxWidth: number) =>
    wrapToWidth(natural, fontSize, maxWidth, monospace).split('\n').length;
  const naturalWidth = measureWidth(natural, fontSize, monospace);
  if (countLines(boxWidth) <= target) return wrapToWidth(natural, fontSize, boxWidth, monospace);
  let low = Math.min(boxWidth, naturalWidth);
  let high = naturalWidth;
  for (let i = 0; i < 40 && high - low > 0.5; i += 1) {
    const mid = (low + high) / 2;
    if (countLines(mid) <= target) high = mid;
    else low = mid;
  }
  return wrapToWidth(natural, fontSize, high, monospace);
}
