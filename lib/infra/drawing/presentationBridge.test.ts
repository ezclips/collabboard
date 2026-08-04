import { describe, expect, it } from "vitest";
import type { Padlet } from "@/types/collabboard";
import {
  characterizeFrameSlides,
  characterizeMergeSlideLayersInput,
  characterizeRuntimeContainerExpansion,
  characterizeSlideComposition,
  characterizeSlideOrdering,
  characterizeSlideOrientation,
  characterizeSlideTitleFallback,
  characterizeThumbnailKeys,
  summarizePresentationBridgeSnapshot,
  validatePresentationBridgeSnapshot,
} from "./presentationBridge";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const padlet = (id: string, type = "note", metadata: Record<string, unknown> = {}): Padlet => ({
  id,
  board_id: "board-a",
  title: id,
  content: "",
  type,
  position_x: 0,
  position_y: 0,
  width: 100,
  height: 80,
  metadata,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
} as Padlet);

const frame = (overrides: Record<string, unknown> = {}) => ({
  id: "frame-a",
  type: "frame",
  name: "Slide A",
  x: 0,
  y: 0,
  width: 1280,
  height: 720,
  ...overrides,
});

const embeddable = (id: string, padletId: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "embeddable",
  link: `padlet://${padletId}`,
  frameId: "frame-a",
  x: 100,
  y: 120,
  width: 300,
  height: 180,
  ...overrides,
});

const native = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "text",
  frameId: "frame-a",
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  ...overrides,
});

function expectLosslessNativeBands(
  composition: ReturnType<typeof characterizeSlideComposition>,
  expectedNativeIds: string[],
) {
  const below = composition.nativeBelowIds;
  const above = composition.nativeAboveIds;
  expect([...below, ...above].sort()).toEqual([...expectedNativeIds].sort());
  expect(below.filter((id) => above.includes(id))).toEqual([]);
}

// PATCH-148: zIndex is a derived slide-local ordinal; assert visual order + monotonicity, not exact numbers.
function expectResolvedOrder(
  composition: ReturnType<typeof characterizeSlideComposition>,
  expectedEmbeddableIds: string[],
) {
  const z = composition.resolvedPadlets.map((entry) => entry.zIndex);
  expect(composition.resolvedPadlets.map((entry) => entry.embeddableId)).toEqual(expectedEmbeddableIds);
  expect(z).toEqual([...z].sort((a, b) => a - b));
  expect(new Set(z).size).toBe(z.length);
}

describe("presentation bridge characterization", () => {
  describe("frame discovery", () => {
    it("active frame produces one slide", () => {
      expect(characterizeFrameSlides(deepFreeze([frame()]))).toHaveLength(1);
    });

    it("deleted frame produces no slide", () => {
      expect(characterizeFrameSlides(deepFreeze([frame({ isDeleted: true })]))).toEqual([]);
    });

    it("frame title remains stable", () => {
      expect(characterizeFrameSlides(deepFreeze([frame({ name: "Stable" })]))[0].name).toBe("Stable");
    });

    it("blank title uses the live PresentationPanel fallback title", () => {
      expect(characterizeSlideTitleFallback(deepFreeze([
        { id: "first", x: 0, y: 0, width: 1, height: 1, name: " " },
        { id: "second", x: 0, y: 1, width: 1, height: 1, name: "" },
        { id: "named", x: 0, y: 2, width: 1, height: 1, name: "Meaningful" },
      ])).map((row) => row.renderedTitle)).toEqual(["Slide 1", "Slide 2", "Meaningful"]);
    });
  });

  describe("content", () => {
    it("app containers appear according to current resolveSlidePadlets rule", () => {
      const composition = characterizeSlideComposition(characterizeFrameSlides([frame()])[0], deepFreeze([frame(), embeddable("emb-a", "container-a")]), [padlet("container-a", "container")]);
      expect(composition.resolvedPadlets).toMatchObject([{ padletId: "container-a", embeddableId: "emb-a" }]);
    });

    it("native text/shapes/arrows/lines appear according to current frameId rule", () => {
      const composition = characterizeSlideComposition(characterizeFrameSlides([frame()])[0], deepFreeze([frame(), { id: "text-a", type: "text", frameId: "frame-a" }, { id: "arrow-a", type: "arrow", frameId: "frame-a" }]), []);
      expect([...composition.nativeBelowIds, ...composition.nativeAboveIds]).toEqual(["text-a", "arrow-a"]);
    });

    it("line/container alignment remains local to slide coordinates", () => {
      const composition = characterizeSlideComposition(characterizeFrameSlides([frame({ x: 50, y: 70 })])[0], deepFreeze([frame({ x: 50, y: 70 }), embeddable("emb-a", "padlet-a", { x: 80, y: 100 })]), [padlet("padlet-a")]);
      expect(composition.resolvedPadlets[0]).toMatchObject({ localX: 30, localY: 30 });
    });

    it("content does not move between slides when frameId remains stable", () => {
      const slides = characterizeFrameSlides(deepFreeze([frame(), frame({ id: "frame-b", x: 2000 })]));
      const first = characterizeSlideComposition(slides[0], [frame(), embeddable("emb-a", "padlet-a")], [padlet("padlet-a")]);
      const second = characterizeSlideComposition(slides[1], [frame({ id: "frame-b", x: 2000 }), embeddable("emb-a", "padlet-a")], [padlet("padlet-a")]);
      expect(first.resolvedPadlets).toHaveLength(1);
      expect(second.resolvedPadlets).toHaveLength(0);
    });

    it("overlap fallback is characterized when app embeddable has no frameId", () => {
      const diagnostics = validatePresentationBridgeSnapshot({ elements: deepFreeze([frame(), embeddable("emb-a", "padlet-a", { frameId: null })]), padlets: [padlet("padlet-a")] });
      expect(diagnostics.map((row) => row.code)).toContain("slide-embeddable-overlap-fallback");
    });

    it("includes an inside app embeddable with a matching frameId without fallback", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 100, y: 120, frameId: "frame-a" })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toMatchObject([
        { padletId: "padlet-a", embeddableId: "emb-a", localX: 100, localY: 120, usedOverlapFallback: false },
      ]);
    });

    it("includes an inside app embeddable with no frameId via overlap fallback", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 100, y: 120, frameId: null })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toMatchObject([
        { padletId: "padlet-a", embeddableId: "emb-a", localX: 100, localY: 120, usedOverlapFallback: true },
      ]);
    });

    it("excludes an outside app embeddable with no frameId", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 1400, y: 120, frameId: null })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toEqual([]);
    });

    it("excludes an outside app embeddable with a different frameId", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 1400, y: 120, frameId: "frame-b" })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toEqual([]);
    });

    it("excludes a one-pixel app embeddable sliver overlap when frameId is absent under PATCH-112 center-point containment", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 1279, y: 120, width: 300, frameId: null })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toEqual([]);
    });

    it("excludes a one-pixel app embeddable sliver overlap when frameId points elsewhere", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 1279, y: 120, width: 300, frameId: "frame-b" })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toEqual([]);
    });

    it("includes an embeddable with frameId freshly assigned on drag commit as explicit membership", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 100, y: 120, frameId: "frame-a" })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toMatchObject([
        { padletId: "padlet-a", embeddableId: "emb-a", usedOverlapFallback: false },
      ]);
    });

    it("excludes an edge-adjacent app embeddable because overlap uses strict inequalities", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-a", "padlet-a", { x: 1280, y: 120, frameId: null })]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets).toEqual([]);
    });

    it("uses explicit frameId over geometry when two frames overlap", () => {
      const slides = characterizeFrameSlides(deepFreeze([
        frame(),
        frame({ id: "frame-b", name: "Slide B", x: 200, y: 0, width: 1280, height: 720 }),
      ]));
      const elements = deepFreeze([
        frame(),
        frame({ id: "frame-b", name: "Slide B", x: 200, y: 0, width: 1280, height: 720 }),
        embeddable("emb-a", "padlet-a", { x: 240, y: 120, frameId: "frame-a" }),
      ]);

      expect(characterizeSlideComposition(slides[0], elements, [padlet("padlet-a")]).resolvedPadlets).toMatchObject([
        { padletId: "padlet-a", embeddableId: "emb-a", usedOverlapFallback: false },
      ]);
      expect(characterizeSlideComposition(slides[1], elements, [padlet("padlet-a")]).resolvedPadlets).toEqual([]);
    });

    it("emits overlap-fallback diagnostics exactly for fallback membership", () => {
      const fallbackDiagnostics = validatePresentationBridgeSnapshot({
        elements: deepFreeze([frame(), embeddable("emb-fallback", "padlet-a", { frameId: null })]),
        padlets: [padlet("padlet-a")],
      });
      const cleanDiagnostics = validatePresentationBridgeSnapshot({
        elements: deepFreeze([frame(), embeddable("emb-clean", "padlet-a")]),
        padlets: [padlet("padlet-a")],
      });

      expect(fallbackDiagnostics.filter((row) => row.code === "slide-embeddable-overlap-fallback")).toHaveLength(1);
      expect(cleanDiagnostics.filter((row) => row.code === "slide-embeddable-overlap-fallback")).toHaveLength(0);
    });

    it("excludes overlapping native non-embeddable elements without frameId", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), native("native-overlap", { frameId: null, x: 100, y: 120 })]),
        [],
      );

      expect(composition.nativeBelowIds).toEqual([]);
      expect(composition.nativeAboveIds).toEqual([]);
    });

    it("S1 keeps one-padlet native members before and after in existing bands", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([
          frame(),
          native("native-before"),
          embeddable("emb-a", "padlet-a"),
          native("native-after"),
        ]),
        [padlet("padlet-a")],
      );

      expectResolvedOrder(composition, ["emb-a"]);
      expect(composition.nativeBelowIds).toEqual(["native-before"]);
      expect(composition.nativeAboveIds).toEqual(["native-after"]);
      expectLosslessNativeBands(composition, ["native-before", "native-after"]);
    });

    it("S2 keeps adjacent-padlet native members before and after in existing bands", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([
          frame(),
          native("native-before"),
          embeddable("emb-a", "padlet-a"),
          embeddable("emb-b", "padlet-b"),
          native("native-after"),
        ]),
        [padlet("padlet-a"), padlet("padlet-b")],
      );

      expectResolvedOrder(composition, ["emb-a", "emb-b"]);
      expect(composition.nativeBelowIds).toEqual(["native-before"]);
      expect(composition.nativeAboveIds).toEqual(["native-after"]);
      expectLosslessNativeBands(composition, ["native-before", "native-after"]);
    });

    it("S3 assigns native members between two padlets to above without dropping them", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([
          frame(),
          embeddable("emb-a", "padlet-a"),
          native("native-middle-a"),
          native("native-middle-b", { type: "rectangle" }),
          embeddable("emb-b", "padlet-b"),
        ]),
        [padlet("padlet-a"), padlet("padlet-b")],
      );

      expectResolvedOrder(composition, ["emb-a", "emb-b"]);
      expect(composition.nativeBelowIds).toEqual([]);
      expect(composition.nativeAboveIds).toEqual(["native-middle-a", "native-middle-b"]);
      expectLosslessNativeBands(composition, ["native-middle-a", "native-middle-b"]);
    });

    it("S4 assigns live G1d fixture-shape native members above while preserving the extra resolved padlet", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame({ id: "frame-portrait", x: 2000 }), frame()])[1],
        deepFreeze([
          frame({ id: "frame-portrait", x: 2000 }),
          frame(),
          embeddable("emb-slide-a", "padlet-a"),
          embeddable("emb-uploaded-image", "padlet-b"),
          native("text-landscape"),
          native("shape-landscape", { type: "rectangle" }),
          embeddable("emb-slide-b", "padlet-portrait", { frameId: "frame-portrait" }),
          embeddable("runtime-container-c", "padlet-c", { frameId: null, x: 160, y: 460, width: 320, height: 220 }),
        ]),
        [padlet("padlet-a"), padlet("padlet-b"), padlet("padlet-c"), padlet("padlet-portrait")],
      );

      expectResolvedOrder(composition, ["emb-slide-a", "emb-uploaded-image", "runtime-container-c"]);
      expect(composition.nativeBelowIds).toEqual([]);
      expect(composition.nativeAboveIds).toEqual(["text-landscape", "shape-landscape"]);
      expectLosslessNativeBands(composition, ["text-landscape", "shape-landscape"]);
    });

    it("S5 characterizes duplicate padlet links without dropping native members", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([
          frame(),
          embeddable("emb-a", "padlet-a"),
          native("native-between"),
          embeddable("emb-a-copy", "padlet-a"),
        ]),
        [padlet("padlet-a")],
      );

      expect(composition.resolvedPadlets.map((entry) => entry.padletId)).toEqual(["padlet-a", "padlet-a"]);
      expectResolvedOrder(composition, ["emb-a", "emb-a-copy"]);
      expect(composition.nativeBelowIds).toEqual([]);
      expect(composition.nativeAboveIds).toEqual(["native-between"]);
      expectLosslessNativeBands(composition, ["native-between"]);
    });

    it("S6 preserves an already-lossless below/above baseline outcome", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([
          frame(),
          native("native-before"),
          embeddable("emb-a", "padlet-a"),
          native("native-after"),
        ]),
        [padlet("padlet-a")],
      );

      expect(composition.nativeBelowIds).toEqual(["native-before"]);
      expect(composition.nativeAboveIds).toEqual(["native-after"]);
      expect(composition.resolvedPadlets).toMatchObject([{ padletId: "padlet-a", embeddableId: "emb-a" }]);
    });

    it("S7 uses the active index domain when deleted elements precede native members", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([
          frame(),
          embeddable("emb-a", "padlet-a"),
          { ...native("deleted-gap"), isDeleted: true },
          native("native-after-deleted"),
          embeddable("emb-b", "padlet-b"),
        ]),
        [padlet("padlet-a"), padlet("padlet-b")],
      );

      expectResolvedOrder(composition, ["emb-a", "emb-b"]);
      expect(composition.nativeBelowIds).toEqual([]);
      expect(composition.nativeAboveIds).toEqual(["native-after-deleted"]);
      expectLosslessNativeBands(composition, ["native-after-deleted"]);
    });

    it("cross-slide members do not shift the target slide's resolved ordering (PATCH-148)", () => {
      const targetSlide = characterizeFrameSlides([frame()])[0];
      const baseline = characterizeSlideComposition(
        targetSlide,
        deepFreeze([frame(), embeddable("emb-a", "padlet-a"), embeddable("emb-b", "padlet-b")]),
        [padlet("padlet-a"), padlet("padlet-b")],
      );
      const withOtherSlide = characterizeSlideComposition(
        targetSlide,
        deepFreeze([
          frame(),
          frame({ id: "frame-b", x: 3000 }),
          embeddable("emb-other", "padlet-o", { frameId: "frame-b" }),
          embeddable("emb-a", "padlet-a"),
          native("native-other", { frameId: "frame-b" }),
          embeddable("emb-b", "padlet-b"),
        ]),
        [padlet("padlet-a"), padlet("padlet-b"), padlet("padlet-o")],
      );

      expectResolvedOrder(withOtherSlide, ["emb-a", "emb-b"]);
      const baseZ = baseline.resolvedPadlets.map((entry) => entry.zIndex);
      expect(withOtherSlide.resolvedPadlets.map((entry) => entry.zIndex)).toEqual(baseZ);
    });
    it("a native member interleaved among resolved padlets produces a documented, non-contiguous gap (PATCH-148)", () => {
      const composition = characterizeSlideComposition(
        characterizeFrameSlides([frame()])[0],
        deepFreeze([frame(), embeddable("emb-x", "padlet-x"), native("native-gap"), embeddable("emb-z", "padlet-z")]),
        [padlet("padlet-x"), padlet("padlet-z")],
      );
      expectResolvedOrder(composition, ["emb-x", "emb-z"]);
      // native-gap consumes ordinal 1: a rank within full slide membership, not a dropped padlet.
      expect(composition.resolvedPadlets.map((entry) => entry.zIndex)).toEqual([0, 2]);
      expectLosslessNativeBands(composition, ["native-gap"]);
    });

    it("classifies every eligible native member exactly once across Stage 1 scenarios", () => {
      const scenarios = [
        {
          elements: [frame(), native("native-before"), embeddable("emb-a", "padlet-a"), native("native-after")],
          padlets: [padlet("padlet-a")],
          expectedNativeIds: ["native-before", "native-after"],
        },
        {
          elements: [frame(), embeddable("emb-a", "padlet-a"), native("native-middle"), embeddable("emb-b", "padlet-b")],
          padlets: [padlet("padlet-a"), padlet("padlet-b")],
          expectedNativeIds: ["native-middle"],
        },
        {
          elements: [frame(), native("native-only-a"), native("native-only-b")],
          padlets: [],
          expectedNativeIds: ["native-only-a", "native-only-b"],
        },
      ];

      for (const scenario of scenarios) {
        const composition = characterizeSlideComposition(
          characterizeFrameSlides([frame()])[0],
          deepFreeze(scenario.elements),
          scenario.padlets,
        );
        expectLosslessNativeBands(composition, scenario.expectedNativeIds);
      }
    });
  });

  describe("ordering", () => {
    it("sidebar sorted order is characterized", () => {
      const ordering = characterizeSlideOrdering([{ id: "b", x: 0, y: 100, width: 1, height: 1 }, { id: "a", x: 0, y: 0, width: 1, height: 1 }]);
      expect(ordering.map((row) => row.slideId)).toEqual(["a", "b"]);
    });

    it("fullscreen source order is characterized", () => {
      const slides = characterizeFrameSlides(deepFreeze([frame({ id: "source-b", y: 100 }), frame({ id: "source-a", y: 0 })]));
      expect(slides.map((slide) => slide.id)).toEqual(["source-b", "source-a"]);
    });

    it("duplicate slide behavior is characterized without changing it", () => {
      const slides = characterizeFrameSlides(deepFreeze([frame(), frame({ id: "frame-copy", x: 1360, name: "Slide A" })]));
      expect(slides.map((slide) => slide.name)).toEqual(["Slide A", "Slide A"]);
    });

    it("delete slide behavior is characterized without changing it", () => {
      const summary = summarizePresentationBridgeSnapshot({ elements: deepFreeze([frame({ isDeleted: true })]) });
      expect(summary.slideCount).toBe(0);
      expect(summary.violationCodes).toContain("slide-frame-deleted");
    });

    it("order survives save/reload snapshot", () => {
      expect(characterizeSlideOrdering(deepFreeze([{ id: "one", x: 0, y: 0, width: 1, height: 1 }, { id: "two", x: 100, y: 0, width: 1, height: 1 }])).map((row) => row.slideId)).toEqual(["one", "two"]);
    });
  });

  describe("orientation and rendering", () => {
    it("landscape frame reports landscape", () => {
      expect(characterizeSlideOrientation([{ id: "slide", x: 0, y: 0, width: 1280, height: 720 }])[0].orientation).toBe("landscape");
    });

    it("portrait frame reports portrait", () => {
      expect(characterizeSlideOrientation([{ id: "slide", x: 0, y: 0, width: 720, height: 1280 }])[0].orientation).toBe("portrait");
    });

    it("resizing frame updates orientation classification", () => {
      expect(characterizeSlideOrientation([{ id: "slide", x: 0, y: 0, width: 700, height: 900 }, { id: "slide", x: 0, y: 0, width: 900, height: 700 }]).map((row) => row.orientation)).toEqual(["portrait", "landscape"]);
    });

    it("app container shell and children render plan is characterized", () => {
      const rows = characterizeRuntimeContainerExpansion([{ padlet: padlet("container-a", "container", { childPadletIds: ["child-a"] }), localX: 0, localY: 0, width: 300, height: 200, zIndex: 2 }], [padlet("container-a", "container"), padlet("child-a")]);
      expect(rows).toMatchObject([{ kind: "derived-container-child", padletId: "child-a", zIndex: 2 }]);
    });

    it("runtime container expansion delegates live child ordering including created_at tie-breaker", () => {
      const rows = characterizeRuntimeContainerExpansion(
        [{ padlet: padlet("container-a", "container"), localX: 0, localY: 0, width: 300, height: 260, zIndex: 2 }],
        [
          padlet("container-a", "container"),
          { ...padlet("late", "note", { parentId: "container-a", containerIndex: 2 }), created_at: "2026-01-03T00:00:00.000Z" },
          { ...padlet("early-b", "note", { parentId: "container-a", containerIndex: 1 }), created_at: "2026-01-02T00:00:00.000Z" },
          { ...padlet("early-a", "note", { parentId: "container-a", containerIndex: 1 }), created_at: "2026-01-01T00:00:00.000Z" },
        ],
      );
      expect(rows.map((row) => row.padletId)).toEqual(["early-a", "early-b", "late"]);
    });

    it("uploaded image/file dependency signature is characterized", () => {
      expect(characterizeThumbnailKeys([{ id: "slide", x: 0, y: 0, width: 1, height: 1, renderSignature: "file:image.png" }])[0]).toMatchObject({ key: "file:image.png", source: "renderSignature" });
    });

    it("AI-image behavior is characterized honestly, including current defects", () => {
      const summary = summarizePresentationBridgeSnapshot({ elements: [frame(), embeddable("emb-ai", "ai-a")], padlets: [padlet("ai-a", "image", { aiPrompt: "prompt", imageUrl: null })] });
      expect(summary.slideCount).toBe(1);
    });

    it("missing asset behavior is characterized", () => {
      const diagnostics = validatePresentationBridgeSnapshot({ elements: deepFreeze([frame(), embeddable("missing", "missing")]), padlets: [] });
      expect(diagnostics.map((row) => row.code)).toContain("slide-embeddable-missing-padlet");
    });

    it("zero-size canvas behavior is recorded and tested without production change", () => {
      expect(characterizeMergeSlideLayersInput({ width: 0, height: 720, drawableLayerCount: 1 })).toMatchObject({ zeroSize: true, currentBehavior: "creates-canvas-with-supplied-size" });
    });
  });

  describe("thumbnail lifecycle and fullscreen parity", () => {
    it("thumbnail keys and fullscreen selected-slide parity are summarized with required diagnostic fields", () => {
      const summary = summarizePresentationBridgeSnapshot({ slides: deepFreeze([{ id: "slide", x: 1, y: 2, width: 3, height: 4, contentVersion: 5 }]), mergeInputs: [{ width: 0, height: 0, drawableLayerCount: 0 }] });
      expect(summary.thumbnailKeys[0].key).toBe("1,2,3,4,5");
      expect(summary.violationCodes).toContain("slide-title-empty-current");
      expect(Object.keys(summary.diagnostics[0]).sort()).toEqual(["code", "elementId", "embeddableId", "frameId", "frameName", "height", "message", "orderIndex", "orientation", "padletId", "slideId", "sortedIndex", "source", "width", "zIndex"].sort());
    });
  });
});
