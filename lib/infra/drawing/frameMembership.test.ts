import { describe, expect, it } from "vitest";
import { resolveFrameMembership, type ElementFrameState, type FrameCandidate } from "./frameMembership";

const frame = (overrides: Partial<FrameCandidate> = {}): FrameCandidate => ({
  id: "frame-a",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  ...overrides,
});

const element = (overrides: Partial<ElementFrameState> = {}): ElementFrameState => ({
  x: 20,
  y: 20,
  width: 40,
  height: 40,
  frameId: null,
  ...overrides,
});

describe("resolveFrameMembership", () => {
  it("returns an explicit valid frameId unchanged", () => {
    expect(resolveFrameMembership(element({ frameId: "frame-a" }), [frame()])).toEqual({ frameId: "frame-a", viaFallback: false });
  });

  it("returns an explicit stale frameId unchanged", () => {
    expect(resolveFrameMembership(element({ frameId: "stale-frame" }), [frame()])).toEqual({ frameId: "stale-frame", viaFallback: false });
  });

  it("returns the frame ID when a missing frameId has its center inside", () => {
    expect(resolveFrameMembership(element(), [frame()])).toEqual({ frameId: "frame-a", viaFallback: true });
  });

  it("returns the frame ID for full containment", () => {
    expect(resolveFrameMembership(element({ x: 10, y: 10, width: 80, height: 80 }), [frame()])).toEqual({ frameId: "frame-a", viaFallback: true });
  });

  it("excludes a one-pixel sliver overlap when its center is outside", () => {
    expect(resolveFrameMembership(element({ x: 99, y: 20, width: 40, height: 40 }), [frame()])).toEqual({ frameId: null, viaFallback: false });
  });

  it("excludes edge contact when the center is on a boundary", () => {
    expect(resolveFrameMembership(element({ x: -20, y: 20, width: 40, height: 40 }), [frame()])).toEqual({ frameId: null, viaFallback: false });
  });

  it("includes a partial crossing when its center is inside", () => {
    expect(resolveFrameMembership(element({ x: -18, y: 20, width: 40, height: 40 }), [frame()])).toEqual({ frameId: "frame-a", viaFallback: true });
  });

  it("uses the first matching frame in array order for overlapping frames", () => {
    expect(resolveFrameMembership(element(), [frame({ id: "first" }), frame({ id: "second", x: 10, y: 10 })])).toEqual({ frameId: "first", viaFallback: true });
  });

  it("is deterministic, does not mutate inputs, and excludes centers outside every frame", () => {
    const input = Object.freeze(element({ x: 150, y: 150 }));
    const frames = Object.freeze([Object.freeze(frame())]);
    const first = resolveFrameMembership(input, frames);
    const second = resolveFrameMembership(input, frames);

    expect(first).toEqual({ frameId: null, viaFallback: false });
    expect(second).toEqual(first);
    expect(input).toEqual({ x: 150, y: 150, width: 40, height: 40, frameId: null });
    expect(frames).toEqual([{ id: "frame-a", x: 0, y: 0, width: 100, height: 100 }]);
  });
});
