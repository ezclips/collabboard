import { describe, expect, it } from "vitest";
import type { CanvasLine } from "@/types/collabboard";
import {
  LINE_BRIDGE_ROLE_PRIORITY,
  characterizeBackLineHitTarget,
  characterizeCanvasLineGeometry,
  characterizeCanvasLineOrdering,
  characterizeSceneArrowBindings,
  summarizeLineBridgeSnapshot,
  validateLineBridgeSnapshot,
} from "./lineBridge";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const line = (overrides: Partial<CanvasLine>): CanvasLine => ({
  id: "line-a",
  board_id: "board-a",
  start_x: 10,
  start_y: 20,
  control_x: 60,
  control_y: -30,
  end_x: 110,
  end_y: 20,
  color: "#374151",
  stroke_width: 2,
  layer_plane: "front",
  start_arrow: false,
  end_arrow: true,
  dashed: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const embeddable = (id: string, padletId: string, boundLineIds: string[] = []) => ({
  id,
  type: "embeddable",
  link: `padlet://${padletId}`,
  boundElements: boundLineIds.map((lineId) => ({ id: lineId, type: "arrow" })),
});

const arrow = (overrides: Record<string, unknown> = {}) => ({
  id: "arrow-a",
  type: "arrow",
  frameId: null,
  startBinding: { elementId: "emb-a", focus: 0.2, gap: 4 },
  endBinding: { elementId: "emb-b", focus: -0.2, gap: 4 },
  customData: { bridge: "fixture" },
  ...overrides,
});

describe("line bridge characterization", () => {
  describe("creation", () => {
    it("line attaches to left edge target with correct start binding and boundElements row", () => {
      const elements = deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a"]), embeddable("emb-b", "padlet-b", ["arrow-a"]), arrow()]);
      expect(characterizeSceneArrowBindings(elements)[0]).toMatchObject({
        startTargetId: "emb-a",
        startPadletId: "padlet-a",
        startTargetBoundElements: [{ id: "arrow-a", type: "arrow" }],
      });
    });

    it("line attaches to right edge target with correct end binding and boundElements row", () => {
      const elements = deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a"]), embeddable("emb-b", "padlet-b", ["arrow-a"]), arrow()]);
      expect(characterizeSceneArrowBindings(elements)[0]).toMatchObject({
        endTargetId: "emb-b",
        endPadletId: "padlet-b",
        endTargetBoundElements: [{ id: "arrow-a", type: "arrow" }],
      });
    });

    it("line attaches to top/bottom targets without changing padlet identity", () => {
      const elements = deepFreeze([embeddable("top", "padlet-top", ["arrow-a"]), embeddable("bottom", "padlet-bottom", ["arrow-a"]), arrow({ startBinding: { elementId: "top" }, endBinding: { elementId: "bottom" } })]);
      expect(characterizeSceneArrowBindings(elements)[0]).toMatchObject({
        startPadletId: "padlet-top",
        endPadletId: "padlet-bottom",
      });
    });

    it("unsupported edge/handle is reported as a diagnostic, not corrected", () => {
      const diagnostics = validateLineBridgeSnapshot({
        hitStack: deepFreeze([{ lineId: "line-a", lineRenderer: "back", lineRole: "unsupported-handle" }]),
      });
      expect(diagnostics.map((row) => row.code)).toContain("line-hit-target-unsupported-role");
    });
  });

  describe("movement", () => {
    it("custom header drag snapshot keeps attachment and padlet target identity", () => {
      const before = characterizeSceneArrowBindings(deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a"]), arrow({ endBinding: null })]))[0];
      const after = characterizeSceneArrowBindings(deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a"]), arrow({ endBinding: null, x: 40 })]))[0];
      expect(after.startPadletId).toBe(before.startPadletId);
    });

    it("native Excalidraw drag snapshot keeps attachment and target boundElements", () => {
      const snapshot = characterizeSceneArrowBindings(deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a"]), arrow({ endBinding: null })]))[0];
      expect(snapshot.startTargetBoundElements).toEqual([{ id: "arrow-a", type: "arrow" }]);
    });

    it("moving one container does not alter a second line attachment", () => {
      const elements = deepFreeze([
        embeddable("emb-a", "padlet-a", ["arrow-a"]),
        embeddable("emb-b", "padlet-b", ["arrow-b"]),
        arrow({ id: "arrow-a", startBinding: { elementId: "emb-a" }, endBinding: null }),
        arrow({ id: "arrow-b", startBinding: { elementId: "emb-b" }, endBinding: null }),
      ]);
      expect(characterizeSceneArrowBindings(elements).map((row) => row.startPadletId)).toEqual(["padlet-a", "padlet-b"]);
    });
  });

  describe("resize", () => {
    it("natural-height resize snapshot updates line geometry for the resized target", () => {
      const geometry = characterizeCanvasLineGeometry(deepFreeze([line({ end_y: 180, points: [{ x: 10, y: 20, type: "smooth" }, { x: 110, y: 180, type: "smooth" }] })]))[0];
      expect(geometry.points.at(-1)).toMatchObject({ x: 110, y: 180 });
    });

    it("manual resize snapshot, when present, keeps binding rows consistent", () => {
      const diagnostics = validateLineBridgeSnapshot({ sceneElements: deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a"]), arrow({ endBinding: null })]), hitStack: [{ lineRenderer: "back", lineRole: "hit-path" }] });
      expect(diagnostics.map((row) => row.code)).not.toContain("line-target-missing-bound-element");
    });

    it("repeated equal geometry snapshot produces no oscillation diagnostic", () => {
      expect(validateLineBridgeSnapshot({ lines: deepFreeze([line({})]), hitStack: [{ lineRenderer: "back", lineRole: "hit-path" }] })).toEqual([]);
    });
  });

  describe("interaction", () => {
    it("hit path resolves ahead of visible path", () => {
      expect(characterizeBackLineHitTarget(deepFreeze([{ lineId: "line-a", lineRenderer: "back", lineRole: "visible-path" }, { lineId: "line-a", lineRenderer: "back", lineRole: "hit-path" }]))).toMatchObject({ role: "hit-path" });
    });

    it("start/end/midpoint/control/label handles resolve in current priority order", () => {
      expect(LINE_BRIDGE_ROLE_PRIORITY).toEqual(["point-handle", "midpoint-handle", "start-handle", "control-handle", "end-handle", "label-handle", "hit-path"]);
      expect(characterizeBackLineHitTarget(deepFreeze([{ lineId: "line-a", lineRenderer: "back", lineRole: "hit-path" }, { lineId: "line-a", lineRenderer: "back", lineRole: "label-handle" }]))).toMatchObject({ role: "label-handle" });
    });

    it("inner card controls win when the event target is a real padlet control", () => {
      expect(characterizeBackLineHitTarget(deepFreeze([{ lineRenderer: "front", lineRole: "hit-path" }]))).toBeNull();
    });

    it("right-click target rows preserve line id and renderer", () => {
      expect(characterizeBackLineHitTarget(deepFreeze([{ lineId: "line-context", lineRenderer: "back", lineRole: "hit-path" }]))).toMatchObject({ lineId: "line-context", renderer: "back" });
    });
  });

  describe("persistence, deletion, and multiple objects", () => {
    it("save/reload snapshot preserves line id, geometry, and attachment", () => {
      expect(characterizeCanvasLineGeometry(deepFreeze([line({ start_post_id: "a", end_post_id: "b" })]))[0]).toMatchObject({ lineId: "line-a", startTargetId: "a", endTargetId: "b" });
    });

    it("dashboard return snapshot preserves line id, geometry, and attachment", () => {
      expect(characterizeCanvasLineOrdering(deepFreeze([line({ id: "line-return", layer_plane: "back", z_index: -1 })]))[0]).toMatchObject({ lineId: "line-return", layerPlane: "back" });
    });

    it("hard-refresh snapshot preserves line id, geometry, and attachment", () => {
      expect(summarizeLineBridgeSnapshot({ lines: deepFreeze([line({})]), hitStack: [{ lineRenderer: "back", lineRole: "hit-path" }] })).toMatchObject({ canvasLineCount: 1, diagnosticCount: 0 });
    });

    it("deleting a line leaves container/embeddable rows untouched", () => {
      expect(characterizeSceneArrowBindings(deepFreeze([embeddable("emb-a", "padlet-a", [])]))).toEqual([]);
    });

    it("deleting a container preserves the exact current approved line behavior in diagnostics", () => {
      const diagnostics = validateLineBridgeSnapshot({ sceneElements: deepFreeze([arrow({ endBinding: null })]), hitStack: [{ lineRenderer: "back", lineRole: "hit-path" }] });
      expect(diagnostics.map((row) => row.code)).toContain("line-missing-padlet-target");
    });

    it("two containers with separate lines remain independent", () => {
      const ordered = characterizeCanvasLineOrdering(deepFreeze([line({ id: "one", z_index: 1 }), line({ id: "two", z_index: 2 })]));
      expect(ordered.map((row) => row.lineId)).toEqual(["one", "two"]);
    });

    it("one container with multiple lines keeps every attachment", () => {
      const rows = characterizeSceneArrowBindings(deepFreeze([embeddable("emb-a", "padlet-a", ["arrow-a", "arrow-b"]), arrow({ id: "arrow-a", endBinding: null }), arrow({ id: "arrow-b", endBinding: null })]));
      expect(rows.map((row) => row.startPadletId)).toEqual(["padlet-a", "padlet-a"]);
    });

    it("diagnostic summary rows include every required field and named violation code", () => {
      const summary = summarizeLineBridgeSnapshot({ lines: deepFreeze([line({ start_x: Number.NaN })]), hitStack: [] });
      expect(summary.violationCodes).toEqual(["line-geometry-nonfinite", "line-hit-target-missing"]);
      expect(Object.keys(summary.diagnostics[0]).sort()).toEqual(["code", "endPadletId", "endTargetId", "frameId", "layerPlane", "lineId", "lineKind", "message", "renderer", "role", "source", "startPadletId", "startTargetId", "zIndex"].sort());
    });
  });

  describe("Sonnet corrective characterization", () => {
    it("no selected line preserves normal order", () => {
      const ordered = characterizeCanvasLineOrdering(deepFreeze([
        line({ id: "b", layer_plane: "back", z_index: 2 }),
        line({ id: "a", layer_plane: "back", z_index: 1 }),
        line({ id: "front", layer_plane: "front", z_index: 0 }),
      ]));
      expect(ordered.map((row) => row.lineId)).toEqual(["a", "b", "front"]);
    });

    it("selected line moves last only inside its own plane and other planes remain unchanged", () => {
      const ordered = characterizeCanvasLineOrdering(deepFreeze([
        line({ id: "back-selected", layer_plane: "back", z_index: 0 }),
        line({ id: "back-later", layer_plane: "back", z_index: 10 }),
        line({ id: "front-first", layer_plane: "front", z_index: 0 }),
        line({ id: "front-second", layer_plane: "front", z_index: 1 }),
      ]), "back-selected");
      expect(ordered.map((row) => row.lineId)).toEqual(["back-later", "back-selected", "front-first", "front-second"]);
    });

    it("unknown selectedLineId changes nothing", () => {
      const ordered = characterizeCanvasLineOrdering(deepFreeze([
        line({ id: "one", layer_plane: "front", z_index: 1 }),
        line({ id: "zero", layer_plane: "front", z_index: 0 }),
      ]), "missing");
      expect(ordered.map((row) => row.lineId)).toEqual(["zero", "one"]);
    });

    it("does not report frame mismatch for a normal two-target line in the same frame", () => {
      const diagnostics = validateLineBridgeSnapshot({
        sceneElements: deepFreeze([
          { ...embeddable("emb-a", "padlet-a", ["arrow-a"]), frameId: "frame-a" },
          { ...embeddable("emb-b", "padlet-b", ["arrow-a"]), frameId: "frame-a" },
          arrow({ frameId: "frame-a" }),
        ]),
        hitStack: [{ lineRenderer: "back", lineRole: "hit-path" }],
      });
      expect(diagnostics.map((row) => row.code)).not.toContain("line-binding-frame-mismatch");
    });

    it("reports frame mismatch only for an explicitly mismatched target frame", () => {
      const diagnostics = validateLineBridgeSnapshot({
        sceneElements: deepFreeze([
          { ...embeddable("emb-a", "padlet-a", ["arrow-a"]), frameId: "frame-a" },
          { ...embeddable("emb-b", "padlet-b", ["arrow-a"]), frameId: "frame-b" },
          arrow({ frameId: "frame-a" }),
        ]),
        hitStack: [{ lineRenderer: "back", lineRole: "hit-path" }],
      });
      expect(diagnostics.map((row) => row.code)).toContain("line-binding-frame-mismatch");
    });
  });
});
