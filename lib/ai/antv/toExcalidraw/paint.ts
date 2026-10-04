/**
 * PATCH-277. Pure colour handling for the AntV -> Excalidraw converter: parse
 * the colour syntaxes AntV emits, blend alpha over the picture background, and
 * flatten a gradient to the colour at offset 0.5. No DOM, no globals.
 *
 * Why blend: Excalidraw's element `opacity` fades the stroke and the text too,
 * and an `#rrggbbaa` fill is not guaranteed through its renderer. AntV shows a
 * translucent shape over its ground, so we reproduce exactly that as an OPAQUE
 * `#rrggbb`.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** One gradient stop: `offset` in 0..1, colour already parsed. */
export interface GradientStop {
  offset: number;
  color: RGBA;
}

/** A resolved paint colour: an opaque hex, or `'none'`. */
export interface ResolvedPaint {
  color: string;
  blended: boolean;
}

const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
  goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000',
  olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb',
  plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513',
  salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee',
  sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f',
  steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8',
  tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexPair(value: string): number {
  return Number.parseInt(value, 16);
}

function parseNumber(value: string, scale: number): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return (Number.parseFloat(trimmed) / 100) * scale;
  return Number.parseFloat(trimmed);
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, named, `none`, `transparent`. */
export function parseColor(input: string | null | undefined): RGBA | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value || value === 'none') return null;
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = hexPair(hex[0] + hex[0]);
      const g = hexPair(hex[1] + hex[1]);
      const b = hexPair(hex[2] + hex[2]);
      const a = hex.length === 4 ? hexPair(hex[3] + hex[3]) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = hexPair(hex.slice(0, 2));
      const g = hexPair(hex.slice(2, 4));
      const b = hexPair(hex.slice(4, 6));
      const a = hex.length === 8 ? hexPair(hex.slice(6, 8)) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  if (value.startsWith('rgb')) {
    const open = value.indexOf('(');
    const close = value.lastIndexOf(')');
    if (open === -1 || close === -1) return null;
    const body = value.slice(open + 1, close).replace(/\//g, ' ');
    const parts = body.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const r = clamp255(parseNumber(parts[0], 255));
    const g = clamp255(parseNumber(parts[1], 255));
    const b = clamp255(parseNumber(parts[2], 255));
    const a = parts.length >= 4 ? clamp01(parseNumber(parts[3], 1)) : 1;
    return { r, g, b, a };
  }

  const named = NAMED_COLORS[value];
  if (named) return parseColor(named);
  return null;
}

/** `#rrggbb` for a parsed, opaque colour (alpha ignored). */
export function colorToHex(color: RGBA): string {
  const hex = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

/**
 * Composites an (alpha-carrying) colour over an opaque background hex and
 * returns the resulting opaque `#rrggbb`.
 */
export function blendOver(color: RGBA, background: string): string {
  const base = parseColor(background);
  if (!base) return colorToHex(color);
  const a = clamp01(color.a);
  return colorToHex({
    r: color.r * a + base.r * (1 - a),
    g: color.g * a + base.g * (1 - a),
    b: color.b * a + base.b * (1 - a),
    a: 1,
  });
}

/** True when the value is `none`, empty, or unsupported (treated as none). */
export function isPaintNone(input: string | null | undefined): boolean {
  if (!input) return true;
  const value = input.trim().toLowerCase();
  return value === 'none' || value === '';
}

/** The colour at `offset` for a stop list, interpolating between neighbours. */
export function gradientColorAt(stops: readonly GradientStop[], offset: number): RGBA | null {
  if (stops.length === 0) return null;
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (offset <= sorted[0].offset) return { ...sorted[0].color };
  const last = sorted[sorted.length - 1];
  if (offset >= last.offset) return { ...last.color };
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (offset >= from.offset && offset <= to.offset) {
      const span = to.offset - from.offset;
      const t = span === 0 ? 0 : (offset - from.offset) / span;
      return {
        r: from.color.r + (to.color.r - from.color.r) * t,
        g: from.color.g + (to.color.g - from.color.g) * t,
        b: from.color.b + (to.color.b - from.color.b) * t,
        a: from.color.a + (to.color.a - from.color.a) * t,
      };
    }
  }
  return { ...last.color };
}

/**
 * Resolves one paint value to an opaque hex or `'none'`.
 *
 * @param value        the raw fill/stroke (`#...`, `rgb()`, a name, or `url(#id)`).
 * @param alpha        colour-external alpha: the element/fill/stroke opacity product.
 * @param background   the picture ground, for blending.
 * @param gradient     when `value` is a `url(#...)`, its flattened stops at 0.5.
 */
export function resolvePaint(
  value: string | null | undefined,
  alpha: number,
  background: string,
  gradient?: readonly GradientStop[],
): ResolvedPaint {
  if (!value) return { color: 'none', blended: false };
  const trimmed = value.trim();
  const gradientRef = /^url\([^)]*\)$/i.test(trimmed);
  let base: RGBA | null;
  if (gradientRef) {
    base = gradient && gradient.length ? gradientColorAt(gradient, 0.5) : null;
  } else {
    base = parseColor(trimmed);
  }
  if (!base) return { color: 'none', blended: false };
  const effective = clamp01(base.a * clamp01(alpha));
  if (effective <= 0) return { color: 'none', blended: false };
  if (effective >= 1) return { color: colorToHex(base), blended: false };
  return { color: blendOver({ ...base, a: effective }, background), blended: true };
}
