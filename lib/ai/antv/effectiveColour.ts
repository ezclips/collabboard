/**
 * PATCH-275. The colour a side-panel row must show, read from the parts it
 * applies to. The current colour is our override when one is set, else AntV's
 * own colour (kept in `data-ai-base-*` once an override has touched it, else the
 * plain attribute/style). Parsing is pure; the DOM read is one pass per part.
 *
 * No React, no AntV engine: only the DOM shape AntV happens to draw.
 */

export type ColourKind = 'fill' | 'stroke' | 'text';

export interface ColourValue {
  /** `#rrggbb`, lower-case. */
  hex: string;
  /** 0..1. */
  alpha: number;
}

export interface EffectiveRowColour {
  /** The colour to show as current; `null` when the parts disagree (mixed). */
  current: ColourValue | null;
  /** AntV's own colour for the first part, if any (the Original swatch). */
  base: ColourValue | null;
  /** The raw base literal, so a 10 %-tint card keeps its alpha on the swatch. */
  baseCss: string | null;
  /** True when the applied-to parts have different current colours. */
  mixed: boolean;
}

const EMPTY_ROW: EffectiveRowColour = { current: null, base: null, baseCss: null, mixed: false };

const HEX_PATTERN = /^#([0-9a-f]{3,8})$/i;
const RGB_PATTERN =
  /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/i;

const BASE_ATTR: Record<Exclude<ColourKind, 'text'>, string> = {
  fill: 'data-ai-base-fill',
  stroke: 'data-ai-base-stroke',
};

function toHex2(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, '0');
}

/**
 * PATCH-275. A self-contained colour literal to `{ hex, alpha }`, or `null` for
 * `none`, `transparent`, `url(…)` or anything unparseable. Accepts `#rgb`,
 * `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`. Never throws.
 */
export function parseColour(value: string | null | undefined): ColourValue | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'none' || trimmed === 'transparent') return null;
  if (trimmed.startsWith('url(')) return null;

  const hex = HEX_PATTERN.exec(trimmed);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b] = digits;
      const alpha = digits.length === 4 ? parseInt(digits[3] + digits[3], 16) / 255 : 1;
      return { hex: `#${r}${r}${g}${g}${b}${b}`, alpha };
    }
    if (digits.length === 6) return { hex: `#${digits}`, alpha: 1 };
    if (digits.length === 8) {
      return { hex: `#${digits.slice(0, 6)}`, alpha: parseInt(digits.slice(6, 8), 16) / 255 };
    }
    return null;
  }

  const rgb = RGB_PATTERN.exec(trimmed);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (channels.some((channel) => !Number.isFinite(channel) || channel > 255)) return null;
    const alpha = rgb[4] !== undefined ? Number(rgb[4]) : 1;
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
    return { hex: `#${channels.map(toHex2).join('')}`, alpha };
  }

  return null;
}

/** The node that actually carries text: the inner node of a foreignObject, or a `<text>`. */
function textTarget(el: Element): Element | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'text') return el;
  if (tag === 'foreignobject') return el.firstElementChild ?? el;
  const foreign = el.querySelector('foreignObject');
  if (foreign) return foreign.firstElementChild ?? foreign;
  const text = el.querySelector('text');
  if (text) return text;
  return el.firstElementChild ?? el;
}

/** PATCH-275. The current colour literal the DOM shows for one part. */
export function readDomColour(el: Element, kind: ColourKind): string | null {
  if (kind === 'fill') return el.getAttribute('fill');
  if (kind === 'stroke') return el.getAttribute('stroke');
  const target = textTarget(el);
  if (!target) return null;
  if (target.tagName.toLowerCase() === 'text') return target.getAttribute('fill');
  return (target as HTMLElement).style?.color ?? null;
}

/** PATCH-275. AntV's own colour for one part: the `data-ai-base-*` value, else the DOM. */
export function readBaseColour(el: Element, kind: ColourKind): string | null {
  if (kind === 'text') {
    const target = textTarget(el);
    const stored = target?.getAttribute('data-ai-base-color');
    if (stored !== undefined && stored !== null) return stored;
    return readDomColour(el, kind);
  }
  const stored = el.getAttribute(BASE_ATTR[kind]);
  return stored !== null ? stored : readDomColour(el, kind);
}

/**
 * PATCH-275. The row's colour from its parts and (optional) override. If the
 * parts disagree the row is Mixed: `current` is `null`. `base`/`baseCss` are the
 * first part's AntV colour, with its alpha, for the Original swatch.
 */
export function effectiveColour(
  elements: Element[],
  kind: ColourKind,
  override?: string,
): EffectiveRowColour {
  if (elements.length === 0) return { ...EMPTY_ROW };

  const currents: ColourValue[] = [];
  let base: ColourValue | null = null;
  let baseCss: string | null = null;

  for (const el of elements) {
    // PATCH-275 Addendum 1. With no override the applied DOM colour is the
    // truth; when AntV draws none there (e.g. a foreignObject whose colour lives
    // on the stored base), fall back to AntV's own colour so `current` is never
    // emptier than the Original swatch.
    const currentLiteral = override ?? readDomColour(el, kind) ?? readBaseColour(el, kind);
    const parsedCurrent = parseColour(currentLiteral);
    if (parsedCurrent) currents.push(parsedCurrent);

    const baseLiteral = readBaseColour(el, kind);
    const parsedBase = parseColour(baseLiteral);
    if (parsedBase && base === null) {
      base = parsedBase;
      baseCss = baseLiteral ? baseLiteral.trim().toLowerCase() : null;
    }
  }

  const mixed =
    currents.length > 1 &&
    currents.some((colour) => colour.hex !== currents[0].hex || colour.alpha !== currents[0].alpha);

  return {
    current: mixed ? null : currents[0] ?? null,
    base,
    baseCss,
    mixed,
  };
}
