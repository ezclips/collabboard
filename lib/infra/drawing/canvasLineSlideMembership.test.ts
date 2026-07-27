import { describe, expect, it, vi } from "vitest";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import type { CanvasLine } from "@/types/collabboard";
import { getSlideRenderSignature } from "@/components/presentation/slide-renderer/getSlideRenderSignature";
import { planSlideComposition } from "@/components/presentation/slide-renderer/planSlideComposition";
import { buildCanvasLineRenderPayload } from "@/components/presentation/slide-renderer/renderCanvasLinePrimitive";
import { getCanvasLineSceneBounds, resolveCanvasLineSlideMemberships } from "./canvasLineSlideMembership";

const frame = (id: string, x = 0): FrameSlide => ({
  id,
  name: id,
  x,
  y: 0,
  width: 100,
  height: 100,
});

describe("CanvasLine presentation primitive", () => {
  const slide: FrameSlide = { id: "frame-a", x: 100, y: 200, width: 400, height: 300 };
  const frameElement = { id: "frame-a", type: "frame", x: 100, y: 200, width: 400, height: 300 };

  const slideLine = (overrides: Partial<CanvasLine> = {}): CanvasLine => line({
    start_x: 140,
    start_y: 250,
    control_x: 220,
    control_y: 280,
    end_x: 360,
    end_y: 330,
    points: [
      { x: 140, y: 250, type: "smooth" },
      { x: 220, y: 280, type: "smooth" },
      { x: 360, y: 330, type: "smooth" },
    ],
    color: "#dc2626",
    stroke_width: 4,
    layer_plane: "front",
    z_index: 7,
    start_arrow: true,
    end_arrow: true,
    dashed: true,
    label: "Slide 4 Arrow Post",
    label_position: 0.25,
    label_text_color: "#f8fafc",
    label_background_color: "#111827",
    ...overrides,
  });

  it("projects scene-space geometry to slide-local coordinates independent of viewport state", () => {
    const payload = buildCanvasLineRenderPayload(slideLine(), slide);
    expect(payload).toMatchObject({
      id: "line-a",
      strokeColor: "#dc2626",
      strokeWidth: 4,
      dashed: true,
      layerPlane: "front",
      zIndex: 7,
      label: {
        text: "Slide 4 Arrow Post",
        position: 0.25,
        textColor: "#f8fafc",
        backgroundColor: "#111827",
      },
    });
    expect(payload?.pathData.startsWith("M 40 50 C ")).toBe(true);
    expect(payload?.startArrow).not.toBeNull();
    expect(payload?.endArrow).not.toBeNull();
  });

  it("preserves style and label fidelity in the shared render payload", () => {
    const payload = buildCanvasLineRenderPayload(slideLine(), slide);
    expect(payload, "shared payload should be present for a valid CanvasLine").not.toBeNull();
    expect(payload?.id, "stable CanvasLine id").toBe("line-a");
    expect(payload?.key, "stable CanvasLine key").toBe("canvas-line-line-a");
    expect(payload?.pathData, "curve/path geometry").toContain(" C ");
    expect(payload?.commands.length, "curve command payload").toBeGreaterThan(1);
    expect(payload?.startArrow, "start arrowhead").not.toBeNull();
    expect(payload?.endArrow, "end arrowhead").not.toBeNull();
    expect(payload?.strokeColor, "stroke color").toBe("#dc2626");
    expect(payload?.strokeWidth, "stroke width").toBe(4);
    expect(payload?.dashed, "dashed state").toBe(true);
    expect(payload?.label?.text, "label text").toBe("Slide 4 Arrow Post");
    expect(payload?.label?.position, "label_position").toBe(0.25);
    expect(payload?.label?.textColor, "label_text_color").toBe("#f8fafc");
    expect(payload?.label?.backgroundColor, "label_background_color").toBe("#111827");
    expect(payload?.layerPlane, "front/back plane").toBe("front");
    expect(payload?.zIndex, "z-index").toBe(7);
  });

  it("makes thumbnail and fullscreen composition derive an identical shared payload", () => {
    const sharedLine = slideLine();
    const thumbnailPlan = planSlideComposition(slide, [frameElement], [], [sharedLine]);
    const fullscreenPlan = planSlideComposition(slide, [frameElement], [], [sharedLine]);
    expect(thumbnailPlan.frontCanvasLinePayloads).toEqual(fullscreenPlan.frontCanvasLinePayloads);
    expect(thumbnailPlan.backCanvasLinePayloads).toEqual([]);
  });

  it("preserves six-band z-order classification and avoids duplicates", () => {
    const nativeBelow = { id: "native-below", type: "text", frameId: "frame-a" };
    const nativeAbove = { id: "native-above", type: "text", frameId: "frame-a" };
    const embeddable = { id: "emb-a", type: "embeddable", link: "padlet://padlet-a", frameId: "frame-a", x: 120, y: 220, width: 80, height: 60 };
    const plan = planSlideComposition(
      slide,
      [frameElement, nativeBelow, embeddable, nativeAbove],
      [{
        id: "padlet-a",
        board_id: "board-a",
        type: "note",
        title: "Padlet",
        content: "",
        position_x: 0,
        position_y: 0,
        width: 80,
        height: 60,
        metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      } as never],
      [
        slideLine({ id: "back-low", layer_plane: "back", z_index: 1 }),
        slideLine({ id: "front-high", layer_plane: "front", z_index: 3 }),
        slideLine({ id: "front-low", layer_plane: "front", z_index: 2 }),
      ],
    );

    expect(plan.nativeBelowElements.map((element) => element.id)).toEqual(["native-below"]);
    expect(plan.backCanvasLinePayloads.map((payload) => payload.id)).toEqual(["back-low"]);
    expect(plan.resolvedPadlets.map((entry) => entry.padlet.id)).toEqual(["padlet-a"]);
    expect(plan.frontCanvasLinePayloads.map((payload) => payload.id)).toEqual(["front-low", "front-high"]);
    expect(plan.nativeAboveElements.map((element) => element.id)).toEqual(["native-above"]);
    const renderedIds = [
      ...plan.backCanvasLinePayloads.map((payload) => payload.id),
      ...plan.frontCanvasLinePayloads.map((payload) => payload.id),
    ];
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
  });

  it("changes render signatures for each presentation-relevant CanvasLine field", () => {
    const base = getSlideRenderSignature(slide, [frameElement], [], [slideLine()]);
    const expectChanged = (label: string, changedLine: CanvasLine) => {
      expect(getSlideRenderSignature(slide, [frameElement], [], [changedLine]), label).not.toBe(base);
    };

    expectChanged("start_x/start_y", slideLine({
      start_x: 150,
      start_y: 260,
      points: [
        { x: 150, y: 260, type: "smooth" },
        { x: 220, y: 280, type: "smooth" },
        { x: 360, y: 330, type: "smooth" },
      ],
    }));
    expectChanged("end_x/end_y", slideLine({
      end_x: 370,
      end_y: 340,
      points: [
        { x: 140, y: 250, type: "smooth" },
        { x: 220, y: 280, type: "smooth" },
        { x: 370, y: 340, type: "smooth" },
      ],
    }));
    expectChanged("control_x/control_y", slideLine({ control_x: 240, control_y: 300 }));
    expectChanged("points", slideLine({
      points: [
        { x: 150, y: 250, type: "smooth" },
        { x: 360, y: 330, type: "smooth" },
      ],
    }));
    expectChanged("membership-affecting geometry", slideLine({
      start_x: 1000,
      start_y: 1000,
      control_x: 1010,
      control_y: 1010,
      end_x: 1020,
      end_y: 1020,
      points: [
        { x: 1000, y: 1000, type: "smooth" },
        { x: 1020, y: 1020, type: "smooth" },
      ],
    }));
    expectChanged("start_arrow", slideLine({ start_arrow: false }));
    expectChanged("end_arrow", slideLine({ end_arrow: false }));
    expectChanged("color", slideLine({ color: "#2563eb" }));
    expectChanged("stroke_width", slideLine({ stroke_width: 8 }));
    expectChanged("dashed", slideLine({ dashed: false }));
    expectChanged("label", slideLine({ label: "edited" }));
    expectChanged("label_position", slideLine({ label_position: 0.75 }));
    expectChanged("label_text_color", slideLine({ label_text_color: "#111827" }));
    expectChanged("label_background_color", slideLine({ label_background_color: "#f8fafc" }));
    expectChanged("layer_plane", slideLine({ layer_plane: "back" }));
    expectChanged("z_index", slideLine({ z_index: 99 }));
    expectChanged("coord_space eligibility", slideLine({ coord_space: null }));
    expect(getSlideRenderSignature(slide, [frameElement], [], []), "deletion").not.toBe(base);
  });

  it("does not change render signatures for unrelated editor state", () => {
    const base = getSlideRenderSignature(slide, [frameElement], [], [slideLine()]);

    const unrelatedOutside = slideLine({
      id: "outside",
      start_x: 1000,
      start_y: 1000,
      control_x: 1010,
      control_y: 1010,
      end_x: 1020,
      end_y: 1020,
      points: [
        { x: 1000, y: 1000, type: "smooth" },
        { x: 1020, y: 1020, type: "smooth" },
      ],
    });
    expect(getSlideRenderSignature(slide, [frameElement], [], [slideLine(), unrelatedOutside])).toBe(base);
    expect(getSlideRenderSignature(slide, [frameElement], [], [slideLine({ selected: true } as Partial<CanvasLine>)])).toBe(base);
    expect(getSlideRenderSignature(slide, [frameElement], [], [slideLine({ hovered: true } as Partial<CanvasLine>)])).toBe(base);
    expect(getSlideRenderSignature(slide, [frameElement], [], [slideLine({
      drawingViewport: { scrollX: 500, scrollY: 400, zoom: 2, originOffsetX: 10, originOffsetY: 20 },
    } as Partial<CanvasLine>)])).toBe(base);
  });
});

const line = (overrides: Partial<CanvasLine> = {}): CanvasLine => ({
  id: "line-a",
  board_id: "board-a",
  start_x: 20,
  start_y: 20,
  control_x: 50,
  control_y: 50,
  end_x: 80,
  end_y: 80,
  coord_space: "scene",
  color: "#111827",
  stroke_width: 2,
  layer_plane: "front",
  start_arrow: false,
  end_arrow: true,
  dashed: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("CanvasLine slide membership", () => {
  it("uses unpadded scene-space bounds from points when available", () => {
    expect(getCanvasLineSceneBounds(line({
      points: [
        { x: 10, y: 40, type: "smooth" },
        { x: 60, y: 5, type: "smooth" },
        { x: 90, y: 75, type: "smooth" },
      ],
    }))).toEqual({ x: 10, y: 5, width: 80, height: 70 });
  });

  it("includes a line whose bounds center is strictly inside the frame", () => {
    const memberships = resolveCanvasLineSlideMemberships([line()], [frame("frame-a")]);
    expect(memberships).toMatchObject([{ line: { id: "line-a" }, frameId: "frame-a", viaFallback: true }]);
  });

  it("excludes a crossing line when its bounds center is outside every frame", () => {
    const memberships = resolveCanvasLineSlideMemberships([
      line({ start_x: -120, start_y: 50, control_x: -80, control_y: 50, end_x: 20, end_y: 50 }),
    ], [frame("frame-a")]);
    expect(memberships[0].frameId).toBeNull();
  });

  it("excludes boundary-touch and degenerate geometry under strict center containment", () => {
    const memberships = resolveCanvasLineSlideMemberships([
      line({ id: "touch", start_x: -20, start_y: 50, control_x: 0, control_y: 50, end_x: 20, end_y: 50 }),
      line({ id: "degenerate", start_x: 0, start_y: 0, control_x: 0, control_y: 0, end_x: 0, end_y: 0 }),
    ], [frame("frame-a")]);
    expect(memberships.map((entry) => [entry.line.id, entry.frameId])).toEqual([
      ["touch", null],
      ["degenerate", null],
    ]);
  });

  it("uses frame scene-array order for overlapping frames and never duplicates one line into multiple slides", () => {
    const memberships = resolveCanvasLineSlideMemberships([
      line({ start_x: 70, start_y: 20, control_x: 90, control_y: 40, end_x: 110, end_y: 80 }),
    ], [frame("frame-a"), frame("frame-b", 50)]);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].frameId).toBe("frame-a");
  });

  it("excludes coord_space null rows with an observable diagnostic and without mutation", () => {
    const legacy = line({ coord_space: null });
    const before = JSON.stringify(legacy);
    const onDiagnostic = vi.fn();
    const memberships = resolveCanvasLineSlideMemberships([legacy], [frame("frame-a")], onDiagnostic);
    expect(memberships).toEqual([]);
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      code: "canvas-line-preview-legacy-coord-space-excluded",
      lineId: legacy.id,
    }));
    expect(JSON.stringify(legacy)).toBe(before);
  });
});
