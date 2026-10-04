/**
 * PATCH-277 Addendum 4. Pure polyline geometry: point cleanup, Ramer–Douglas–
 * Peucker simplification (straight runs collapse, arcs keep enough points), and
 * the exact stadium/capsule outline. Split out of `toSkeleton` to keep each
 * file under the line ceiling.
 */

import type { ScenePoint, SceneRect } from './scene';

function cleanPoints(points: readonly ScenePoint[]): ScenePoint[] {
  const result: ScenePoint[] = [];
  for (const point of points) {
    const prev = result[result.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.25) {
      result.push(point);
    }
  }
  return result;
}

/** Perpendicular distance of `p` from the line `a`–`b`, in user units. */
function perpendicularDistance(p: ScenePoint, a: ScenePoint, b: ScenePoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
}

/**
 * Ramer–Douglas–Peucker. Straight runs collapse to their end points; a single
 * arc keeps just enough points to stay within `tolerance` of the source.
 */
export function rdp(points: readonly ScenePoint[], tolerance: number): ScenePoint[] {
  if (points.length <= 2) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance > tolerance) {
    const left = rdp(points.slice(0, index + 1), tolerance);
    const right = rdp(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** Tolerance for path simplification: 0.5 user units (Addendum 4). */
export const RDP_TOLERANCE = 0.5;

/** Clean, dedupe a closed ring's seam, then simplify. */
export function simplifyPolyline(points: readonly ScenePoint[], closed: boolean): ScenePoint[] {
  const cleaned = cleanPoints(points);
  if (closed && cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) <= 0.25) cleaned.pop();
  }
  const reduced = rdp(cleaned, RDP_TOLERANCE);
  return reduced.length >= 2 ? reduced : cleaned.length >= 2 ? cleaned : [];
}

/** The exact outline of a stadium/capsule, sampled clockwise. */
export function stadiumPoints(box: SceneRect, segments = 12): ScenePoint[] {
  const { x, y, width, height } = box;
  const r = Math.min(width, height) / 2;
  const points: ScenePoint[] = [];
  const arc = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 0; i <= segments; i += 1) {
      const angle = from + ((to - from) * i) / segments;
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  };
  if (width >= height) {
    const cy = y + height / 2;
    points.push([x + r, y]);
    points.push([x + width - r, y]);
    arc(x + width - r, cy, -Math.PI / 2, Math.PI / 2);
    points.push([x + r, y + height]);
    arc(x + r, cy, Math.PI / 2, (3 * Math.PI) / 2);
  } else {
    const cx = x + width / 2;
    points.push([x, y + r]);
    points.push([x, y + height - r]);
    arc(cx, y + height - r, Math.PI, 0);
    points.push([x + width, y + r]);
    arc(cx, y + r, 0, Math.PI);
  }
  return points;
}
