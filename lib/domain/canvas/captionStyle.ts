export type CaptionHeading = 'h1' | 'h2' | 'normal' | 'small' | 'code' | 'callout' | 'quote';

export type CaptionStyle = {
  heading?: CaptionHeading;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontFamily?: string;
  lineHeight?: string;
  color?: string;
  backgroundColor?: string;
  underline?: boolean;
  strikethrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
};

export const CAPTION_STYLE_PRESETS: Record<CaptionHeading, CaptionStyle> = {
  h1: {
    heading: 'h1',
    fontSize: '18px',
    fontWeight: '700',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.3',
  },
  h2: {
    heading: 'h2',
    fontSize: '16px',
    fontWeight: '600',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.35',
  },
  normal: {
    heading: 'normal',
    fontSize: '14px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.4',
  },
  small: {
    heading: 'small',
    fontSize: '12px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.4',
  },
  code: {
    heading: 'code',
    fontSize: '13px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.4',
  },
  callout: {
    heading: 'callout',
    fontSize: '14px',
    fontWeight: '500',
    fontStyle: 'normal',
    fontFamily: undefined,
    lineHeight: '1.4',
    backgroundColor: '#fef3c7',
  },
  quote: {
    heading: 'quote',
    fontSize: '14px',
    fontWeight: '400',
    fontStyle: 'italic',
    fontFamily: undefined,
    lineHeight: '1.45',
  },
};

export type ResolvedCaptionStyle = {
  color: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontFamily?: string;
  lineHeight?: string;
  textDecoration?: string;
  textAlign?: 'left' | 'center' | 'right';
};

const VALID_COLOR_RE = /^(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|transparent)$/;
const VALID_CSS_TOKEN_RE = /^[a-zA-Z0-9\s"',.\-()%]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !VALID_CSS_TOKEN_RE.test(trimmed)) return undefined;
  return trimmed;
}

function validColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return VALID_COLOR_RE.test(trimmed) ? trimmed : undefined;
}

function validFontWeight(value: unknown): string | undefined {
  const weight = validString(value);
  if (!weight) return undefined;
  if (/^(normal|bold|lighter|bolder)$/.test(weight)) return weight;
  if (/^[1-9]00$/.test(weight)) return weight;
  return undefined;
}

function validFontStyle(value: unknown): string | undefined {
  const style = validString(value);
  return style === 'normal' || style === 'italic' ? style : undefined;
}

export function normalizeCaptionStyle(value: unknown): Partial<CaptionStyle> | null {
  if (!isRecord(value)) return null;

  const normalized: Partial<CaptionStyle> = {};
  const heading = validString(value.heading);
  if (
    heading === 'h1' ||
    heading === 'h2' ||
    heading === 'normal' ||
    heading === 'small' ||
    heading === 'code' ||
    heading === 'callout' ||
    heading === 'quote'
  ) {
    normalized.heading = heading;
  }

  const fontSize = validString(value.fontSize);
  if (fontSize) normalized.fontSize = fontSize;

  const fontWeight = validFontWeight(value.fontWeight);
  if (fontWeight) normalized.fontWeight = fontWeight;

  const fontStyle = validFontStyle(value.fontStyle);
  if (fontStyle) normalized.fontStyle = fontStyle;

  const fontFamily = validString(value.fontFamily);
  if (fontFamily) normalized.fontFamily = fontFamily;

  const lineHeight = validString(value.lineHeight);
  if (lineHeight) normalized.lineHeight = lineHeight;

  const color = validColor(value.color);
  if (color) normalized.color = color;

  const backgroundColor = validColor(value.backgroundColor);
  if (backgroundColor) normalized.backgroundColor = backgroundColor;

  if (typeof value.underline === 'boolean') normalized.underline = value.underline;
  if (typeof value.strikethrough === 'boolean') normalized.strikethrough = value.strikethrough;

  const textAlign = validString(value.textAlign);
  if (textAlign === 'left' || textAlign === 'center' || textAlign === 'right') {
    normalized.textAlign = textAlign;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

// Bold/Italic/Underline/Strikethrough (TextFormattingButtons, shared across
// every "Text style" panel) toggle on top of whichever heading preset is
// active, rather than being tied to a specific heading -- same as how a
// TipTap "bold" mark layers over a paragraph's own styling.
export function captionTextDecoration(
  style: { underline?: boolean; strikethrough?: boolean } | null | undefined,
): string | undefined {
  const parts: string[] = [];
  if (style?.underline) parts.push('underline');
  if (style?.strikethrough) parts.push('line-through');
  return parts.length > 0 ? parts.join(' ') : undefined;
}

// Every post type with a title stores its title's style in a different
// place: Todo keeps it on metadata.captionStyle (the same field its tasks
// reuse), Table serializes its whole state -- including titleStyle -- as
// JSON in `content` rather than metadata, and everything else (text/note/
// image) keeps a dedicated metadata.titleStyle. This centralizes that
// per-type lookup so every renderer (Freeform canvas, Columns, Grid/Row)
// resolves a title's style identically to how the editor modal wrote it.
export function resolvePadletTitleStyle(
  padlet: { type?: string | null; content?: string | null; metadata?: unknown },
  fallbackColor?: string | null,
): ResolvedCaptionStyle {
  const metadata = (padlet.metadata && typeof padlet.metadata === 'object' ? padlet.metadata : {}) as Record<string, unknown>;
  let source: unknown;
  if (padlet.type === 'todo') {
    source = metadata.captionStyle;
  } else if (padlet.type === 'table') {
    try {
      source = (JSON.parse(padlet.content || '{}') as Record<string, unknown>)?.titleStyle;
    } catch {
      source = undefined;
    }
  } else {
    source = metadata.titleStyle;
  }
  return resolveCaptionStyle(source, fallbackColor);
}

export function resolveCaptionStyle(value: unknown, metadataTextColor?: string | null): ResolvedCaptionStyle {
  const captionStyle = normalizeCaptionStyle(value);
  const color = captionStyle?.color || metadataTextColor || '#1F2937';
  const textDecoration = captionTextDecoration(captionStyle);

  return {
    color,
    ...(captionStyle?.fontSize ? { fontSize: captionStyle.fontSize } : {}),
    ...(captionStyle?.fontWeight ? { fontWeight: captionStyle.fontWeight } : {}),
    ...(captionStyle?.fontStyle ? { fontStyle: captionStyle.fontStyle } : {}),
    ...(captionStyle?.fontFamily ? { fontFamily: captionStyle.fontFamily } : {}),
    ...(captionStyle?.lineHeight ? { lineHeight: captionStyle.lineHeight } : {}),
    ...(captionStyle?.backgroundColor ? { backgroundColor: captionStyle.backgroundColor } : {}),
    ...(textDecoration ? { textDecoration } : {}),
    ...(captionStyle?.textAlign ? { textAlign: captionStyle.textAlign } : {}),
  };
}
