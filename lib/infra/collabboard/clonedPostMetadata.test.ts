import { describe, expect, it } from "vitest";

import { sanitizeClonedPostMetadata } from "./clonedPostMetadata";

describe("sanitizeClonedPostMetadata", () => {
  it("returns undefined unchanged", () => {
    expect(sanitizeClonedPostMetadata(undefined)).toBeUndefined();
  });

  it("returns null unchanged", () => {
    expect(sanitizeClonedPostMetadata(null)).toBeNull();
  });

  it("returns a distinct empty object for an empty-object input", () => {
    const source = {};
    const sanitized = sanitizeClonedPostMetadata(source);

    expect(sanitized).toEqual({});
    expect(sanitized).not.toBe(source);
  });

  it("strips all six membership keys together", () => {
    const sanitized = sanitizeClonedPostMetadata({
      parentId: "parent-1",
      childPadletIds: ["child-1"],
      sectionId: "section-1",
      sectionPosition: 2,
      position_in_timeline: 3,
      wallPosition: { x: 4, y: 5 },
      patch071OrdinaryMetadata: "ordinary",
    });

    expect(sanitized).toEqual({
      patch071OrdinaryMetadata: "ordinary",
    });
  });

  it("strips each membership key regardless of value", () => {
    const cases = [
      ["parentId", ["", null, false, 0, "parent-1"]],
      ["childPadletIds", ["", null, false, 0, ["child-1"]]],
      ["sectionId", ["", null, false, 0, "section-1"]],
      ["sectionPosition", ["", null, false, 0, 17]],
      ["position_in_timeline", ["", null, false, 0, 101]],
      ["wallPosition", ["", null, false, 0, { x: 1, y: 2 }]],
    ] as const;

    for (const [key, values] of cases) {
      for (const value of values) {
        const sanitized = sanitizeClonedPostMetadata({
          [key]: value,
          patch071OrdinaryMetadata: "ordinary",
        });

        expect(sanitized).not.toHaveProperty(key);
        expect(sanitized).toEqual({ patch071OrdinaryMetadata: "ordinary" });
      }
    }
  });

  it("preserves ordinary metadata keys verbatim", () => {
    const comments = [
      {
        id: "comment-1",
        text: "hello",
        userId: "user-1",
        userName: "User 1",
        timestamp: 1,
      },
    ];
    const sanitized = sanitizeClonedPostMetadata({
      patch071OrdinaryMetadata: "ordinary",
      topStrip: "#f97316",
      zIndex: 70,
      comments,
      content: "<p>hello</p>",
    });

    expect(sanitized).toEqual({
      patch071OrdinaryMetadata: "ordinary",
      topStrip: "#f97316",
      zIndex: 70,
      comments,
      content: "<p>hello</p>",
    });
  });

  it("preserves unrelated nested object and array references by identity", () => {
    const nestedObject = { color: "#0ea5e9" };
    const nestedArray = [{ id: "path-1" }, { id: "path-2" }];
    const source = {
      patch071OrdinaryMetadata: "ordinary",
      captionStyle: nestedObject,
      drawingPaths: nestedArray,
      parentId: "parent-1",
    };

    const sanitized = sanitizeClonedPostMetadata(source);

    expect(sanitized).not.toBe(source);
    expect(sanitized?.captionStyle).toBe(nestedObject);
    expect(sanitized?.drawingPaths).toBe(nestedArray);
  });

  it("does not mutate the source object", () => {
    const source = {
      parentId: "parent-1",
      childPadletIds: ["child-1"],
      sectionId: "section-1",
      sectionPosition: 2,
      position_in_timeline: 3,
      wallPosition: { x: 4, y: 5 },
      patch071OrdinaryMetadata: "ordinary",
    };

    void sanitizeClonedPostMetadata(source);

    expect(source).toEqual({
      parentId: "parent-1",
      childPadletIds: ["child-1"],
      sectionId: "section-1",
      sectionPosition: 2,
      position_in_timeline: 3,
      wallPosition: { x: 4, y: 5 },
      patch071OrdinaryMetadata: "ordinary",
    });
  });

  it("removes no keys beyond the bound six", () => {
    const source = {
      parentId: "parent-1",
      childPadletIds: ["child-1"],
      sectionId: "section-1",
      sectionPosition: 2,
      position_in_timeline: 3,
      wallPosition: { x: 4, y: 5 },
      patch071OrdinaryMetadata: "ordinary",
      topStrip: "#f97316",
      comments: [
        {
          id: "comment-1",
          text: "hello",
          userId: "user-1",
          userName: "User 1",
          timestamp: 1,
        },
      ],
      zIndex: 11,
      renderSignature: "sig-1",
    };

    const sanitized = sanitizeClonedPostMetadata(source);

    expect(Object.keys(sanitized ?? {}).sort()).toEqual(
      ["comments", "patch071OrdinaryMetadata", "renderSignature", "topStrip", "zIndex"].sort()
    );
  });
});
