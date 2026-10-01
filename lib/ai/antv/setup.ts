/**
 * PATCH-241. One-time AntV setup, run before the first render on a page. It
 * makes AntV draw with OUR fonts and icons only, so a picture never reaches an
 * outside server:
 *   - every registered font's URLs are cleared and the default font is ours;
 *   - the hand-drawn theme's remote handwriting font is replaced by a local
 *     stack (the rough style stays);
 *   - our six-colour palettes are registered;
 *   - a resource loader turns every `lucide/<name>` into an inline SVG symbol,
 *     and NEVER returns null, so AntV's remote icon search is unreachable.
 *
 * All AntV imports are type-only; the runtime module is passed in by `load.ts`,
 * keeping AntV out of the main bundle and out of server code.
 */

import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';
import { ANTV_ICON_PREFIX, iconSymbolSvg } from './icons';
import { antvPaletteName, antvThemeFor } from './mapOutline';

export type AntvModule = typeof import('@antv/infographic');

/**
 * A SYSTEM-ONLY stack for AntV text. It must NOT name Inter or Roboto: the
 * canvas page resolves those from remote stylesheets, so naming one here made
 * the browser fetch webfont files from Google just to draw a picture.
 */
export const ANTV_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

/** A local-only handwriting stack for the hand-drawn theme. */
export const ANTV_HAND_DRAWN_FONT_STACK =
  "'Segoe Print', 'Comic Sans MS', 'Bradley Hand', cursive";

export interface AntvResourceConfig {
  data?: unknown;
}

/**
 * Builds AntV's custom resource loader. It returns a symbol for every known
 * icon and a neutral dot for anything else -- never null.
 */
export function makeAntvResourceLoader(
  mod: AntvModule,
): (config: AntvResourceConfig) => Promise<SVGSymbolElement> {
  return async (config) => {
    const raw = typeof config?.data === 'string' ? config.data : '';
    const name = raw.startsWith(ANTV_ICON_PREFIX) ? raw.slice(ANTV_ICON_PREFIX.length) : raw;
    return mod.parseSVG(iconSymbolSvg(name)) as unknown as SVGSymbolElement;
  };
}

/** Configures the passed AntV module in place. Idempotent. */
export function configureAntv(mod: AntvModule): void {
  // Fonts off: no CSS/woff2 requests to assets.antv.antgroup.com.
  mod.getFonts().forEach((font) => {
    font.fontWeight = {};
    font.baseUrl = '';
  });
  mod.setDefaultFont(ANTV_FONT_STACK);

  // The hand-drawn theme names a remote handwriting font; swap in local faces.
  mod.registerTheme('hand-drawn', {
    base: { text: { 'font-family': ANTV_HAND_DRAWN_FONT_STACK } },
    stylize: { type: 'rough' },
  });

  // Register one palette per theme, from its six stroke colours.
  for (const id of Object.keys(VISUAL_THEMES) as VisualThemeId[]) {
    mod.registerPalette(
      antvPaletteName(id),
      VISUAL_THEMES[id].palette.map((color) => color.stroke),
    );
  }
  // `hand-drawn` reuses the classic palette; make sure that name exists too.
  const handDrawn = antvThemeFor('hand-drawn');
  mod.registerPalette(
    handDrawn.palette,
    VISUAL_THEMES.classic.palette.map((color) => color.stroke),
  );

  mod.registerResourceLoader(makeAntvResourceLoader(mod) as Parameters<typeof mod.registerResourceLoader>[0]);
}
