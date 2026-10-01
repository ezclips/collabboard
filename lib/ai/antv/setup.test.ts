// @vitest-environment jsdom
import * as antv from '@antv/infographic';
import { describe, expect, it } from 'vitest';

import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';
import { sanitizeTextStyle } from '@/lib/ai/outline';
import { ANTV_FONT_STACK, ANTV_HAND_DRAWN_FONT_STACK, configureAntv, makeAntvResourceLoader } from './setup';

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
