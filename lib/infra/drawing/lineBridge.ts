import type { CanvasLine } from "@/types/collabboard";
import { extractPadletIdFromEmbeddableLink } from "./importScene";

export const LINE_BRIDGE_ROLE_PRIORITY = [
  "point-handle",
  "midpoint-handle",
  "start-handle",
  "control-handle",
  "end-handle",
  "label-handle",
  "hit-path",
] as const;

export type LineBridgeViolationCode =
  | "line-missing-start-target"
  | "line-missing-end-target"
  | "line-target-missing-bound-element"
  | "line-target-duplicate-bound-element"
  | "line-binding-frame-mismatch"
  | "line-missing-padlet-target"
  | "line-hit-target-missing"
  | "line-hit-target-unsupported-role"
  | "line-order-plane-drift"
  | "line-geometry-nonfinite";

export type LineBridgeDiagnostic = {
  code: LineBridgeViolationCode;
  lineId: string | null;
  lineKind: string | null;
  startTargetId: string | null;
  endTargetId: string | null;
  startPadletId: string | null;
  endPadletId: string | null;
  frameId: string | null;
  layerPlane: string | null;
  zIndex: number | null;
  role: string | null;
  renderer: string | null;
  source: string;
  message: string;
};

type LineRole = typeof LINE_BRIDGE_ROLE_PRIORITY[number];

type StackNodeLike = {
  lineId?: string | null;
  lineRole?: string | null;
  lineRenderer?: string | null;
};

type BindingLike = {
  elementId?: string | null;
  focus?: number | null;
  gap?: number | null;
};

type SceneElementLike = {
  id?: string | null;
  type?: string | null;
  link?: unknown;
  frameId?: string | null;
  isDeleted?: boolean | null;
  boundElements?: Array<{ id?: string | null; type?: string | null }> | null;
  startBinding?: BindingLike | null;
  endBinding?: BindingLike | null;
  customData?: Record<string, unknown> | null;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const diagnostic = (
  code: LineBridgeViolationCode,
  overrides: Partial<LineBridgeDiagnostic>,
): LineBridgeDiagnostic => ({
  code,
  lineId: null,
  lineKind: null,
  startTargetId: null,
  endTargetId: null,
  startPadletId: null,
  endPadletId: null,
  frameId: null,
  layerPlane: null,
  zIndex: null,
  role: null,
  renderer: null,
  source: "line-bridge",
  message: code,
  ...overrides,
});

export function characterizeCanvasLineGeometry(lines: readonly CanvasLine[]) {
  return lines.map((line) => {
    const points = line.points && line.points.length > 0
      ? line.points.map((point) => ({ x: point.x, y: point.y, type: point.type }))
      : [
        { x: line.start_x, y: line.start_y, type: "legacy-start" },
        { x: line.control_x, y: line.control_y, type: "legacy-control" },
        { x: line.end_x, y: line.end_y, type: "legacy-end" },
      ];
    const values = points.flatMap((point) => [point.x, point.y]);
    return {
      lineId: line.id,
      lineKind: line.points && line.points.length > 0 ? "multi-point" : "legacy-bezier",
      startTargetId: line.start_post_id ?? null,
      endTargetId: line.end_post_id ?? null,
      layerPlane: line.layer_plane ?? "front",
      zIndex: line.z_index ?? 0,
      points,
      finite: values.every(isFiniteNumber),
    };
  });
}

export function characterizeCanvasLineOrdering(lines: readonly CanvasLine[], selectedLineId?: string | null) {
  const selectedLine = selectedLineId ? lines.find((line) => line.id === selectedLineId) : null;
  const selectedPlane = selectedLine?.layer_plane ?? null;
  return [...lines]
    .map((line, index) => ({
      lineId: line.id,
      sourceIndex: index,
      layerPlane: line.layer_plane ?? "front",
      zIndex: line.z_index ?? 0,
      selectedWithinPlane: Boolean(selectedLineId && line.id === selectedLineId && (line.layer_plane ?? "front") === selectedPlane),
    }))
    .sort((a, b) => {
      const planeDelta = (a.layerPlane === "back" ? 0 : 1) - (b.layerPlane === "back" ? 0 : 1);
      if (planeDelta !== 0) return planeDelta;
      if (a.layerPlane === selectedPlane && a.selectedWithinPlane !== b.selectedWithinPlane) {
        return a.selectedWithinPlane ? 1 : -1;
      }
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.sourceIndex - b.sourceIndex;
    });
}

export function characterizeBackLineHitTarget(stack: readonly StackNodeLike[]) {
  for (const role of LINE_BRIDGE_ROLE_PRIORITY) {
    const found = stack.find((node) => node.lineRenderer === "back" && node.lineRole === role);
    if (found) {
      return {
        lineId: found.lineId ?? null,
        role,
        renderer: found.lineRenderer ?? null,
        supported: true,
      };
    }
  }
  const unsupported = stack.find((node) => node.lineRenderer === "back" && node.lineRole);
  if (unsupported) {
    return {
      lineId: unsupported.lineId ?? null,
      role: unsupported.lineRole ?? null,
      renderer: unsupported.lineRenderer ?? null,
      supported: false,
    };
  }
  return null;
}

export function characterizeSceneArrowBindings(elements: readonly SceneElementLike[]) {
  const active = elements.filter((element) => !element.isDeleted && element.id);
  const byId = new Map(active.map((element) => [String(element.id), element]));
  return active
    .filter((element) => element.type === "arrow" || element.type === "line")
    .map((line) => {
      const startTargetId = line.startBinding?.elementId ?? null;
      const endTargetId = line.endBinding?.elementId ?? null;
      const startTarget = startTargetId ? byId.get(startTargetId) ?? null : null;
      const endTarget = endTargetId ? byId.get(endTargetId) ?? null : null;
      return {
        lineId: String(line.id),
        lineKind: line.type ?? null,
        startTargetId,
        endTargetId,
        startPadletId: extractPadletIdFromEmbeddableLink(startTarget?.link) ?? null,
        endPadletId: extractPadletIdFromEmbeddableLink(endTarget?.link) ?? null,
        frameId: line.frameId ?? null,
        startTargetFrameId: startTarget?.frameId ?? null,
        endTargetFrameId: endTarget?.frameId ?? null,
        startBinding: line.startBinding ?? null,
        endBinding: line.endBinding ?? null,
        startTargetBoundElements: startTarget?.boundElements ?? null,
        endTargetBoundElements: endTarget?.boundElements ?? null,
        customData: line.customData ?? null,
      };
    });
}

export function validateLineBridgeSnapshot(snapshot: {
  lines?: readonly CanvasLine[];
  sceneElements?: readonly SceneElementLike[];
  hitStack?: readonly StackNodeLike[];
}) {
  const diagnostics: LineBridgeDiagnostic[] = [];
  const geometries = characterizeCanvasLineGeometry(snapshot.lines ?? []);
  for (const geometry of geometries) {
    if (!geometry.finite) {
      diagnostics.push(diagnostic("line-geometry-nonfinite", {
        lineId: geometry.lineId,
        layerPlane: geometry.layerPlane,
        zIndex: geometry.zIndex,
      }));
    }
    if (geometry.layerPlane !== "back" && geometry.layerPlane !== "front") {
      diagnostics.push(diagnostic("line-order-plane-drift", {
        lineId: geometry.lineId,
        layerPlane: geometry.layerPlane,
        zIndex: geometry.zIndex,
      }));
    }
  }

  for (const binding of characterizeSceneArrowBindings(snapshot.sceneElements ?? [])) {
    const base = {
      lineId: binding.lineId,
      lineKind: binding.lineKind,
      startTargetId: binding.startTargetId,
      endTargetId: binding.endTargetId,
      startPadletId: binding.startPadletId,
      endPadletId: binding.endPadletId,
      frameId: binding.frameId,
    };
    if (binding.startBinding && !binding.startTargetId) {
      diagnostics.push(diagnostic("line-missing-start-target", base));
    }
    if (binding.endBinding && !binding.endTargetId) {
      diagnostics.push(diagnostic("line-missing-end-target", base));
    }
    for (const [side, targetId, boundElements] of [
      ["start", binding.startTargetId, binding.startTargetBoundElements],
      ["end", binding.endTargetId, binding.endTargetBoundElements],
    ] as const) {
      if (!targetId) continue;
      const matches = (boundElements ?? []).filter((entry) => entry.id === binding.lineId);
      if (matches.length === 0) {
        diagnostics.push(diagnostic("line-target-missing-bound-element", {
          ...base,
          source: `scene-binding:${side}`,
        }));
      }
      if (matches.length > 1) {
        diagnostics.push(diagnostic("line-target-duplicate-bound-element", {
          ...base,
          source: `scene-binding:${side}`,
        }));
      }
    }
    if ((binding.startTargetId && !binding.startPadletId) || (binding.endTargetId && !binding.endPadletId)) {
      diagnostics.push(diagnostic("line-missing-padlet-target", base));
    }
    const mismatchedTargetFrame = [binding.startTargetFrameId, binding.endTargetFrameId]
      .some((targetFrameId) => binding.frameId && targetFrameId && targetFrameId !== binding.frameId);
    if (mismatchedTargetFrame) {
      diagnostics.push(diagnostic("line-binding-frame-mismatch", base));
    }
  }

  const hitTarget = characterizeBackLineHitTarget(snapshot.hitStack ?? []);
  if (!hitTarget) {
    diagnostics.push(diagnostic("line-hit-target-missing", { source: "hit-target" }));
  } else if (!hitTarget.supported) {
    diagnostics.push(diagnostic("line-hit-target-unsupported-role", {
      lineId: hitTarget.lineId,
      role: hitTarget.role,
      renderer: hitTarget.renderer,
      source: "hit-target",
    }));
  }
  return diagnostics;
}

export function summarizeLineBridgeSnapshot(snapshot: Parameters<typeof validateLineBridgeSnapshot>[0]) {
  const diagnostics = validateLineBridgeSnapshot(snapshot);
  return {
    canvasLineCount: snapshot.lines?.length ?? 0,
    sceneLineCount: characterizeSceneArrowBindings(snapshot.sceneElements ?? []).length,
    diagnosticCount: diagnostics.length,
    violationCodes: diagnostics.map((row) => row.code),
    diagnostics,
  };
}
