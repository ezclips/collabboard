// @vitest-environment jsdom
//
// PATCH-277 Addendum 3. `conversionMs` must measure the conversion only, NOT
// the one-time Excalidraw module load (which every harness row would otherwise
// pay). The load time is reported separately as `moduleLoadMs`. This test
// injects a clock and a deliberately slow loader to prove the separation.
import { describe, expect, it } from 'vitest';

import { convertAntvSvg, type ConvertAntvSvgOptions } from './index';
import type { GeometryRect, SvgGeometry } from './geometry';

function svg(markup: string): Element {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

const BOX: GeometryRect = { x: 0, y: 0, width: 40, height: 20 };

function stubGeometry(): SvgGeometry {
  const style = {
    display: 'inline',
    visibility: 'visible',
    opacity: '1',
    fill: '#dceef5',
    stroke: '#2c7da0',
    fillOpacity: '1',
    strokeOpacity: '1',
    strokeWidth: '2',
    strokeDasharray: 'none',
    color: '#000000',
    fontSize: '16px',
    fontFamily: 'Helvetica',
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'start',
    textAnchor: 'start',
    clipPath: 'none',
    mask: 'none',
    markerStart: 'none',
    markerEnd: 'none',
  } as unknown as CSSStyleDeclaration;
  return {
    viewBox: () => ({ width: 40, height: 20 }),
    box: () => BOX,
    rotated: () => false,
    outline: () => null,
    textBox: () => BOX,
    textLineCount: () => 1,
    samplePath: () => null,
    point: (_el, _root, x, y) => ({ x, y }),
    scale: () => 1,
    style: () => style,
    firstTextHost: () => null,
    symbol: () => null,
  };
}

const MODULE_DELAY_MS = 800;

/** A fake Excalidraw module whose loader sleeps, then passes skeletons through. */
function delayedModule() {
  return {
    loadModule: async () => {
      await new Promise((resolve) => setTimeout(resolve, MODULE_DELAY_MS));
      return {
        convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
      } as never;
    },
  };
}

describe('PATCH-277 Addendum 3 conversion timing', () => {
  it('excludes the module load from conversionMs and reports it separately', async () => {
    const root = svg(
      '<svg viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg"><rect id="r" x="0" y="0" width="40" height="20" fill="#dceef5" stroke="#2c7da0" /></svg>',
    );
    // A monotonic fake clock that advances with real wall time.
    const origin = Date.now();
    const now = () => Date.now() - origin;
    const options: ConvertAntvSvgOptions = {
      background: '#ffffff',
      geometry: stubGeometry(),
      now,
      ...delayedModule(),
    };
    const result = await convertAntvSvg(root, options);
    expect(result.report.moduleLoadMs).toBeGreaterThanOrEqual(MODULE_DELAY_MS - 20);
    // The conversion itself is a few ms of pure work; nowhere near the delay.
    expect(result.report.conversionMs).toBeLessThan(MODULE_DELAY_MS / 4);
    expect(result.report.passedTime).toBe(true);
  });
});
