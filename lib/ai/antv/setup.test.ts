// @vitest-environment jsdom
import * as antv from '@antv/infographic';
import { parseSVG } from '@antv/infographic';
import { describe, expect, it } from 'vitest';

import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';
import { sanitizeTextStyle } from '@/lib/ai/outline';
import { ANTV_FONT_STACK, ANTV_HAND_DRAWN_FONT_STACK, configureAntv, makeAntvResourceLoader } from './setup';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('PATCH-241 configureAntv', () => {
  it('uses system-only font stacks (no remote Inter or Roboto)', () => {
    for (const stack of [ANTV_FONT_STACK, ANTV_HAND_DRAWN_FONT_STACK]) {
      expect(stack).not.toMatch(/\bInter\b/i);
      expect(stack).not.toMatch(/\bRoboto\b/i);
    }
    expect(ANTV_FONT_STACK).toContain('system-ui');
  });

  it('clears every registered font URL and empty weights (no webfont fetch)', () => {
    configureAntv(antv);
    const fonts = antv.getFonts();
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.baseUrl).toBe('');
      expect(Object.keys(font.fontWeight ?? {})).toHaveLength(0);
    }
  });

  // PATCH-244. The text-style validator's font allowlist must keep our two
  // stacks (see outline.ts TEXT_STYLE_FONT_FAMILIES), or a stored font would be
  // silently dropped. This pins the two definitions together.
  it('accepts our own font stacks as a storable font family', () => {
    expect(sanitizeTextStyle({ fontFamily: ANTV_FONT_STACK })?.fontFamily).toBe(ANTV_FONT_STACK);
    expect(sanitizeTextStyle({ fontFamily: ANTV_HAND_DRAWN_FONT_STACK })?.fontFamily).toBe(
      ANTV_HAND_DRAWN_FONT_STACK,
    );
  });

  it('the icon loader returns a symbol for every name and for an unknown one, never null', async () => {
    configureAntv(antv);
    const loader = makeAntvResourceLoader(antv);
    for (const name of VISUAL_ICON_NAMES) {
      const element = await loader({ data: `lucide/${name}` });
      expect(element, `${name} must load`).toBeTruthy();
      expect(element.getAttribute('viewBox')).toBe('0 0 24 24');
    }
    const unknown = await loader({ data: 'lucide/definitely-not-an-icon' });
    expect(unknown).toBeTruthy();
    expect(unknown.getAttribute('viewBox')).toBe('0 0 24 24');

    const empty = await loader({});
    expect(empty).toBeTruthy();
  });
});

describe('PATCH-276 the loader returns namespace-correct symbols', () => {
  it('each loaded symbol is an SVGSymbolElement in the SVG namespace (real parseSVG)', async () => {
    const loader = makeAntvResourceLoader(antv);
    for (const name of VISUAL_ICON_NAMES) {
      const element = await loader({ data: `lucide/${name}` });
      expect(element.namespaceURI, `${name} must be in the SVG namespace`).toBe(SVG_NS);
      expect(element.constructor.name, `${name} must be an SVGSymbolElement`).toBe('SVGSymbolElement');
    }
  });

  it('goes through a stub module whose parseSVG is AntV', async () => {
    // @antv/infographic exports its real `parseSVG` (the two-line DOMParser
    // call), so the loader test exercises the exact production path.
    const stub = { parseSVG } as unknown as Parameters<typeof makeAntvResourceLoader>[0];
    const element = await makeAntvResourceLoader(stub)({ data: 'lucide/sun' });
    expect(element.namespaceURI).toBe(SVG_NS);
    expect(element.constructor.name).toBe('SVGSymbolElement');
  });
});
