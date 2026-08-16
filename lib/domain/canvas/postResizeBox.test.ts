import { describe, expect, it } from 'vitest';
import { isMeaningfulPostResize, resizePostBox } from '@/lib/domain/canvas/postResizeBox';

const AI_MIN = { minWidth: 200, minHeight: 150 };

describe('PATCH POST-RESIZE-B1 resizePostBox', () => {
  it('16. a +200 world-unit dx changes width by exactly +200', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: 200, deltaY: 0 }))
      .toEqual({ width: 560, height: 220 });
  });

  it('17. a +100 world-unit dy changes height by exactly +100', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: 0, deltaY: 100 }))
      .toEqual({ width: 360, height: 320 });
  });

  it('15. bottom-right resize never moves x/y (no x/y in the result at all)', () => {
    const result = resizePostBox({ startWidth: 360, startHeight: 220, deltaX: -40, deltaY: 30 });
    expect(result).toEqual({ width: 320, height: 250 });
    expect(Object.keys(result)).toEqual(['width', 'height']);
  });

  it('18. clamps to per-type minima (AI 200x150)', () => {
    expect(resizePostBox({ startWidth: 500, startHeight: 400, deltaX: -10000, deltaY: -10000, ...AI_MIN }))
      .toEqual({ width: 200, height: 150 });
    expect(resizePostBox({ startWidth: 210, startHeight: 160, deltaX: -20, deltaY: -20, ...AI_MIN }))
      .toEqual({ width: 200, height: 150 });
  });

  it('18b. image minimum 100x100 applies', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 200, deltaX: -500, deltaY: -500, minWidth: 100, minHeight: 100 }))
      .toEqual({ width: 100, height: 100 });
  });

  it('19. NaN/Infinity deltas and starts never produce non-finite output', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: Number.NaN, deltaY: Number.NaN }))
      .toEqual({ width: 360, height: 220 });
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: Number.POSITIVE_INFINITY, deltaY: Number.NEGATIVE_INFINITY }))
      .toEqual({ width: 360, height: 220 });
    expect(Number.isFinite(resizePostBox({ startWidth: Number.NaN, startHeight: Number.NaN, deltaX: 50, deltaY: 50 }).width)).toBe(true);
  });

  it('19b. non-finite maxima are ignored, not propagated', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: 500, deltaY: 500, maxWidth: Number.NaN, maxHeight: Number.NaN }))
      .toEqual({ width: 860, height: 720 });
  });

  it('25. world-extent maxima clamp the right/bottom edge', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: 99999, deltaY: 99999, minWidth: 100, minHeight: 100, maxWidth: 1000, maxHeight: 800 }))
      .toEqual({ width: 1000, height: 800 });
  });

  it('23. sub-epsilon movement rounds back onto the start size (no-op)', () => {
    expect(resizePostBox({ startWidth: 360, startHeight: 220, deltaX: 0.4, deltaY: -0.4 }))
      .toEqual({ width: 360, height: 220 });
    expect(isMeaningfulPostResize(360, 220, { width: 360, height: 220 })).toBe(false);
  });

  it('23b. a real change is meaningful', () => {
    const next = resizePostBox({ startWidth: 360, startHeight: 220, deltaX: 40, deltaY: 0 });
    expect(isMeaningfulPostResize(360, 220, next)).toBe(true);
  });

  it('negative deltas can shrink but never below the minimum', () => {
    expect(resizePostBox({ startWidth: 800, startHeight: 600, deltaX: -300, deltaY: -100, ...AI_MIN }))
      .toEqual({ width: 500, height: 500 });
  });

  it('lockAspect keeps the starting ratio when the width axis dominates', () => {
    const result = resizePostBox({ startWidth: 400, startHeight: 200, deltaX: 200, deltaY: 40, minWidth: 100, minHeight: 100, lockAspect: true });
    expect(result.width / result.height).toBeCloseTo(2, 5);
    expect(result.width).toBe(600);
    expect(result.height).toBe(300);
  });

  it('lockAspect keeps the starting ratio when the height axis dominates', () => {
    const result = resizePostBox({ startWidth: 400, startHeight: 200, deltaX: 40, deltaY: 200, minWidth: 100, minHeight: 100, lockAspect: true });
    expect(result.width / result.height).toBeCloseTo(2, 5);
    expect(result.height).toBe(400);
    expect(result.width).toBe(800);
  });

  it('lockAspect floors on the minimum when shrinking to it', () => {
    const result = resizePostBox({ startWidth: 400, startHeight: 200, deltaX: 0, deltaY: -1000, minWidth: 100, minHeight: 100, lockAspect: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });
});
