import { describe, expect, it } from "vitest";

import {
  DRAWING_CAPTURE_UPDATE,
  MAX_DRAWING_IMPORT_BYTES,
  assertImportFileSize,
  buildDrawingSceneUpdate,
  parseImportedDrawingText,
} from "./importScene";

describe("parseImportedDrawingText", () => {
  it("accepts the app export shape", () => {
    const input = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [{ id: "el-1", type: "rectangle" }],
      appState: { theme: "light", viewBackgroundColor: "transparent" },
      files: { "file-1": { id: "file-1", mimeType: "image/png" } },
    });

    expect(parseImportedDrawingText(input)).toEqual({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [{ id: "el-1", type: "rectangle" }],
      appState: { theme: "light", viewBackgroundColor: "transparent" },
      files: { "file-1": { id: "file-1", mimeType: "image/png" } },
    });
  });

  it("accepts native Excalidraw JSON with omitted optional fields", () => {
    const parsed = parseImportedDrawingText(JSON.stringify({
      type: "excalidraw",
      elements: [],
    }));

    expect(parsed.type).toBe("excalidraw");
    expect(parsed.version).toBe(2);
    expect(parsed.appState).toEqual({});
    expect(parsed.files).toEqual({});
  });

  it("rejects malformed JSON", () => {
    expect(() => parseImportedDrawingText("{")).toThrow(
      "The selected file is not valid JSON.",
    );
  });

  it("rejects unrelated valid JSON", () => {
    expect(() => parseImportedDrawingText(JSON.stringify({ hello: "world" }))).toThrow(
      "The selected file must contain an elements array.",
    );
  });

  it("rejects elements when present but not an array", () => {
    expect(() => parseImportedDrawingText(JSON.stringify({
      type: "excalidraw",
      elements: {},
    }))).toThrow("The selected file must contain an elements array.");
  });

  it("rejects appState when present but not an object", () => {
    expect(() => parseImportedDrawingText(JSON.stringify({
      type: "excalidraw",
      elements: [],
      appState: [],
    }))).toThrow("The selected file has an invalid appState value.");
  });

  it("rejects an unsupported type value", () => {
    expect(() => parseImportedDrawingText(JSON.stringify({
      type: "library",
      elements: [],
    }))).toThrow("The selected file is not an Excalidraw scene export.");
  });

  it("rejects invalid files payloads", () => {
    expect(() => parseImportedDrawingText(JSON.stringify({
      type: "excalidraw",
      elements: [],
      files: [],
    }))).toThrow("The selected file has an invalid files value.");
  });
});

describe("assertImportFileSize", () => {
  it("allows files at the limit", () => {
    expect(() => assertImportFileSize(MAX_DRAWING_IMPORT_BYTES)).not.toThrow();
  });

  it("rejects files above the limit", () => {
    expect(() => assertImportFileSize(MAX_DRAWING_IMPORT_BYTES + 1)).toThrow(
      "The selected file is too large.",
    );
  });
});

describe("buildDrawingSceneUpdate", () => {
  it("uses captureUpdate for import-style scene replacement", () => {
    const payload = buildDrawingSceneUpdate({
      elements: [{ id: "el-1" }],
      appState: { theme: "light" },
      commitToHistory: true,
    });

    expect(payload).toEqual({
      elements: [{ id: "el-1" }],
      appState: { theme: "light" },
      captureUpdate: DRAWING_CAPTURE_UPDATE.IMMEDIATELY,
    });
    expect(payload).not.toHaveProperty("commitToHistory");
    expect(payload).not.toHaveProperty("files");
  });

  it("maps non-immediate updates to EVENTUALLY", () => {
    expect(buildDrawingSceneUpdate({
      elements: [],
      commitToHistory: false,
    }).captureUpdate).toBe(DRAWING_CAPTURE_UPDATE.EVENTUALLY);
  });
});
