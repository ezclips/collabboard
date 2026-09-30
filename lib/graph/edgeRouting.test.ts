import { describe, expect, it } from 'vitest';

import { routeEdge, type Rect } from './edgeRouting';

const source: Rect = { x: 0, y: 0, width: 100, height: 100 };
const target: Rect = { x: 1000, y: 0, width: 100, height: 100 };

describe('PATCH-227 routeEdge per-end gaps', () => {
  it('omitted sourceGap/targetGap is identical to gap-only (the previous behaviour)', () => {
    const withGap = routeEdge(source, target, { gap: 32 });
    const withExplicit = routeEdge(source, target, { gap: 32, sourceGap: 32, targetGap: 32 });
    expect(withExplicit).toEqual(withGap);
  });

  it('sourceGap moves only the source end', () => {
    const base = routeEdge(source, target, { gap: 32 });
    const small = routeEdge(source, target, { gap: 32, sourceGap: 6 });
    expect(small.sx).toBeLessThan(base.sx);
    expect(small.sy).toBe(base.sy);
    // Target end untouched.
    expect(small.ex).toBe(base.ex);
    expect(small.ey).toBe(base.ey);
  });

  it('targetGap moves only the target end', () => {
    const base = routeEdge(source, target, { gap: 32 });
    const small = routeEdge(source, target, { gap: 32, targetGap: 6 });
    expect(small.ex).toBeGreaterThan(base.ex);
    expect(small.ey).toBe(base.ey);
    // Source end untouched.
    expect(small.sx).toBe(base.sx);
    expect(small.sy).toBe(base.sy);
  });

  it('per-end gaps are floored at 6', () => {
    const floored = routeEdge(source, target, { gap: 32, sourceGap: 0, targetGap: -10 });
    const six = routeEdge(source, target, { gap: 32, sourceGap: 6, targetGap: 6 });
    expect(floored).toEqual(six);
  });
});
