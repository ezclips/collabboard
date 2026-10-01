/**
 * PATCH-235 Addendum 2. Where a "Visualize…" picture should land so it does not
 * cover other posts. Pure geometry -- no DOM.
 */

export interface VisualizeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindVisualizeSpotInput {
  source: VisualizeRect;
  size: { width: number; height: number };
  others: VisualizeRect[];
  gap?: number;
  margin?: number;
}

function intersects(a: VisualizeRect, b: VisualizeRect, margin: number): boolean {
  return (
    a.x - margin < b.x + b.width &&
    b.x < a.x + a.width + margin &&
    a.y - margin < b.y + b.height &&
    b.y < a.y + a.height + margin
  );
}

function isFree(candidate: VisualizeRect, others: VisualizeRect[], margin: number): boolean {
  return !others.some((other) => intersects(candidate, other, margin));
}

export function findVisualizeSpot({
  source,
  size,
  others,
  gap = 80,
  margin = 24,
}: FindVisualizeSpotInput): { x: number; y: number } {
  const rightX = source.x + source.width + gap;
  const leftX = source.x - gap - size.width;
  const step = 60;
  const maxSteps = 15;

  // To the right of the source, stepping down while blocked.
  for (let i = 0; i <= maxSteps; i += 1) {
    const candidate = { x: rightX, y: source.y + i * step, width: size.width, height: size.height };
    if (isFree(candidate, others, margin)) return { x: candidate.x, y: candidate.y };
  }

  // Then to the left, same y steps.
  for (let i = 0; i <= maxSteps; i += 1) {
    const candidate = { x: leftX, y: source.y + i * step, width: size.width, height: size.height };
    if (isFree(candidate, others, margin)) return { x: candidate.x, y: candidate.y };
  }

  // Then below the source.
  const below = {
    x: source.x,
    y: source.y + source.height + gap,
    width: size.width,
    height: size.height,
  };
  if (isFree(below, others, margin)) return { x: below.x, y: below.y };

  // Everything is blocked: the first candidate (right, same y).
  return { x: rightX, y: source.y };
}
