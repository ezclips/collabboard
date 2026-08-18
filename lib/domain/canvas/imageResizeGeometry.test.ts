import { describe, expect, it } from 'vitest';
import { resizeImageOuterBoxToAspect } from './imageResizeGeometry';

describe('IMAGE-R6 image aspect resize geometry', () => {
  it('square image keeps the media box square and adds title chrome outside it', () => {
    const next = resizeImageOuterBoxToAspect({
      outerWidth: 242,
      imageAspectRatio: 1,
      chromeWidth: 2,
      chromeHeight: 24,
    });

    expect(next).toMatchObject({
      width: 242,
      mediaWidth: 240,
      mediaHeight: 240,
      height: 264,
    });
  });

  it('landscape image preserves aspect ratio from requested width', () => {
    const next = resizeImageOuterBoxToAspect({
      outerWidth: 482,
      imageAspectRatio: 16 / 9,
      chromeWidth: 2,
      chromeHeight: 24,
    });

    expect(next?.mediaWidth).toBe(480);
    expect(next?.mediaHeight).toBe(270);
    expect(next?.height).toBe(294);
  });

  it('portrait image preserves aspect ratio from requested width', () => {
    const next = resizeImageOuterBoxToAspect({
      outerWidth: 302,
      imageAspectRatio: 3 / 4,
      chromeWidth: 2,
      chromeHeight: 24,
    });

    expect(next?.mediaWidth).toBe(300);
    expect(next?.mediaHeight).toBe(400);
    expect(next?.height).toBe(424);
  });

  it('does not cap manual image media height at 500px', () => {
    const next = resizeImageOuterBoxToAspect({
      outerWidth: 602,
      imageAspectRatio: 3 / 4,
      chromeWidth: 2,
      chromeHeight: 24,
    });

    expect(next?.mediaHeight).toBe(800);
    expect(next?.height).toBe(824);
  });

  it('returns null for invalid image ratios so callers can keep prior resize behavior', () => {
    expect(resizeImageOuterBoxToAspect({
      outerWidth: 300,
      imageAspectRatio: 0,
      chromeHeight: 24,
    })).toBeNull();
  });
});
