// @vitest-environment node
//
// PATCH-278 A.1. The analytic path sampler replaces the browser's
// `getPointAtLength` walk (the 420 ms roadmap). Straight runs are exact end
// points; curves and arcs are sampled at <= 4 user units. These tests check the
// samples against independently computed reference points (<= 0.5 unit).
import { describe, expect, it } from 'vitest';

import { samplePathD } from './pathSampler';

const SPACING = 4;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function maxGap(points: ReadonlyArray<{ x: number; y: number }>): number {
  let max = 0;
  for (let i = 1; i < points.length; i += 1) {
    max = Math.max(max, dist(points[i - 1], points[i]));
  }
  return max;
}

/** Fine reference sample of a cubic Bezier. */
function cubicReference(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  steps = 4000,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

/** Fine reference sample of a quadratic Bezier. */
function quadReference(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  steps = 4000,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/** Reference sample of an SVG arc via the F.6 centre parameterisation. */
function arcReference(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  large: number,
  sweep: number,
  x2: number,
  y2: number,
  steps = 4000,
): Array<{ x: number; y: number }> {
  const rx = Math.abs(rxIn);
  const ry = Math.abs(ryIn);
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = Math.atan2(uy, ux);
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = theta1 + (delta * i) / steps;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    out.push({ x: cx + cos * ex - sin * ey, y: cy + sin * ex + cos * ey });
  }
  return out;
}

function distanceToPolyline(
  p: { x: number; y: number },
  line: ReadonlyArray<{ x: number; y: number }>,
): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    min = Math.min(min, d);
  }
  return min;
}

/** Every sampled point must lie within `tolerance` of the reference curve. */
function expectOnReference(
  sampled: ReadonlyArray<{ x: number; y: number }>,
  reference: ReadonlyArray<{ x: number; y: number }>,
  tolerance = 0.5,
): void {
  for (const point of sampled) {
    let nearest = Infinity;
    for (const ref of reference) nearest = Math.min(nearest, dist(point, ref));
    expect(nearest, `point ${point.x},${point.y} off the curve by ${nearest}`).toBeLessThanOrEqual(tolerance);
  }
}

describe('PATCH-278 samplePathD', () => {
  it('parses absolute L/H/V with exact end points', () => {
    const subpaths = samplePathD('M0 0 L10 0 H20 V10 L0 10 Z');
    expect(subpaths).not.toBeNull();
    expect(subpaths).toHaveLength(1);
    expect(subpaths![0]).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]);
  });

  it('handles relative commands and implicit repeats', () => {
    const subpaths = samplePathD('m5 5 l5 0 0 5 -5 0 z');
    expect(subpaths).not.toBeNull();
    expect(subpaths![0]).toEqual([
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
      { x: 5, y: 10 },
      { x: 5, y: 5 },
    ]);
  });

  it('treats extra M coordinate pairs as implicit L', () => {
    const subpaths = samplePathD('M0 0 10 0 10 10');
    expect(subpaths![0]).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('samples a cubic curve within 0.5 unit at <= 4 unit spacing', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 40 };
    const p2 = { x: 40, y: 40 };
    const p3 = { x: 40, y: 0 };
    const subpaths = samplePathD('M0 0 C0 40 40 40 40 0', { spacing: SPACING })!;
    const points = subpaths[0];
    expect(points[0]).toEqual(p0);
    expect(points[points.length - 1]).toEqual(p3);
    expect(maxGap(points)).toBeLessThanOrEqual(SPACING + 1e-6);
    expectOnReference(points, cubicReference(p0, p1, p2, p3));
  });

  it('reflects the control point for smooth cubics (S)', () => {
    const subpaths = samplePathD('M0 0 C10 0 20 10 20 20 S30 40 40 40')!;
    const points = subpaths[0];
    expect(points[points.length - 1]).toEqual({ x: 40, y: 40 });
    // The S control point is the reflection of (20,10) about (20,20) -> (20,30).
    const reference = cubicReference(
      { x: 20, y: 20 },
      { x: 20, y: 30 },
      { x: 30, y: 40 },
      { x: 40, y: 40 },
    );
    const tail = points.filter((p) => p.x >= 20);
    expectOnReference(tail, reference);
  });

  it('samples a quadratic curve within 0.5 unit', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 20, y: 40 };
    const p2 = { x: 40, y: 0 };
    const points = samplePathD('M0 0 Q20 40 40 0', { spacing: SPACING })![0];
    expect(points[points.length - 1]).toEqual(p2);
    expect(maxGap(points)).toBeLessThanOrEqual(SPACING + 1e-6);
    expectOnReference(points, quadReference(p0, p1, p2));
  });

  it('samples arcs for every large-arc/sweep combination on the same circle', () => {
    const cases = [
      { large: 0, sweep: 0 },
      { large: 0, sweep: 1 },
      { large: 1, sweep: 0 },
      { large: 1, sweep: 1 },
    ];
    const lengths: number[] = [];
    for (const c of cases) {
      const d = `M0 0 A5 5 0 ${c.large} ${c.sweep} 6 0`;
      const points = samplePathD(d, { spacing: SPACING })![0];
      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points[points.length - 1].x).toBeCloseTo(6, 6);
      expect(points[points.length - 1].y).toBeCloseTo(0, 6);
      expect(maxGap(points)).toBeLessThanOrEqual(SPACING + 1e-6);
      // Reference: the published endpoint -> centre parameterisation (F.6).
      expectOnReference(points, arcReference(0, 0, 5, 5, 0, c.large, c.sweep, 6, 0));
      let length = 0;
      for (let i = 1; i < points.length; i += 1) length += dist(points[i - 1], points[i]);
      lengths.push(length);
    }
    // large-arc is strictly longer than the small arc for the same sweep.
    expect(lengths[2]).toBeGreaterThan(lengths[0]);
    expect(lengths[3]).toBeGreaterThan(lengths[1]);
    // The two sweeps go to opposite sides of the chord.
    const side = (large: number, sweep: number) => {
      const points = samplePathD(`M0 0 A5 5 0 ${large} ${sweep} 6 0`)![0];
      const mid = points[Math.floor(points.length / 2)];
      return Math.sign(mid.y);
    };
    expect(side(0, 0)).toBe(-side(0, 1));
  });

  it('samples the road-like 4,000-unit fixture analytically and tightly', () => {
    // Straights + two radius-60 arcs, closed; the shape that used to take 420 ms.
    const d =
      'M0 0 L1200 0 A60 60 0 0 1 1260 60 L1260 900 ' +
      'A60 60 0 0 1 1200 960 L0 960 Z';
    const started = Date.now();
    const subpaths = samplePathD(d, { spacing: SPACING })!;
    const elapsed = Date.now() - started;
    expect(subpaths).toHaveLength(1);
    // Straight runs are exact end points; the two radius-60 half-arcs are the
    // only sampled part, so the whole outline stays tiny.
    expect(subpaths[0]).toContainEqual({ x: 0, y: 0 });
    expect(subpaths[0]).toContainEqual({ x: 1260, y: 900 });
    expect(subpaths[0].length).toBeLessThan(200);
    expect(elapsed).toBeLessThan(500);
  });

  it('returns null for unparsable data so the caller can fall back', () => {
    expect(samplePathD('')).toBeNull();
    expect(samplePathD('not a path')).toBeNull();
    expect(samplePathD('M0 0 L')).toBeNull();
    expect(samplePathD('M0 0 X10 10')).toBeNull();
  });
});
