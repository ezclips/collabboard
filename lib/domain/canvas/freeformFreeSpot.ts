/**
 * PATCH-304 addendum. Placement policy for a new PDF card on a freeform board:
 * given where the card would like to sit, the rects already on the board, and
 * the visible part of the board, return the nearest free spot. Pure: no React,
 * no DOM, no mutation.
 */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_GAP = 24;
const DEFAULT_STEP = 24;
const MAX_CANDIDATES = 20_000;

function intersects(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isInside(rect: WorldRect, area: WorldRect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}

function isFree(card: WorldRect, occupied: readonly WorldRect[], area: WorldRect, gap: number): boolean {
  if (!isInside(card, area)) return false;
  const grown: WorldRect = {
    x: card.x - gap,
    y: card.y - gap,
    width: card.width + gap * 2,
    height: card.height + gap * 2,
  };
  return occupied.every((rect) => !intersects(grown, rect));
}

export function findFreeSpot(
  preferred: WorldRect,
  occupied: readonly WorldRect[],
  area: WorldRect,
  options?: { gap?: number; step?: number },
): { x: number; y: number } {
  const gap = options?.gap ?? DEFAULT_GAP;
  const step = options?.step !== undefined && options.step > 0 ? options.step : DEFAULT_STEP;

  if (isFree(preferred, occupied, area, gap)) {
    return { x: preferred.x, y: preferred.y };
  }

  const maxX = area.x + area.width - preferred.width;
  const maxY = area.y + area.height - preferred.height;
  if (maxX < area.x || maxY < area.y) {
    return { x: preferred.x, y: preferred.y };
  }

  let scanStep = step;
  let columns = Math.floor((maxX - area.x) / scanStep) + 1;
  let rows = Math.floor((maxY - area.y) / scanStep) + 1;
  while (columns * rows > MAX_CANDIDATES) {
    scanStep += step;
    columns = Math.floor((maxX - area.x) / scanStep) + 1;
    rows = Math.floor((maxY - area.y) / scanStep) + 1;
  }

  const preferredCx = preferred.x + preferred.width / 2;
  const preferredCy = preferred.y + preferred.height / 2;
  let best: { x: number; y: number; dist: number } | null = null;

  for (let row = 0; row < rows; row += 1) {
    const y = area.y + row * scanStep;
    for (let column = 0; column < columns; column += 1) {
      const x = area.x + column * scanStep;
      const candidate: WorldRect = { x, y, width: preferred.width, height: preferred.height };
      if (!isFree(candidate, occupied, area, gap)) continue;
      const dx = x + preferred.width / 2 - preferredCx;
      const dy = y + preferred.height / 2 - preferredCy;
      const dist = dx * dx + dy * dy;
      if (
        best === null ||
        dist < best.dist ||
        (dist === best.dist && (y < best.y || (y === best.y && x < best.x)))
      ) {
        best = { x, y, dist };
      }
    }
  }

  if (best === null) {
    return { x: preferred.x, y: preferred.y };
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}
