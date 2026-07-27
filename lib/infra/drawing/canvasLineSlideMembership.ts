import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import { resolveFrameMembership } from "@/lib/infra/drawing/frameMembership";
import type { CanvasLine } from "@/types/collabboard";

export type CanvasLineSlideMembershipDiagnostic = {
  code: "canvas-line-preview-legacy-coord-space-excluded";
  lineId: string;
  reason: string;
};

export type CanvasLineBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasLineSlideMembership = {
  line: CanvasLine;
  bounds: CanvasLineBounds;
  frameId: string | null;
  viaFallback: boolean;
  sourceIndex: number;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getCanvasLineSceneBounds(line: CanvasLine): CanvasLineBounds {
  const points = Array.isArray(line.points) && line.points.length > 0
    ? line.points
    : [
      { x: line.start_x, y: line.start_y },
      { x: line.control_x, y: line.control_y },
      { x: line.end_x, y: line.end_y },
    ];

  const finitePoints = points.filter((point) => finiteNumber(point.x) && finiteNumber(point.y));
  if (finitePoints.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = finitePoints[0].x;
  let minY = finitePoints[0].y;
  let maxX = minX;
  let maxY = minY;
  for (const point of finitePoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function resolveCanvasLineSlideMemberships(
  canvasLines: readonly CanvasLine[],
  frames: readonly FrameSlide[],
  onDiagnostic?: (diagnostic: CanvasLineSlideMembershipDiagnostic) => void,
): CanvasLineSlideMembership[] {
  return canvasLines
    .map((line, sourceIndex) => {
      if (line.coord_space !== "scene") {
        onDiagnostic?.({
          code: "canvas-line-preview-legacy-coord-space-excluded",
          lineId: line.id,
          reason: "CanvasLine preview requires coord_space='scene'; legacy/null rows remain editor-only until user-converted.",
        });
        return null;
      }

      const bounds = getCanvasLineSceneBounds(line);
      const membership = resolveFrameMembership(
        {
          frameId: null,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        frames,
      );

      return {
        line,
        bounds,
        frameId: membership.frameId,
        viaFallback: membership.viaFallback,
        sourceIndex,
      };
    })
    .filter((entry): entry is CanvasLineSlideMembership => entry !== null);
}
