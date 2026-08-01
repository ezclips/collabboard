import { describe, expect, it } from "vitest";
import { computePostRenderRevision } from "./postRenderRevision";
import type { Padlet } from "@/types/collabboard";

const padlet = (overrides: Partial<Padlet> = {}): Padlet => ({
  id: "padlet-a",
  board_id: "board-1",
  title: "Title",
  content: "Content",
  type: "card",
  position_x: 0,
  position_y: 0,
  width: 200,
  height: 150,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  metadata: {},
  ...overrides,
});

describe("computePostRenderRevision", () => {
  it("produces the same revision for identical canonical state", () => {
    const padlets = [padlet({ id: "a" }), padlet({ id: "b", title: "Other" })];
    expect(computePostRenderRevision(padlets)).toBe(computePostRenderRevision(padlets));
  });

  it("is stable across a fresh array with equivalent content", () => {
    const padlets = [padlet({ id: "a" })];
    const freshArray = [padlet({ id: "a" })];
    expect(computePostRenderRevision(freshArray)).toBe(computePostRenderRevision(padlets));
  });

  it("is stable across fresh post objects with equivalent content", () => {
    const first = [padlet({ id: "a", title: "Same" })];
    const second = [{ ...padlet({ id: "a", title: "Same" }) }];
    expect(computePostRenderRevision(second)).toBe(computePostRenderRevision(first));
  });

  it("is stable across top-level ordering changes", () => {
    const a = padlet({ id: "a", title: "A" });
    const b = padlet({ id: "b", title: "B" });
    const c = padlet({ id: "c", title: "C" });
    expect(computePostRenderRevision([c, a, b])).toBe(computePostRenderRevision([a, b, c]));
    expect(computePostRenderRevision([b, c, a])).toBe(computePostRenderRevision([a, b, c]));
  });

  it("changes when a title changes", () => {
    const before = [padlet({ id: "a", title: "Before" })];
    const after = [padlet({ id: "a", title: "After" })];
    expect(computePostRenderRevision(after)).not.toBe(computePostRenderRevision(before));
  });

  it("changes when a todo task's completed state changes", () => {
    const before = [padlet({ id: "a", type: "todo", metadata: { tasks: [{ id: "t1", text: "Task", completed: false }] } })];
    const after = [padlet({ id: "a", type: "todo", metadata: { tasks: [{ id: "t1", text: "Task", completed: true }] } })];
    expect(computePostRenderRevision(after)).not.toBe(computePostRenderRevision(before));
  });

  it("changes when card colour changes", () => {
    const before = [padlet({ id: "a", metadata: { cardColor: "#ffffff" } })];
    const after = [padlet({ id: "a", metadata: { cardColor: "#ff0000" } })];
    expect(computePostRenderRevision(after)).not.toBe(computePostRenderRevision(before));
  });

  it("changes when a bounded child's render-relevant field changes", () => {
    const parent = padlet({ id: "parent", metadata: { childPadletIds: ["child"] } });
    const childBefore = padlet({ id: "child", title: "Child Before" });
    const childAfter = padlet({ id: "child", title: "Child After" });
    expect(computePostRenderRevision([parent, childAfter])).not.toBe(
      computePostRenderRevision([parent, childBefore]),
    );
  });

  it("does not change for non-render-relevant identity rewrapping", () => {
    const original = [padlet({ id: "a" }), padlet({ id: "b" })];
    // Same content, new array and new object references, only position_x/position_y
    // differ -- neither field is part of buildPadletRenderState's canonical output.
    const rewrapped = original.map((p) => ({ ...p, position_x: p.position_x + 500, position_y: p.position_y - 500 }));
    expect(computePostRenderRevision(rewrapped)).toBe(computePostRenderRevision(original));
  });
});
