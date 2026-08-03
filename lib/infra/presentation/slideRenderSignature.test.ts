import { describe, expect, it } from "vitest";
import { getSlideRenderSignature } from "@/components/presentation/slide-renderer/getSlideRenderSignature";
import { planSlideComposition } from "@/components/presentation/slide-renderer/planSlideComposition";
import type { FrameSlide } from "@/components/presentation/PresentationPanel";
import type { Padlet } from "@/types/collabboard";

const frameA: FrameSlide = { id: "frame-a", x: 0, y: 0, width: 640, height: 360 };
const frameB: FrameSlide = { id: "frame-b", x: 900, y: 0, width: 640, height: 360 };

const frame = (id: string, x: number) => ({ id, type: "frame", x, y: 0, width: 640, height: 360 });
const rect = (id: string, frameId: string, x: number) => ({ id, type: "rectangle", frameId, x, y: 20, width: 40, height: 40 });
const emb = (id: string, padletId: string, x: number, frameId: string | null = null) => ({
  id,
  type: "embeddable",
  link: `padlet://${padletId}`,
  frameId,
  x,
  y: 40,
  width: 160,
  height: 90,
  version: 1,
  versionNonce: 1,
});
const padlet = (id: string, title = id): Padlet => ({
  id,
  title,
  content: "",
  type: "note",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  user_id: "u",
  metadata: {},
} as unknown as Padlet);

const pads = [padlet("a-1"), padlet("a-2"), padlet("a-3"), padlet("b-1"), padlet("shared")];
const baseElements = [
  frame("frame-a", 0),
  rect("a-native", "frame-a", 10),
  emb("a-one", "a-1", 80),
  emb("a-two", "a-2", 280),
  frame("frame-b", 900),
  emb("b-one", "b-1", 980),
];

function signature(slide: FrameSlide, elements = baseElements, padlets = pads) {
  return getSlideRenderSignature(slide, elements, padlets);
}

function order(slide: FrameSlide, elements = baseElements) {
  return planSlideComposition(slide, elements, pads).resolvedPadlets.map((entry) => ({
    id: entry.embeddable.id,
    zIndex: entry.zIndex,
  }));
}

describe("PATCH-142 slide render signature ordering", () => {
  it("ignores unrelated global insertions for frame A signature and composition", () => {
    const withEarlierBInsert = [baseElements[0], frame("frame-b2", 1800), rect("b-rect", "frame-b", 930), ...baseElements.slice(1)];
    expect(signature(frameA, withEarlierBInsert)).toBe(signature(frameA));
    expect(order(frameA, withEarlierBInsert)).toEqual(order(frameA));
  });

  it("invalidates only the owning slide for a frame-B insertion", () => {
    const withBInsert = [...baseElements, rect("b-native", "frame-b", 940)];
    expect(signature(frameA, withBInsert)).toBe(signature(frameA));
    expect(signature(frameB, withBInsert)).not.toBe(signature(frameB));
  });

  it("changes signature and composition when frame A overlays reorder", () => {
    const reordered = [baseElements[0], baseElements[1], baseElements[3], baseElements[2], ...baseElements.slice(4)];
    expect(signature(frameA, reordered)).not.toBe(signature(frameA));
    expect(order(frameA, reordered).map((entry) => entry.id)).toEqual(["a-two", "a-one"]);
  });

  it("compacts local ordinals after local insertion and deletion", () => {
    const inserted = [baseElements[0], baseElements[1], baseElements[2], emb("a-three", "a-3", 180), ...baseElements.slice(3)];
    expect(order(frameA, inserted)).toEqual([
      { id: "a-one", zIndex: 1 },
      { id: "a-three", zIndex: 2 },
      { id: "a-two", zIndex: 3 },
    ]);

    const deleted = inserted.filter((element) => element.id !== "a-one");
    expect(order(frameA, deleted)).toEqual([
      { id: "a-three", zIndex: 1 },
      { id: "a-two", zIndex: 2 },
    ]);
  });

  it("keeps real visual inputs and shared dependencies in the signature", () => {
    const geometryChanged = baseElements.map((element) => element.id === "a-one" ? { ...element, width: 180, version: 2 } : element);
    expect(signature(frameA, geometryChanged)).not.toBe(signature(frameA));

    const sharedElements = [...baseElements, emb("a-shared", "shared", 420), emb("b-shared", "shared", 1120)];
    const sharedChanged = pads.map((entry) => entry.id === "shared" ? { ...entry, title: "changed" } : entry);
    expect(signature(frameA, sharedElements, sharedChanged)).not.toBe(signature(frameA, sharedElements));
    expect(signature(frameB, sharedElements, sharedChanged)).not.toBe(signature(frameB, sharedElements));
  });
});
