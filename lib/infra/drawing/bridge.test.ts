import { describe, expect, it } from "vitest";

import { resolveSlidePadlets } from "@/components/presentation/slide-renderer/resolveSlidePadlets";

import {
  characterizeFrameOrdering,
  collectDuplicateEmbeddableLinks,
  findAppEmbeddableForPadlet,
  findAppEmbeddablesForPadlet,
  isEmbeddableInSlideFrame,
  resolveContainerMembership,
  summarizeDrawingBridgeSnapshot,
  validateDrawingBridgeSnapshot,
  type BridgePadletLike,
  type BridgeSceneElementLike,
  type BridgeSlideFrameLike,
} from "./bridge";

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const padlet = (
  id: string,
  metadata: Record<string, unknown> | null = {},
  type = "text",
): BridgePadletLike => ({ id, type, metadata });

const embeddable = (
  id: string,
  padletId: string,
  overrides: Partial<BridgeSceneElementLike> = {},
): BridgeSceneElementLike => ({
  id,
  type: "embeddable",
  link: `padlet://${padletId}`,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  ...overrides,
});

const frame = (
  id: string,
  overrides: Partial<BridgeSceneElementLike> = {},
): BridgeSceneElementLike => ({
  id,
  type: "frame",
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  ...overrides,
});

const slideFrame: BridgeSlideFrameLike = { id: "frame-a", x: 0, y: 0, width: 100, height: 100 };

describe("resolveContainerMembership", () => {
  it("T1 lists childPadletIds-ordered children first, then parentId-linked extras", () => {
    const input = deepFreeze([
      padlet("container", { childPadletIds: ["listed-b", "listed-a"] }, "container"),
      padlet("linked-extra", { parentId: "container" }),
      padlet("listed-a", { parentId: "container" }),
      padlet("listed-b", { parentId: "container" }),
    ]);

    expect(resolveContainerMembership(input[0], input).orderedChildIds).toEqual([
      "listed-b",
      "listed-a",
      "linked-extra",
    ]);
  });

  it("T2 dedupes ids present in both sources keeping list position", () => {
    const input = deepFreeze([
      padlet("container", { childPadletIds: ["child", "child"] }, "container"),
      padlet("child", { parentId: "container" }),
    ]);

    expect(resolveContainerMembership(input[0], input).orderedChildIds).toEqual(["child"]);
  });

  it("T3 ignores non-string entries in childPadletIds", () => {
    const input = deepFreeze([
      padlet("container", { childPadletIds: ["child", 123, null, { id: "x" }] }, "container"),
      padlet("child", { parentId: "container" }),
    ]);

    expect(resolveContainerMembership(input[0], input).orderedChildIds).toEqual(["child"]);
  });

  it("T4 reports staleChildIds for listed ids with no matching padlet", () => {
    const input = deepFreeze([padlet("container", { childPadletIds: ["missing"] }, "container")]);

    expect(resolveContainerMembership(input[0], input)).toMatchObject({
      staleChildIds: ["missing"],
      hasMirrorMismatch: true,
    });
  });

  it("T5 reports unlinkedChildIds for listed children whose parentId points elsewhere while still listing them as rendered", () => {
    const input = deepFreeze([
      padlet("container", { childPadletIds: ["child"] }, "container"),
      padlet("child", { parentId: "other" }),
    ]);

    expect(resolveContainerMembership(input[0], input)).toMatchObject({
      orderedChildIds: ["child"],
      unlinkedChildIds: ["child"],
      hasMirrorMismatch: true,
    });
  });

  it("T6 reports linkedOnlyChildIds for parentId children missing from the mirror", () => {
    const input = deepFreeze([
      padlet("container", { childPadletIds: [] }, "container"),
      padlet("child", { parentId: "container" }),
    ]);

    expect(resolveContainerMembership(input[0], input)).toMatchObject({
      orderedChildIds: ["child"],
      linkedOnlyChildIds: ["child"],
      hasMirrorMismatch: true,
    });
  });

  it("T7 reports no mismatch for a fully mirrored container", () => {
    const input = deepFreeze([
      padlet("container", { childPadletIds: ["child"] }, "container"),
      padlet("child", { parentId: "container" }),
    ]);

    expect(resolveContainerMembership(input[0], input)).toEqual({
      orderedChildIds: ["child"],
      staleChildIds: [],
      unlinkedChildIds: [],
      linkedOnlyChildIds: [],
      hasMirrorMismatch: false,
    });
  });
});

describe("findAppEmbeddablesForPadlet", () => {
  it("T8 returns all active embeddables with the exact padlet link in scene order", () => {
    const elements = deepFreeze([
      embeddable("emb-a", "post"),
      embeddable("emb-b", "other"),
      embeddable("emb-c", "post"),
    ]);

    expect(findAppEmbeddablesForPadlet(elements, "post").map((element) => element.id)).toEqual(["emb-a", "emb-c"]);
  });

  it("T9 excludes deleted embeddables and non-embeddable elements", () => {
    const elements = deepFreeze([
      embeddable("deleted", "post", { isDeleted: true }),
      { id: "rect", type: "rectangle", link: "padlet://post" },
      embeddable("active", "post"),
    ]);

    expect(findAppEmbeddablesForPadlet(elements, "post").map((element) => element.id)).toEqual(["active"]);
  });

  it("T10 does not match other padlets or native links", () => {
    const elements = deepFreeze([
      embeddable("other", "other"),
      { id: "native", type: "embeddable", link: "https://example.com" },
    ]);

    expect(findAppEmbeddablesForPadlet(elements, "post")).toEqual([]);
  });

  it("T11 findAppEmbeddableForPadlet returns the first scene match (current .find() winner)", () => {
    const elements = deepFreeze([embeddable("first", "post"), embeddable("second", "post")]);

    expect(findAppEmbeddableForPadlet(elements, "post")?.id).toBe("first");
  });
});

describe("collectDuplicateEmbeddableLinks", () => {
  it("T12 reports links carried by more than one active embeddable (alt-drag clone fixture)", () => {
    const elements = deepFreeze([
      embeddable("clone-b", "b"),
      embeddable("clone-a1", "a"),
      embeddable("clone-a2", "a"),
      embeddable("deleted", "b", { isDeleted: true }),
      embeddable("clone-b2", "b"),
    ]);

    expect(collectDuplicateEmbeddableLinks(elements)).toEqual([
      { padletId: "a", elementIds: ["clone-a1", "clone-a2"] },
      { padletId: "b", elementIds: ["clone-b", "clone-b2"] },
    ]);
  });

  it("T13 reports duplicates created by slide duplication (cloned frame children keep the source link)", () => {
    const elements = deepFreeze([
      frame("frame-a"),
      embeddable("source-child", "container", { frameId: "frame-a" }),
      frame("frame-b"),
      embeddable("cloned-child", "container", { frameId: "frame-b" }),
    ]);

    expect(collectDuplicateEmbeddableLinks(elements)).toEqual([
      { padletId: "container", elementIds: ["source-child", "cloned-child"] },
    ]);
  });
});

describe("characterizeFrameOrdering", () => {
  it("T14 lists active frames in scene order with scene indices", () => {
    const elements = deepFreeze([
      frame("frame-b", { isDeleted: true }),
      frame("frame-a"),
      embeddable("child", "post", { frameId: "frame-a" }),
      frame("frame-c"),
    ]);

    expect(characterizeFrameOrdering(elements).map(({ frameId, sceneIndex }) => ({ frameId, sceneIndex }))).toEqual([
      { frameId: "frame-a", sceneIndex: 1 },
      { frameId: "frame-c", sceneIndex: 3 },
    ]);
  });

  it("T15 lists each frame's members in scene order via frameId only", () => {
    const elements = deepFreeze([
      embeddable("child-b", "b", { frameId: "frame-a" }),
      frame("frame-a"),
      embeddable("child-a", "a", { frameId: "frame-a" }),
    ]);

    expect(characterizeFrameOrdering(elements)[0].memberIdsInSceneOrder).toEqual(["child-b", "child-a"]);
  });

  it("T16 excludes overlapping elements without frameId from membership", () => {
    const elements = deepFreeze([
      embeddable("overlap", "post", { x: 10, y: 10, frameId: null }),
      frame("frame-a"),
    ]);

    expect(characterizeFrameOrdering(elements)[0].memberIdsInSceneOrder).toEqual([]);
  });
});

describe("isEmbeddableInSlideFrame", () => {
  it("T17 honors frameId when set even against contradicting overlap", () => {
    expect(isEmbeddableInSlideFrame(embeddable("match", "post", {
      frameId: "frame-a",
      x: 500,
      y: 500,
    }), slideFrame)).toBe(true);
    expect(isEmbeddableInSlideFrame(embeddable("other", "post", {
      frameId: "frame-b",
      x: 10,
      y: 10,
    }), slideFrame)).toBe(false);
  });

  it("T18 falls back to geometric overlap only when frameId is null", () => {
    expect(isEmbeddableInSlideFrame(embeddable("overlap", "post", {
      frameId: null,
      x: 90,
      y: 90,
      width: 20,
      height: 20,
    }), slideFrame)).toBe(true);
    expect(isEmbeddableInSlideFrame(embeddable("disjoint", "post", {
      frameId: null,
      x: 100,
      y: 100,
      width: 20,
      height: 20,
    }), slideFrame)).toBe(false);
  });

  it("T19 matches resolveSlidePadlets inclusion across the shared fixture matrix", () => {
    const elements = deepFreeze([
      embeddable("frame-match", "match", { frameId: "frame-a", x: 500, y: 500 }),
      embeddable("frame-other", "other", { frameId: "frame-b", x: 10, y: 10 }),
      embeddable("overlap", "overlap", { frameId: null, x: 10, y: 10 }),
      embeddable("disjoint", "disjoint", { frameId: null, x: 150, y: 150 }),
      embeddable("deleted", "deleted", { isDeleted: true, x: 10, y: 10 }),
      { id: "native", type: "embeddable", link: "https://example.com", x: 10, y: 10, width: 10, height: 10 },
    ]);
    const padlets = deepFreeze(["match", "other", "overlap", "disjoint", "deleted"].map((id) => padlet(id)));
    const liveIds = resolveSlidePadlets(slideFrame, elements, padlets as never).map((entry) => entry.padlet.id).sort();
    const helperIds = elements
      .filter((element) => element.type === "embeddable" && !element.isDeleted && typeof element.link === "string")
      .filter((element) => element.link?.startsWith("padlet://"))
      .filter((element) => isEmbeddableInSlideFrame(element, slideFrame))
      .map((element) => element.link!.replace("padlet://", ""))
      .filter((id) => padlets.some((candidate) => candidate.id === id))
      .sort();

    expect(helperIds).toEqual(liveIds);
  });
});

describe("validateDrawingBridgeSnapshot", () => {
  it("T20 passes a clean snapshot", () => {
    const input = deepFreeze({
      elements: [embeddable("container-emb", "container"), embeddable("plain-emb", "plain"), frame("frame-a")],
      padlets: [
        padlet("container", { childPadletIds: ["child"] }, "container"),
        padlet("child", { parentId: "container" }),
        padlet("plain"),
      ],
    });

    expect(validateDrawingBridgeSnapshot(input)).toEqual({ ok: true, violations: [] });
  });

  it("T21 flags duplicate-embeddable-link", () => {
    const result = validateDrawingBridgeSnapshot(deepFreeze({
      elements: [embeddable("a", "post"), embeddable("b", "post")],
      padlets: [padlet("post")],
    }));

    expect(result.violations.map((violation) => violation.code)).toContain("duplicate-embeddable-link");
  });

  it("T22 flags embeddable-links-missing-padlet", () => {
    const result = validateDrawingBridgeSnapshot(deepFreeze({
      elements: [embeddable("missing", "post")],
      padlets: [],
    }));

    expect(result.violations).toContainEqual(expect.objectContaining({
      code: "embeddable-links-missing-padlet",
      padletId: "post",
      elementIds: ["missing"],
    }));
  });

  it("T23 flags child-padlet-has-embeddable", () => {
    const result = validateDrawingBridgeSnapshot(deepFreeze({
      elements: [embeddable("child-emb", "child"), embeddable("container-emb", "container")],
      padlets: [padlet("container", { childPadletIds: ["child"] }, "container"), padlet("child", { parentId: "container" })],
    }));

    expect(result.violations).toContainEqual(expect.objectContaining({
      code: "child-padlet-has-embeddable",
      padletId: "child",
      elementIds: ["child-emb"],
    }));
  });

  it("T24 flags root-padlet-missing-embeddable", () => {
    const result = validateDrawingBridgeSnapshot(deepFreeze({
      elements: [],
      padlets: [padlet("post")],
    }));

    expect(result.violations).toContainEqual(expect.objectContaining({
      code: "root-padlet-missing-embeddable",
      padletId: "post",
    }));
  });

  it("T25 flags membership-mirror-mismatch", () => {
    const result = validateDrawingBridgeSnapshot(deepFreeze({
      elements: [embeddable("container-emb", "container")],
      padlets: [padlet("container", { childPadletIds: ["missing"] }, "container")],
    }));

    expect(result.violations).toContainEqual(expect.objectContaining({
      code: "membership-mirror-mismatch",
      padletId: "container",
    }));
  });

  it("T26 flags embeddable-frame-dangling and never flags native embeddables with external links", () => {
    const result = validateDrawingBridgeSnapshot(deepFreeze({
      elements: [
        embeddable("dangling", "post", { frameId: "missing-frame" }),
        { id: "native", type: "embeddable", link: "https://example.com", frameId: "missing-frame" },
      ],
      padlets: [padlet("post")],
    }));

    expect(result.violations).toEqual([
      expect.objectContaining({
        code: "embeddable-frame-dangling",
        padletId: "post",
        elementIds: ["dangling"],
      }),
    ]);
  });
});

describe("summarizeDrawingBridgeSnapshot", () => {
  it("T27 emits every bound diagnostics field on each padlet row", () => {
    const summary = summarizeDrawingBridgeSnapshot(deepFreeze({
      elements: [embeddable("emb", "container", { frameId: "frame-a" })],
      padlets: [padlet("container", { childPadletIds: ["child"] }, "container"), padlet("child", { parentId: "container" })],
      slideFrame,
    }));

    expect(summary.rows[1]).toEqual({
      padletId: "container",
      parentId: null,
      childPadletIds: ["child"],
      embeddableIds: ["emb"],
      embeddableId: "emb",
      embeddableLink: "padlet://container",
      frameId: "frame-a",
      sceneIndex: 0,
      elementType: "embeddable",
      hasDuplicateLink: false,
      hasMembershipMismatch: false,
      slideInclusion: "included",
    });
  });

  it("T28 marks duplicate-link and membership-mismatch statuses", () => {
    const summary = summarizeDrawingBridgeSnapshot(deepFreeze({
      elements: [embeddable("a", "container"), embeddable("b", "container")],
      padlets: [padlet("container", { childPadletIds: ["missing"] }, "container")],
    }));

    expect(summary.rows[0]).toMatchObject({
      hasDuplicateLink: true,
      hasMembershipMismatch: true,
    });
  });

  it("T29 reports slide inclusion with a slide frame and unknown without one", () => {
    const input = deepFreeze({
      elements: [embeddable("inside", "inside", { x: 10, y: 10 }), embeddable("outside", "outside", { x: 200, y: 200 })],
      padlets: [padlet("inside"), padlet("outside")],
    });

    expect(summarizeDrawingBridgeSnapshot({ ...input, slideFrame }).rows.map((row) => row.slideInclusion)).toEqual([
      "included",
      "excluded",
    ]);
    expect(summarizeDrawingBridgeSnapshot(input).rows.map((row) => row.slideInclusion)).toEqual([
      "unknown",
      "unknown",
    ]);
  });

  it("T30 does not mutate frozen inputs and returns rows in deterministic padletId order", () => {
    const input = deepFreeze({
      elements: [embeddable("b-emb", "b"), embeddable("a-emb", "a")],
      padlets: [padlet("b"), padlet("a")],
    });

    expect(summarizeDrawingBridgeSnapshot(input).rows.map((row) => row.padletId)).toEqual(["a", "b"]);
    expect(input.padlets[0].id).toBe("b");
    expect(input.elements[0].id).toBe("b-emb");
  });
});
