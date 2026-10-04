// @vitest-environment jsdom
//
// PATCH-277 Addendum 1/2. `scene.ts` holds LOCAL copies of Excalidraw constants
// and the Helvetica/Cascadia font strings so no converter module imports the
// Excalidraw package at runtime. This test pins them against the fork's
// exported values (and builds the font string the fork would build), so a fork
// drift is a test failure rather than a silent behaviour change.
import { getFontString } from '@excalidraw/common';
import { FONT_FAMILY, ROUNDNESS } from '@excalidraw/excalidraw';
import { describe, expect, it } from 'vitest';

import {
  EXCALIDRAW_FONT_FAMILY_CASCADIA,
  EXCALIDRAW_FONT_FAMILY_HELVETICA,
  FONT_FAMILY_CASCADIA,
  FONT_FAMILY_HELVETICA,
  ROUNDNESS_ADAPTIVE_RADIUS,
} from './scene';

/** The family list the fork builds, e.g. `Helvetica, sans-serif, Segoe UI Emoji`. */
function familyList(id: number): string {
  return getFontString({ fontSize: 16, fontFamily: id }).replace(/^\d+px /, '');
}

describe('PATCH-277 local Excalidraw constants stay in step with the fork', () => {
  it('FONT_FAMILY matches', () => {
    expect(FONT_FAMILY_HELVETICA).toBe(FONT_FAMILY.Helvetica);
    expect(FONT_FAMILY_CASCADIA).toBe(FONT_FAMILY.Cascadia);
  });

  it('ROUNDNESS matches', () => {
    expect(ROUNDNESS_ADAPTIVE_RADIUS).toBe(ROUNDNESS.ADAPTIVE_RADIUS);
  });

  it('the Helvetica/Cascadia font-family lists match what the fork builds', () => {
    expect(EXCALIDRAW_FONT_FAMILY_HELVETICA).toBe(familyList(FONT_FAMILY.Helvetica));
    expect(EXCALIDRAW_FONT_FAMILY_CASCADIA).toBe(familyList(FONT_FAMILY.Cascadia));
  });
});
