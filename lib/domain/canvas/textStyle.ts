import type { CSSProperties } from 'react';

/**
 * PATCH-315. The one place that defines the text styles a Napkin-style bar can
 * set, plus the parser/validator and the CSS mapper. Only system font stacks
 * are used: the app loads no web fonts.
 */
export type TextStyle = {
  fontFamily?: 'sans' | 'serif' | 'rounded' | 'mono' | 'handwriting';
  fontSize?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
};

export type TextStyleFontKey = NonNullable<TextStyle['fontFamily']>;

export const TEXT_STYLE_FONT_FAMILIES: Record<TextStyleFontKey, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Segoe UI", Nunito, system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  handwriting: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
};

export const TEXT_STYLE_FONT_KEYS = Object.keys(TEXT_STYLE_FONT_FAMILIES) as TextStyleFontKey[];

export const TEXT_STYLE_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24] as const;

export const TEXT_STYLE_COLORS = [
  '#0f172a',
  '#ffffff',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function parseTextStyle(value: unknown): TextStyle {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const style: TextStyle = {};
  if (typeof input.fontFamily === 'string' && (TEXT_STYLE_FONT_KEYS as string[]).includes(input.fontFamily)) {
    style.fontFamily = input.fontFamily as TextStyleFontKey;
  }
  if (
    typeof input.fontSize === 'number' &&
    (TEXT_STYLE_FONT_SIZES as readonly number[]).includes(input.fontSize)
  ) {
    style.fontSize = input.fontSize;
  }
  if (typeof input.bold === 'boolean') style.bold = input.bold;
  if (input.align === 'left' || input.align === 'center' || input.align === 'right') {
    style.align = input.align;
  }
  if (typeof input.color === 'string' && HEX_COLOR.test(input.color)) {
    style.color = input.color;
  }
  return style;
}

export function textStyleToCss(style: TextStyle): CSSProperties {
  const css: CSSProperties = {};
  if (style.fontFamily) css.fontFamily = TEXT_STYLE_FONT_FAMILIES[style.fontFamily];
  if (style.fontSize) css.fontSize = `${style.fontSize}px`;
  if (style.bold) css.fontWeight = 700;
  if (style.align) css.textAlign = style.align;
  if (style.color) css.color = style.color;
  return css;
}
