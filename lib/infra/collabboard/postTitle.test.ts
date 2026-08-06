import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getMeaningfulTitle, isPlaceholderTitle } from "./postTitle";

describe("post title placeholders", () => {
  it("treats blank and whitespace-only titles as placeholders", () => {
    expect(isPlaceholderTitle("", "table")).toBe(true);
    expect(getMeaningfulTitle("", "table")).toBe("");
    expect(isPlaceholderTitle("   ", "table")).toBe(true);
    expect(getMeaningfulTitle("   ", "table")).toBe("");
  });

  it("treats generic and table placeholders as not meaningful", () => {
    expect(isPlaceholderTitle("Untitled", "table")).toBe(true);
    expect(isPlaceholderTitle("Table", "table")).toBe(true);
    expect(isPlaceholderTitle("New Table", "table")).toBe(true);
    expect(isPlaceholderTitle("Untitled Table", "table")).toBe(true);
    expect(getMeaningfulTitle("Table", "table")).toBe("");
  });

  it("treats legacy table Image as a placeholder without applying that to comments", () => {
    expect(isPlaceholderTitle("Image", "table")).toBe(true);
    expect(getMeaningfulTitle("Image", "table")).toBe("");
    expect(isPlaceholderTitle("Image", "comment")).toBe(false);
    expect(getMeaningfulTitle("Image", "comment")).toBe("Image");
  });

  it("keeps meaningful titles with surrounding whitespace trimmed", () => {
    expect(isPlaceholderTitle("Budget", "table")).toBe(false);
    expect(getMeaningfulTitle("  Budget  ", "table")).toBe("Budget");
    expect(getMeaningfulTitle("Feedback", "comment")).toBe("Feedback");
  });

  it("normalizes underscore and hyphen type names", () => {
    expect(isPlaceholderTitle("Ai Component", "ai_component")).toBe(true);
    expect(isPlaceholderTitle("New Ai Component", "ai-component")).toBe(true);
    expect(getMeaningfulTitle("AI Summary", "ai_component")).toBe("AI Summary");
  });

  it("treats the shared 'New Post' default (viewport-center add flow) as a placeholder for any type", () => {
    expect(isPlaceholderTitle("New Post", "note")).toBe(true);
    expect(isPlaceholderTitle("new post", "card")).toBe(true);
    expect(getMeaningfulTitle("New Post", "note")).toBe("");
  });

  it("treats 'New Note' (the Note editor's real create-on-first-save default, stamped on type 'text') as a placeholder", () => {
    expect(isPlaceholderTitle("New Note", "text")).toBe(true);
    expect(getMeaningfulTitle("New Note", "text")).toBe("");
  });

  it("treats the Comment post's legacy plural default 'Comments' as a placeholder, without applying that to other types", () => {
    expect(isPlaceholderTitle("Comments", "comment")).toBe(true);
    expect(getMeaningfulTitle("Comments", "comment")).toBe("");
    expect(isPlaceholderTitle("Comments", "note")).toBe(false);
  });
});

describe("approved table-title surfaces", () => {
  it("does not keep generated Table fallbacks in the approved render surfaces", () => {
    const freeform = readFileSync("components/collabboard/canvas/ui/FreeformPadletCards.tsx", "utf8");
    const preview = readFileSync("components/collabboard/ContainerChildPreviewCard.tsx", "utf8");
    const postCard = readFileSync("components/collabboard/PostCardContent.tsx", "utf8");

    expect(freeform).not.toContain("padlet.title || 'Table'");
    expect(preview).not.toContain('padlet.title || "Table"');
    expect(freeform).toContain("getMeaningfulTitle(padlet.title, 'table')");
    expect(preview).toContain('getMeaningfulTitle(padlet.title, "table")');
    expect(postCard).toContain('getMeaningfulTitle(padlet.title, "table")');
  });
});
