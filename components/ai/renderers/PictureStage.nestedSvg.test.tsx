// @vitest-environment jsdom
//
// PATCH-262 Addendum 1.4. The "fill 100%" rule must match only the picture's own
// root svg: a nested <svg> (an added icon drawn as a nested svg by mistake) must
// NOT be stretched. The selector is tightened to a direct child.
import { describe, expect, it } from 'vitest';

import { ANTV_PICTURE_SVG_SELECTOR, findPictureSvg } from './PictureStage';

describe('PATCH-262 ANTV_PICTURE_SVG_SELECTOR', () => {
  it('matches only the picture root svg, never a nested svg inside it', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div data-picture-stage data-picture-mode="antv">
        <div data-picture-content>
          <div data-antv-container="list-grid-badge-card">
            <svg data-testid="root"><g><svg data-testid="nested"><rect width="10" height="10"/></svg></g></svg>
          </div>
        </div>
      </div>`;
    const root = host.querySelector('[data-testid="root"]') as SVGElement;
    const nested = host.querySelector('[data-testid="nested"]') as SVGElement;

    expect(root.matches(ANTV_PICTURE_SVG_SELECTOR)).toBe(true);
    expect(nested.matches(ANTV_PICTURE_SVG_SELECTOR)).toBe(false);

    const stage = host.querySelector('[data-picture-stage]') as HTMLElement;
    expect(findPictureSvg(stage)).toBe(root);
  });
});
