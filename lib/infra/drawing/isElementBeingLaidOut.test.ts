import { afterEach, describe, expect, it, vi } from "vitest";
import { isElementBeingLaidOut } from "./isElementBeingLaidOut";

type FixtureNode = HTMLElement & {
  _display?: string;
  _position?: string;
  _visibility?: string;
};

const originalGetComputedStyle = globalThis.getComputedStyle;

function node(options: {
  connected?: boolean;
  display?: string;
  position?: string;
  visibility?: string;
  offsetParent?: Element | null;
  width?: number;
  height?: number;
  parent?: FixtureNode | null;
} = {}): FixtureNode {
  return {
    isConnected: options.connected ?? true,
    parentElement: options.parent ?? null,
    offsetParent: options.offsetParent === undefined ? ({} as Element) : options.offsetParent,
    _display: options.display ?? "block",
    _position: options.position ?? "static",
    _visibility: options.visibility ?? "visible",
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: options.width ?? 20,
      bottom: options.height ?? 20,
      width: options.width ?? 20,
      height: options.height ?? 20,
      toJSON: () => ({}),
    }),
  } as FixtureNode;
}

describe("isElementBeingLaidOut", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.getComputedStyle = originalGetComputedStyle;
  });

  function installComputedStyle() {
    globalThis.getComputedStyle = ((target: FixtureNode) => ({
      display: target._display ?? "block",
      position: target._position ?? "static",
      visibility: target._visibility ?? "visible",
    })) as typeof getComputedStyle;
  }

  it("rejects disconnected nodes", () => {
    installComputedStyle();
    expect(isElementBeingLaidOut(node({ connected: false }))).toBe(false);
  });

  it("rejects display:none nodes and descendants below display:none ancestors", () => {
    installComputedStyle();
    const hiddenParent = node({ display: "none" });
    expect(isElementBeingLaidOut(hiddenParent)).toBe(false);
    expect(isElementBeingLaidOut(node({ parent: hiddenParent }))).toBe(false);
  });

  it("accepts active laid-out nodes without requiring Excalidraw class names", () => {
    installComputedStyle();
    expect(isElementBeingLaidOut(node({ width: 12, height: 4 }))).toBe(true);
  });

  it("keeps visibility:hidden nodes measurable because they still participate in layout", () => {
    installComputedStyle();
    expect(isElementBeingLaidOut(node({ visibility: "hidden", width: 10, height: 10 }))).toBe(true);
  });

  it("rejects no-offset-parent and zero-box nodes as invalid natural-height measurements", () => {
    installComputedStyle();
    expect(isElementBeingLaidOut(node({ offsetParent: null }))).toBe(false);
    expect(isElementBeingLaidOut(node({ width: 0, height: 0 }))).toBe(false);
  });
});
