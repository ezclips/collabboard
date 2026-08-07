import { describe, expect, it } from "vitest";

import { getContainerEditTargetLabel } from "./containerEditTargetLabel";

describe("getContainerEditTargetLabel", () => {
  it("uses a meaningful comment title", () => {
    expect(getContainerEditTargetLabel({ title: "Feedback", type: "comment" })).toBe("Feedback");
  });

  it("falls back to Comment for an untitled comment", () => {
    expect(getContainerEditTargetLabel({ title: "Untitled", type: "comment" })).toBe("Comment");
  });

  it("falls back to Comment for a whitespace-title comment", () => {
    expect(getContainerEditTargetLabel({ title: "   ", type: "comment" })).toBe("Comment");
  });

  it("uses a meaningful image title", () => {
    expect(getContainerEditTargetLabel({ title: "Map", type: "image" })).toBe("Map");
  });

  it("falls back to Image for an untitled image", () => {
    expect(getContainerEditTargetLabel({ title: "Untitled", type: "image" })).toBe("Image");
  });

  it("uses image caption when the stored image title is a type placeholder", () => {
    expect(getContainerEditTargetLabel({ title: "Image", type: "image", metadata: { caption: "Test Label" } })).toBe("Test Label");
  });

  it("falls back to Table for a legacy drawing table child titled Image", () => {
    expect(getContainerEditTargetLabel({ title: "Image", type: "table" })).toBe("Table");
  });

  it("keeps Image when it is the explicit title of a comment", () => {
    expect(getContainerEditTargetLabel({ title: "Image", type: "comment" })).toBe("Image");
  });

  it("uses link metadata title when the stored link title is a type placeholder", () => {
    expect(getContainerEditTargetLabel({ title: "Link", type: "link", metadata: { linkTitle: "Docs" } })).toBe("Docs");
  });

  it("uses an ordinary text post title", () => {
    expect(getContainerEditTargetLabel({ title: "Agenda", type: "text" })).toBe("Agenda");
  });

  it("falls back to semantic type for an ordinary untitled text post", () => {
    expect(getContainerEditTargetLabel({ title: "", type: "text" })).toBe("Text");
  });

  it("falls back to metadata kind when type is missing", () => {
    expect(getContainerEditTargetLabel({ title: "Untitled", metadata: { kind: "ai_component" } })).toBe("Ai Component");
  });
});
