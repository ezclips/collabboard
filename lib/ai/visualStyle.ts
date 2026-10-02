/**
 * PATCH-253. A stored, per-picture visual STYLE: the background, each palette
 * slot's colour and the fonts for title / labels / descriptions. It is pure and
 * lenient -- `sanitizeVisualStyle` never throws, so a hostile stored post simply
 * loses the parts that are not real colours or known system fonts.
 *
 * No web font is ever named here: every stack is a system stack, so restyling a
 * picture is free, instant and makes no outside request.
 */

import { contrastRatio, type VisualTheme } from './visualThemes';

/** The three text roles a picture stores a font for. */
export type FontRole = 'title' | 'label' | 'desc';

export type VisualFontId = 'sans' | 'serif' | 'rounded' | 'mono' | 'hand';

export interface VisualFontOption {
  id: VisualFontId;
  name: string;
  stack: string;
}

/** The fixed list of SYSTEM font stacks only. Nothing is loaded from the web. */
export const VISUAL_FONTS: readonly VisualFontOption[] = [
  { id: 'sans', name: 'Sans', stack: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif' },
  { id: 'serif', name: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'rounded', name: 'Rounded', stack: 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif' },
  { id: 'mono', name: 'Mono', stack: 'ui-monospace, Menlo, Consolas, monospace' },
  { id: 'hand', name: 'Handwritten', stack: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
];

const FONT_BY_ID = new Map<string, VisualFontOption>(VISUAL_FONTS.map((font) => [font.id, font]));

export interface VisualFont {
  family: VisualFontId;
  weight: 400 | 500 | 700;
}

export interface VisualStyle {
  /** '#rrggbb' */
  background?: string;
  /** 1..6 × '#rrggbb', palette slots in order. */
  colors?: string[];
  fonts?: Partial<Record<FontRole, VisualFont>>;
}

/** The resolved family stack for a font id; unknown ids fall back to sans. */
export function fontStack(id: VisualFontId): string {
  return (FONT_BY_ID.get(id) ?? FONT_BY_ID.get('sans')!).stack;
}

const HEX6 = /^#[0-9a-f]{6}$/;
const FONT_ROLES: readonly FontRole[] = ['title', 'label', 'desc'];
const WEIGHTS: readonly number[] = [400, 500, 700];

function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  return HEX6.test(trimmed) ? trimmed : undefined;
}

/**
 * PATCH-253. Keeps only real `#rrggbb` colours (stored lower-case), at most six
 * of them, known font ids and weights 400/500/700. Returns `undefined` when
 * nothing valid remains. Never throws.
 */
export function sanitizeVisualStyle(raw: unknown): VisualStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const input = raw as { background?: unknown; colors?: unknown; fonts?: unknown };
  const style: VisualStyle = {};

  const background = sanitizeColor(input.background);
  if (background) style.background = background;

  if (Array.isArray(input.colors)) {
    const colors = input.colors
      .map(sanitizeColor)
      .filter((color): color is string => color !== undefined)
      .slice(0, 6);
    if (colors.length) style.colors = colors;
  }

  if (input.fonts && typeof input.fonts === 'object' && !Array.isArray(input.fonts)) {
    const fonts: Partial<Record<FontRole, VisualFont>> = {};
    for (const role of FONT_ROLES) {
      const rawFont = (input.fonts as Record<string, unknown>)[role];
      if (!rawFont || typeof rawFont !== 'object') continue;
      const family = (rawFont as { family?: unknown }).family;
      const weight = (rawFont as { weight?: unknown }).weight;
      if (typeof family === 'string' && FONT_BY_ID.has(family) && WEIGHTS.includes(weight as number)) {
        fonts[role] = { family: family as VisualFontId, weight: weight as 400 | 500 | 700 };
      }
    }
    if (Object.keys(fonts).length) style.fonts = fonts;
  }

  return Object.keys(style).length ? style : undefined;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace(/^#/, '');
  const int = Number.parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear interpolation from `from` toward `to`; `amount` 0..1. */
function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(channelToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * PATCH-253. A text colour `color` that reaches 4.5:1 against `ground`: kept as
 * it is when it already does, else darkened on a light ground or lightened on a
 * dark one until it does.
 */
function readable(color: string, ground: string): string {
  if (contrastRatio(color, ground) >= 4.5) return color;
  const base = color.toLowerCase();
  const target = luminance(ground) >= 0.5 ? '#000000' : '#ffffff';
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mix(base, target, step / 100);
    if (contrastRatio(candidate, ground) >= 4.5) return candidate;
  }
  return target;
}

/**
 * PATCH-253. Applies a style to a theme and returns a NEW theme (never mutates
 * the input). The background is replaced; each given colour `i` becomes a
 * palette slot with a tinted fill and a readable label; title/text/muted are
 * re-checked against the new background; the fonts resolve to system stacks.
 * With no style the theme is returned unchanged.
 */
export function themeWithStyle(theme: VisualTheme, style?: VisualStyle): VisualTheme {
  if (!style || Object.keys(style).length === 0) return theme;

  const background = style.background ?? theme.background;

  let palette = theme.palette;
  if (style.colors?.length) {
    palette = theme.palette.map((entry, index) => {
      const color = style.colors?.[index];
      if (!color) return entry;
      const fill = mix(color, background, 0.85);
      const text = readable(color, fill);
      return { stroke: color, fill, text, detail: text };
    });
  }

  const next: VisualTheme = {
    ...theme,
    background,
    title: readable(theme.title, background),
    text: readable(theme.text, background),
    muted: readable(theme.muted, background),
    palette,
  };

  if (style.fonts) {
    const fonts: NonNullable<VisualTheme['fonts']> = {};
    for (const role of FONT_ROLES) {
      const font = style.fonts[role];
      if (font) fonts[role] = { family: fontStack(font.family), weight: font.weight };
    }
    if (Object.keys(fonts).length) next.fonts = fonts;
  }

  return next;
}
