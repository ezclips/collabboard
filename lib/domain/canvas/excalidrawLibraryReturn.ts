// lib/domain/canvas/excalidrawLibraryReturn.ts
//
// PATCH-299. Pure parsing for the "return from libraries.excalidraw.com"
// hand-off. Excalidraw's site opens the referrer with
// `#addLibrary=<file URL>&token=<id>` once the user clicks "Add to Excalidraw".
// No browser or network APIs live here so the rules can be tested directly.

export interface ParsedLibraryReturn {
  libraryUrl: string;
}

export interface ParsedLibraryItem {
  name: string;
  elements: unknown[];
}

export type ParseLibraryFileResult =
  | { ok: true; items: ParsedLibraryItem[] }
  | { ok: false; reason: string };

const LIBRARY_HOST = 'libraries.excalidraw.com';
const LIBRARY_FILE_SUFFIX = '.excalidrawlib';
const MAX_LIBRARY_FILE_CHARS = 5_000_000;
const MAX_LIBRARY_ITEMS = 500;
const UNSUPPORTED_ELEMENT_TYPES = new Set(['image', 'embeddable', 'iframe']);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/**
 * Reads `addLibrary` from the hash. Only an https URL on exactly
 * `libraries.excalidraw.com` ending in `.excalidrawlib` is accepted.
 */
export function parseLibraryReturn(hash: string): ParsedLibraryReturn | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get('addLibrary');
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.hostname !== LIBRARY_HOST) return null;
  if (!url.pathname.endsWith(LIBRARY_FILE_SUFFIX)) return null;
  return { libraryUrl: raw };
}

/**
 * The hash with `addLibrary` and `token` removed, other keys kept. Returns
 * `''` when nothing is left, so it can be concatenated onto pathname+search.
 */
export function hashWithoutLibraryReturn(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  params.delete('addLibrary');
  params.delete('token');
  const rest = params.toString();
  return rest ? `#${rest}` : '';
}

function libraryNameFromUrl(libraryUrl: string): string {
  let segment = '';
  try {
    const url = new URL(libraryUrl);
    segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    segment = '';
  }
  const base = segment
    .replace(/\.excalidrawlib$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  if (!base) return 'Library';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function isUnsupportedElement(element: unknown): boolean {
  const record = asRecord(element);
  const type = record?.type;
  return typeof type === 'string' && UNSUPPORTED_ELEMENT_TYPES.has(type);
}

function usableElements(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some(isUnsupportedElement)) return null;
  return value;
}

function notAnExcalidrawLibrary(): ParseLibraryFileResult {
  return { ok: false, reason: 'This is not an Excalidraw library file.' };
}

export function parseLibraryFile(
  text: string,
  libraryUrl: string,
): ParseLibraryFileResult {
  if (text.length > MAX_LIBRARY_FILE_CHARS) {
    return { ok: false, reason: 'The library file is too large.' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return notAnExcalidrawLibrary();
  }

  const root = asRecord(parsedJson);
  if (!root) return notAnExcalidrawLibrary();

  const entries: Array<{ name: unknown; elements: unknown }> = [];
  if (Array.isArray(root.libraryItems)) {
    for (const entry of root.libraryItems) {
      const record = asRecord(entry);
      entries.push({ name: record?.name, elements: record?.elements });
    }
  } else if (Array.isArray(root.library)) {
    for (const entry of root.library) {
      entries.push({ name: undefined, elements: entry });
    }
  } else {
    return notAnExcalidrawLibrary();
  }

  const baseName = libraryNameFromUrl(libraryUrl);
  const items: ParsedLibraryItem[] = [];
  for (const entry of entries) {
    if (items.length >= MAX_LIBRARY_ITEMS) break;
    const elements = usableElements(entry.elements);
    if (!elements) continue;
    const name =
      typeof entry.name === 'string' && entry.name.trim() !== ''
        ? entry.name
        : `${baseName} ${items.length + 1}`;
    items.push({ name, elements });
  }

  if (items.length === 0) {
    return { ok: false, reason: 'The library has no items this app can use.' };
  }
  return { ok: true, items };
}
