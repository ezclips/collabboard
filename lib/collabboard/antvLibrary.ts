/**
 * PATCH-282. Loads the built-in AntV drawing library from the generated,
 * same-origin file. The editor must never wait on this for longer than it
 * already waits, and must always be able to open, so every failure resolves to
 * `[]` with a single `console.error`.
 *
 * The fetch happens at most once per page: the pending promise is cached at
 * module scope and shared by both editors.
 */

import type { LibraryItem } from '@excalidraw/excalidraw/types';

export const ANTV_LIBRARY_URL = '/libraries/antv-diagrams.excalidrawlib';

let cached: Promise<LibraryItem[]> | null = null;

function isLibraryItem(value: unknown): value is LibraryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.status === 'string' &&
    Array.isArray(item.elements)
  );
}

async function fetchAntvLibraryItems(): Promise<LibraryItem[]> {
  try {
    const response = await fetch(ANTV_LIBRARY_URL);
    if (!response.ok) {
      throw new Error(`AntV library request failed with HTTP ${response.status}`);
    }
    const data = (await response.json()) as { libraryItems?: unknown } | null;
    const items = data?.libraryItems;
    if (!Array.isArray(items) || !items.every(isLibraryItem)) {
      throw new Error('AntV library file has an unexpected shape');
    }
    return items;
  } catch (error) {
    console.error('Failed to load the AntV drawing library:', error);
    return [];
  }
}

/** The built-in AntV library items, or `[]` if the file is missing or invalid. */
export function loadAntvLibraryItems(): Promise<LibraryItem[]> {
  if (!cached) {
    cached = fetchAntvLibraryItems();
  }
  return cached;
}
