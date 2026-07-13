export const MAX_DRAWING_IMPORT_BYTES = 25 * 1024 * 1024;

export type ImportedDrawingScene = {
  type: "excalidraw";
  version?: number;
  source?: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseImportedDrawingText = (text: string): ImportedDrawingScene => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("The selected file must contain a top-level JSON object.");
  }

  if (!Array.isArray(parsed.elements)) {
    throw new Error("The selected file must contain an elements array.");
  }

  if (parsed.appState !== undefined && !isRecord(parsed.appState)) {
    throw new Error("The selected file has an invalid appState value.");
  }

  if (parsed.files !== undefined && !isRecord(parsed.files)) {
    throw new Error("The selected file has an invalid files value.");
  }

  if (parsed.type !== undefined && parsed.type !== "excalidraw") {
    throw new Error("The selected file is not an Excalidraw scene export.");
  }

  return {
    type: "excalidraw",
    version: typeof parsed.version === "number" ? parsed.version : 2,
    source: typeof parsed.source === "string" ? parsed.source : undefined,
    elements: parsed.elements,
    appState: isRecord(parsed.appState) ? parsed.appState : {},
    files: isRecord(parsed.files) ? parsed.files : {},
  };
};

export const assertImportFileSize = (sizeInBytes: number) => {
  if (sizeInBytes > MAX_DRAWING_IMPORT_BYTES) {
    throw new Error(`The selected file is too large. Maximum size is ${Math.floor(MAX_DRAWING_IMPORT_BYTES / (1024 * 1024))} MB.`);
  }
};
