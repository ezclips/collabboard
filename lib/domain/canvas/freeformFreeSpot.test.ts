import { describe, expect, it } from 'vitest';
import { findFreeSpot, type WorldRect } from './freeformFreeSpot';

const area: WorldRect = { x: 0, y: 0, width: 600, height: 400 };
const card = { width: 100, height: 100 };

describe('findFreeSpot', () => {
  it('returns the preferred x/y unchanged when it is already free', () => {
    const preferred: WorldRect = { x: 100, y: 100, ...card };
    expect(findFreeSpot(preferred, [], area, { gap: 0, step: 100 })).toEqual({ x: 100, y: 100 });
  });

  it('moves a covered preferred spot to the nearest free grid spot', () => {
    const occupied: WorldRect[] = [{ x: 200, y: 150, width: 100, height: 100 }];
    const preferred: WorldRect = { x: 200, y: 150, ...card };
    expect(findFreeSpot(preferred, occupied, area, { gap: 0, step: 100 })).toEqual({ x: 100, y: 100 });
  });

  it('keeps the result inside the visible area', () => {
    const occupied: WorldRect[] = [{ x: 200, y: 150, width: 100, height: 100 }];
    const preferred: WorldRect = { x: 200, y: 150, ...card };
    const result = findFreeSpot(preferred, occupied, area, { gap: 0, step: 100 });
    expect(result.x).toBeGreaterThanOrEqual(area.x);
    expect(result.y).toBeGreaterThanOrEqual(area.y);
    expect(result.x + card.width).toBeLessThanOrEqual(area.x + area.width);
    expect(result.y + card.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it('returns the preferred x/y when the whole area is occupied', () => {
    const occupied: WorldRect[] = [{ x: 0, y: 0, width: 600, height: 400 }];
    const preferred: WorldRect = { x: 200, y: 150, ...card };
    expect(findFreeSpot(preferred, occupied, area, { gap: 0, step: 100 })).toEqual({ x: 200, y: 150 });
  });

  it('is deterministic for the same input', () => {
    const occupied: WorldRect[] = [{ x: 200, y: 150, width: 100, height: 100 }];
    const preferred: WorldRect = { x: 200, y: 150, ...card };
    const first = findFreeSpot(preferred, occupied, area, { gap: 0, step: 100 });
    const second = findFreeSpot(preferred, occupied, area, { gap: 0, step: 100 });
    expect(second).toEqual(first);
  });

  it('never mutates its inputs', () => {
    const occupied: WorldRect[] = [{ x: 200, y: 150, width: 100, height: 100 }];
    const preferred: WorldRect = { x: 200, y: 150, ...card };
    const preferredBefore = { ...preferred };
    const occupiedBefore = occupied.map((rect) => ({ ...rect }));
    const areaBefore = { ...area };
    findFreeSpot(preferred, occupied, area, { gap: 0, step: 100 });
    expect(preferred).toEqual(preferredBefore);
    expect(occupied).toEqual(occupiedBefore);
    expect(area).toEqual(areaBefore);
  });

  it('holds the 20 000-candidate cap on a huge area and still lands free and inside', () => {
    const huge: WorldRect = { x: 0, y: 0, width: 100_000, height: 100_000 };
    const occupied: WorldRect[] = [{ x: 0, y: 0, width: 10, height: 10 }];
    const preferred: WorldRect = { x: 0, y: 0, width: 10, height: 10 };
    const result = findFreeSpot(preferred, occupied, huge, { gap: 0, step: 1 });
    expect(Number.isInteger(result.x)).toBe(true);
    expect(Number.isInteger(result.y)).toBe(true);
    expect(result.x + 10).toBeLessThanOrEqual(huge.x + huge.width);
    expect(result.y + 10).toBeLessThanOrEqual(huge.y + huge.height);
    expect(result.x >= 10 || result.y >= 10).toBe(true);
  });
});
