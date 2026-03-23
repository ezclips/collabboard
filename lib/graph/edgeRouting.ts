/**
 * Freeform graph edge routing — pure center-to-center geometry.
 *
 * Every arrow goes from the center of the source card to the center of the
 * target card. The visible line starts/ends exactly `gap` pixels outside
 * each card's border, measured along the center-to-center ray.
 *
 * No external library — just a ray-rect intersection + offset.
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

export type GraphSide = 'left' | 'right' | 'top' | 'bottom';

export interface RouteEdgeOptions {
    gap?: number;
    sourceSide?: GraphSide;
    targetSide?: GraphSide;
    sourceSlotIndex?: number;
    sourceSlotCount?: number;
    targetSlotIndex?: number;
    targetSlotCount?: number;
}

export interface RouteEdgeResult {
    sx: number;
    sy: number;
    cx: number;
    cy: number;
    ex: number;
    ey: number;
    endAngle: number;
    startAngle: number;
    pathD: string;
    path: Point[];
    attachSourceOpts: Point;
    attachTargetOpts: Point;
    sourceSide: GraphSide;
    targetSide: GraphSide;
    /** True when cards are too close — the edge should not be rendered. */
    hidden: boolean;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Infer which side of the rect a point is closest to. */
function inferSide(rect: Rect, px: number, py: number): GraphSide {
    const distLeft = Math.abs(px - rect.x);
    const distRight = Math.abs(px - (rect.x + rect.width));
    const distTop = Math.abs(py - rect.y);
    const distBottom = Math.abs(py - (rect.y + rect.height));
    const min = Math.min(distLeft, distRight, distTop, distBottom);
    if (min === distLeft) return 'left';
    if (min === distRight) return 'right';
    if (min === distTop) return 'top';
    return 'bottom';
}

/**
 * Where a ray from the center of `rect` toward `target` exits the rectangle.
 * Returns the border point and the distance from center to that point.
 */
function rayExitFromCenter(rect: Rect, target: Point): { point: Point; dist: number } {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const dx = target.x - cx;
    const dy = target.y - cy;

    // Degenerate — same position
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return { point: { x: cx + rect.width / 2, y: cy }, dist: rect.width / 2 };
    }

    const hw = rect.width / 2;
    const hh = rect.height / 2;

    // Parametric ray P(t) = center + t * dir.  Find smallest t that hits an edge.
    let t = Infinity;
    if (Math.abs(dx) > 1e-9) t = Math.min(t, hw / Math.abs(dx));
    if (Math.abs(dy) > 1e-9) t = Math.min(t, hh / Math.abs(dy));

    const bx = cx + dx * t;
    const by = cy + dy * t;
    return { point: { x: bx, y: by }, dist: Math.hypot(bx - cx, by - cy) };
}

// ---------------------------------------------------------------------------
// SVG path builder (backward compat)
// ---------------------------------------------------------------------------

export function buildSteppedPathD(points: Point[], _radius = 10): string {
    if (points.length < 2) return '';
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

// ---------------------------------------------------------------------------
// Main routing function
// ---------------------------------------------------------------------------

export function routeEdge(
    source: Rect,
    target: Rect,
    optsOrPadding: RouteEdgeOptions | number = 20
): RouteEdgeResult {
    const options: RouteEdgeOptions =
        typeof optsOrPadding === 'number' ? { gap: optsOrPadding } : optsOrPadding;
    const gap = Math.max(6, options.gap ?? 24);

    // ── Centers ──────────────────────────────────────────────────────────
    const srcCx = source.x + source.width / 2;
    const srcCy = source.y + source.height / 2;
    const tgtCx = target.x + target.width / 2;
    const tgtCy = target.y + target.height / 2;

    const dx = tgtCx - srcCx;
    const dy = tgtCy - srcCy;
    const dist = Math.hypot(dx, dy);

    // Degenerate — overlapping centers
    if (dist < 1) {
        const fallback: RouteEdgeResult = {
            sx: srcCx, sy: srcCy, cx: srcCx, cy: srcCy, ex: tgtCx, ey: tgtCy,
            endAngle: 0, startAngle: 0,
            pathD: `M ${srcCx},${srcCy} L ${tgtCx},${tgtCy}`,
            path: [{ x: srcCx, y: srcCy }, { x: srcCx, y: srcCy }, { x: tgtCx, y: tgtCy }, { x: tgtCx, y: tgtCy }],
            attachSourceOpts: { x: srcCx, y: srcCy },
            attachTargetOpts: { x: tgtCx, y: tgtCy },
            sourceSide: 'right', targetSide: 'left', hidden: true,
        };
        return fallback;
    }

    // Normalised direction from source center → target center
    const ndx = dx / dist;
    const ndy = dy / dist;

    // ── Ray-exit: where the center-to-center ray leaves each card ────────
    const srcExit = rayExitFromCenter(source, { x: tgtCx, y: tgtCy });
    const tgtExit = rayExitFromCenter(target, { x: srcCx, y: srcCy });

    // ── Smart gap clamping ───────────────────────────────────────────────
    // The minimum offset to just reach each card's border (no gap).
    const minStart = srcExit.dist;
    const minEnd = tgtExit.dist;
    const borderTotal = minStart + minEnd;

    // Available space between the two card borders
    const availableGap = dist - borderTotal;

    // Clamp gap so arrow always renders even when cards are close together.
    // Use whatever space is available (minimum 0), never hide the arrow.
    const effectiveGap = availableGap > 0 ? Math.min(gap, availableGap / 2) : 0;

    const startOffset = minStart + effectiveGap;
    const endOffset = minEnd + effectiveGap;

    const sx = srcCx + ndx * startOffset;
    const sy = srcCy + ndy * startOffset;
    const ex = tgtCx - ndx * endOffset;
    const ey = tgtCy - ndy * endOffset;

    // ── Angle (same for both ends — straight line) ───────────────────────
    const angle = Math.atan2(dy, dx);

    // Control point at midpoint (straight line — Bézier degenerates to line)
    const cx = (sx + ex) / 2;
    const cy = (sy + ey) / 2;

    const pathD = `M ${sx},${sy} L ${ex},${ey}`;

    const sourceSide = inferSide(source, srcExit.point.x, srcExit.point.y);
    const targetSide = inferSide(target, tgtExit.point.x, tgtExit.point.y);

    const path: Point[] = [
        { x: sx, y: sy },
        { x: sx, y: sy },
        { x: ex, y: ey },
        { x: ex, y: ey },
    ];

    return {
        sx, sy, cx, cy, ex, ey,
        endAngle: angle,
        startAngle: angle,
        pathD,
        path,
        attachSourceOpts: { x: sx, y: sy },
        attachTargetOpts: { x: ex, y: ey },
        sourceSide,
        targetSide,
        hidden: false,
    };
}
