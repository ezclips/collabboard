import React from "react";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import type { CanvasLine } from "@/types/collabboard";

export type CanvasLinePrimitivePoint = { x: number; y: number };
export type CanvasLinePrimitiveCommand =
  | { kind: "move"; x: number; y: number }
  | { kind: "line"; x: number; y: number }
  | { kind: "quadratic"; cx: number; cy: number; x: number; y: number }
  | { kind: "cubic"; cx1: number; cy1: number; cx2: number; cy2: number; x: number; y: number };

export type CanvasLineRenderPayload = {
  id: string;
  key: string;
  pathData: string;
  commands: CanvasLinePrimitiveCommand[];
  strokeColor: string;
  strokeWidth: number;
  dashed: boolean;
  startArrow: CanvasLinePrimitivePoint[] | null;
  endArrow: CanvasLinePrimitivePoint[] | null;
  label: {
    text: string;
    position: number;
    x: number;
    y: number;
    textColor: string;
    backgroundColor: string;
  } | null;
  layerPlane: "back" | "front";
  zIndex: number;
};

const ARROW_LENGTH = 10;
const ARROW_HALF_WIDTH = 5;

function projectPoint(point: CanvasLinePrimitivePoint, slide: FrameSlide): CanvasLinePrimitivePoint {
  return { x: point.x - slide.x, y: point.y - slide.y };
}

function getCurvePath(points: Array<{ x: number; y: number; type?: "corner" | "smooth" }>, tension = 0.5) {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;
    path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return path;
}

function getCurveCommands(points: CanvasLinePrimitivePoint[], tension = 0.5): CanvasLinePrimitiveCommand[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    return [{ kind: "move", ...points[0] }, { kind: "line", ...points[1] }];
  }

  const commands: CanvasLinePrimitiveCommand[] = [{ kind: "move", ...points[0] }];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    commands.push({
      kind: "cubic",
      cx1: p1.x + ((p2.x - p0.x) * tension) / 6,
      cy1: p1.y + ((p2.y - p0.y) * tension) / 6,
      cx2: p2.x - ((p3.x - p1.x) * tension) / 6,
      cy2: p2.y - ((p3.y - p1.y) * tension) / 6,
      x: p2.x,
      y: p2.y,
    });
  }
  return commands;
}

function getPointOnQuadratic(start: CanvasLinePrimitivePoint, control: CanvasLinePrimitivePoint, end: CanvasLinePrimitivePoint, t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  const x = ((1 - clamped) ** 2) * start.x + 2 * (1 - clamped) * clamped * control.x + (clamped ** 2) * end.x;
  const y = ((1 - clamped) ** 2) * start.y + 2 * (1 - clamped) * clamped * control.y + (clamped ** 2) * end.y;
  return { x, y };
}

function getPointOnPath(points: CanvasLinePrimitivePoint[], control: CanvasLinePrimitivePoint | null, t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  if (points.length >= 2) {
    const segments = points.length - 1;
    const segmentIndex = Math.min(Math.floor(clamped * segments), segments - 1);
    const segmentT = clamped * segments - segmentIndex;
    const p1 = points[segmentIndex];
    const p2 = points[segmentIndex + 1];
    return { x: p1.x + (p2.x - p1.x) * segmentT, y: p1.y + (p2.y - p1.y) * segmentT };
  }
  if (points.length === 1 && control) return points[0];
  return { x: 0, y: 0 };
}

function arrowPolygon(tip: CanvasLinePrimitivePoint, adjacent: CanvasLinePrimitivePoint): CanvasLinePrimitivePoint[] | null {
  const dx = tip.x - adjacent.x;
  const dy = tip.y - adjacent.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  return [
    tip,
    { x: tip.x - ux * ARROW_LENGTH + px * ARROW_HALF_WIDTH, y: tip.y - uy * ARROW_LENGTH + py * ARROW_HALF_WIDTH },
    { x: tip.x - ux * (ARROW_LENGTH * 0.7), y: tip.y - uy * (ARROW_LENGTH * 0.7) },
    { x: tip.x - ux * ARROW_LENGTH - px * ARROW_HALF_WIDTH, y: tip.y - uy * ARROW_LENGTH - py * ARROW_HALF_WIDTH },
  ];
}

export function buildCanvasLineRenderPayload(line: CanvasLine, slide: FrameSlide): CanvasLineRenderPayload | null {
  const projectedPoints = Array.isArray(line.points) && line.points.length > 0
    ? line.points.map((point) => projectPoint(point, slide))
    : [
      projectPoint({ x: line.start_x, y: line.start_y }, slide),
      projectPoint({ x: line.end_x, y: line.end_y }, slide),
    ];

  if (projectedPoints.length < 2) return null;

  const projectedControl = projectPoint({ x: line.control_x, y: line.control_y }, slide);
  const hasMultiPointPath = Array.isArray(line.points) && line.points.length > 0;
  const commands = hasMultiPointPath
    ? getCurveCommands(projectedPoints)
    : [
      { kind: "move", ...projectedPoints[0] } satisfies CanvasLinePrimitiveCommand,
      { kind: "quadratic", cx: projectedControl.x, cy: projectedControl.y, ...projectedPoints[1] } satisfies CanvasLinePrimitiveCommand,
    ];
  const pathData = hasMultiPointPath
    ? getCurvePath(projectedPoints)
    : `M ${projectedPoints[0].x} ${projectedPoints[0].y} Q ${projectedControl.x} ${projectedControl.y} ${projectedPoints[1].x} ${projectedPoints[1].y}`;
  const labelAnchor = hasMultiPointPath
    ? getPointOnPath(projectedPoints, null, line.label_position ?? 0.5)
    : getPointOnQuadratic(projectedPoints[0], projectedControl, projectedPoints[1], line.label_position ?? 0.5);

  return {
    id: line.id,
    key: `canvas-line-${line.id}`,
    pathData,
    commands,
    strokeColor: line.color || "#374151",
    strokeWidth: line.stroke_width || 2,
    dashed: Boolean(line.dashed),
    startArrow: line.start_arrow ? arrowPolygon(projectedPoints[0], projectedPoints[1]) : null,
    endArrow: line.end_arrow ? arrowPolygon(projectedPoints[projectedPoints.length - 1], projectedPoints[projectedPoints.length - 2]) : null,
    label: line.label
      ? {
        text: line.label,
        position: line.label_position ?? 0.5,
        x: labelAnchor.x,
        y: labelAnchor.y,
        textColor: line.label_text_color || "#374151",
        backgroundColor: line.label_background_color || "white",
      }
      : null,
    layerPlane: line.layer_plane === "back" ? "back" : "front",
    zIndex: line.z_index ?? 0,
  };
}

export function renderCanvasLinePayloadsSvg({
  payloads,
  width,
  height,
}: {
  payloads: readonly CanvasLineRenderPayload[];
  width: number;
  height: number;
}) {
  if (payloads.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
      aria-hidden="true"
      data-canvas-line-slide-layer="true"
    >
      {payloads.map((payload) => (
        <g key={payload.key} data-canvas-line-id={payload.id}>
          <path
            d={payload.pathData}
            fill="none"
            stroke={payload.strokeColor}
            strokeWidth={payload.strokeWidth}
            strokeDasharray={payload.dashed ? "5,5" : "none"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {payload.startArrow && <polygon points={payload.startArrow.map((p) => `${p.x},${p.y}`).join(" ")} fill={payload.strokeColor} />}
          {payload.endArrow && <polygon points={payload.endArrow.map((p) => `${p.x},${p.y}`).join(" ")} fill={payload.strokeColor} />}
          {payload.label && (
            <foreignObject x={payload.label.x - 100} y={payload.label.y - 50} width={200} height={100} style={{ overflow: "visible" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                <div
                  style={{
                    backgroundColor: payload.label.backgroundColor,
                    color: payload.label.textColor,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    lineHeight: "1.4",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    border: "1px solid #e5e7eb",
                    userSelect: "none",
                    whiteSpace: "pre-wrap",
                    textAlign: "center",
                    minWidth: "20px",
                    maxWidth: "180px",
                  }}
                >
                  {payload.label.text}
                </div>
              </div>
            </foreignObject>
          )}
        </g>
      ))}
    </svg>
  );
}

export function drawCanvasLinePayloadsToCanvas({
  payloads,
  width,
  height,
  scale,
  padding,
}: {
  payloads: readonly CanvasLineRenderPayload[];
  width: number;
  height: number;
  scale: number;
  padding: number;
}): HTMLCanvasElement | null {
  if (payloads.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(padding, padding, Math.max(0, width - padding * 2), Math.max(0, height - padding * 2));
  ctx.clip();
  ctx.translate(padding, padding);
  ctx.scale(scale, scale);

  for (const payload of payloads) {
    const path = new Path2D(payload.pathData);
    ctx.save();
    ctx.strokeStyle = payload.strokeColor;
    ctx.lineWidth = payload.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(payload.dashed ? [5, 5] : []);
    ctx.stroke(path);
    ctx.fillStyle = payload.strokeColor;
    for (const arrow of [payload.startArrow, payload.endArrow]) {
      if (!arrow) continue;
      ctx.beginPath();
      arrow.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();
    }
    if (payload.label) {
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const metrics = ctx.measureText(payload.label.text);
      const boxWidth = Math.min(180, Math.max(20, metrics.width + 16));
      const boxHeight = 24;
      const x = payload.label.x - boxWidth / 2;
      const y = payload.label.y - boxHeight / 2;
      ctx.fillStyle = payload.label.backgroundColor;
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = payload.label.textColor;
      ctx.fillText(payload.label.text, payload.label.x, payload.label.y);
    }
    ctx.restore();
  }

  ctx.restore();
  return canvas;
}
