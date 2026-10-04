/**
 * PATCH-277 Addendum 1. The ONLY runtime import of `@excalidraw/excalidraw` in
 * this folder, and it is lazy. Excalidraw's package evaluates browser globals
 * (`devicePixelRatio`) at module scope, so a static runtime import anywhere in
 * the converter chain crashes server rendering. The converter is client-only;
 * the harness gets the elements through this memoised dynamic import.
 *
 * Mirrors `lib/ai/antv/load.ts`.
 */

export type ExcalidrawModule = typeof import('@excalidraw/excalidraw');

let loaded: Promise<ExcalidrawModule> | null = null;

export function loadExcalidraw(): Promise<ExcalidrawModule> {
  if (!loaded) {
    loaded = import('@excalidraw/excalidraw');
  }
  return loaded;
}

/** Test seam: forget the memoised module. */
export function resetExcalidrawForTests(): void {
  loaded = null;
}
