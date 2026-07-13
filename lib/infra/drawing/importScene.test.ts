import { describe, expect, it } from "vitest";

import {
  collectDrawingOverlayDeletionIds,
  collectDrawingOverlayRootIds,
  DRAWING_CAPTURE_UPDATE,
  MAX_DRAWING_IMPORT_BYTES,
  assertImportFileSize,
  buildDrawingSceneUpdate,
  parseImportedDrawingText,
  prepareImportedSceneForAdd,
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

describe("collectDrawingOverlayDeletionIds", () => {
  it("collects root overlay padlets and their descendants without touching the master drawing row", () => {
    const padlets = [
      { id: "drawing-master", type: "drawing", metadata: {} },
      { id: "container-a", type: "container", metadata: {} },
      { id: "child-a", type: "image", metadata: { parentId: "container-a" } },
      { id: "container-b", type: "text", metadata: {} },
      { id: "child-b", type: "comment", metadata: { parentId: "container-b" } },
    ];

    expect(collectDrawingOverlayRootIds(padlets)).toEqual(["container-a", "container-b"]);
    expect(collectDrawingOverlayDeletionIds(padlets)).toEqual([
      "container-a",
      "container-b",
      "child-a",
      "child-b",
    ]);
  });
});

describe("prepareImportedSceneForAdd", () => {
  it("remaps ids, bindings, files, and offsets imported content", () => {
    const imported = prepareImportedSceneForAdd({
      elements: [
        {
          id: "frame-1",
          type: "frame",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          groupIds: ["group-1"],
          boundElements: [{ id: "arrow-1", type: "arrow" }],
          version: 2,
          versionNonce: 1,
          updated: 1,
        },
        {
          id: "text-1",
          type: "text",
          x: 10,
          y: 20,
          width: 20,
          height: 10,
          frameId: "frame-1",
          containerId: "frame-1",
          groupIds: ["group-1"],
          version: 1,
          versionNonce: 2,
          updated: 1,
        },
        {
          id: "arrow-1",
          type: "arrow",
          x: 30,
          y: 40,
          width: 10,
          height: 10,
          startBinding: { elementId: "frame-1", focus: 0, gap: 0 },
          endBinding: { elementId: "text-1", focus: 0, gap: 0 },
          version: 3,
          versionNonce: 3,
          updated: 1,
        },
        {
          id: "image-1",
          type: "image",
          x: 50,
          y: 60,
          width: 30,
          height: 30,
          fileId: "file-1",
          version: 1,
          versionNonce: 4,
          updated: 1,
        },
      ],
      files: {
        "file-1": { id: "file-1", mimeType: "image/png" },
      },
      viewportCenter: { x: 400, y: 300 },
      placementOffset: { x: 40, y: 20 },
    });

    const ids = imported.elements.map((element) => element.id);
    expect(ids).not.toContain("frame-1");
    expect(new Set(ids).size).toBe(imported.elements.length);

    const frame = imported.elements.find((element) => element.type === "frame")!;
    const text = imported.elements.find((element) => element.type === "text")!;
    const arrow = imported.elements.find((element) => element.type === "arrow")!;
    const image = imported.elements.find((element) => element.type === "image")!;

    expect(text.frameId).toBe(frame.id);
    expect(text.containerId).toBe(frame.id);
    expect(arrow.startBinding.elementId).toBe(frame.id);
    expect(arrow.endBinding.elementId).toBe(text.id);
    expect(frame.boundElements[0].id).toBe(arrow.id);
    expect(frame.groupIds[0]).toBe(text.groupIds[0]);
    expect(image.fileId).not.toBe("file-1");
    expect(imported.files[image.fileId]).toEqual(
      expect.objectContaining({ id: image.fileId, mimeType: "image/png" }),
    );
    expect(frame.x).not.toBe(0);
    expect(frame.y).not.toBe(0);
  });

  it("creates independent copies when the same file is imported twice", () => {
    const scene = {
      elements: [
        { id: "rect-1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1, versionNonce: 1, updated: 1 },
      ],
      files: {},
    };

    const first = prepareImportedSceneForAdd({
      ...scene,
      viewportCenter: { x: 100, y: 100 },
    });
    const second = prepareImportedSceneForAdd({
      ...scene,
      viewportCenter: { x: 100, y: 100 },
      placementOffset: { x: 40, y: 40 },
    });

    expect(first.elements[0].id).not.toBe(second.elements[0].id);
    expect(first.elements[0].x).not.toBe(second.elements[0].x);
    expect(first.elements[0].y).not.toBe(second.elements[0].y);
  });
});
