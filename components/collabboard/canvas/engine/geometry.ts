/**
 * Pure geometry helpers for canvas line intersection tests.
 * No React, no state, no Supabase, no DOM.
 */

export function orientation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(v) < 1e-6) return 0;
  return v > 0 ? 1 : 2;
}

export function onSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): boolean {
  return (
    b.x <= Math.max(a.x, c.x) + 1e-6 &&
    b.x >= Math.min(a.x, c.x) - 1e-6 &&
    b.y <= Math.max(a.y, c.y) + 1e-6 &&
    b.y >= Math.min(a.y, c.y) - 1e-6
  );
}

export function segmentsIntersect(
  p1: { x: number; y: number },
  q1: { x: number; y: number },
  p2: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
