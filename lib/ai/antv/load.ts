/**
 * PATCH-241. The only module that imports `@antv/infographic` at runtime. It is
 * imported lazily by the renderer (client-only), so AntV never reaches the main
 * bundle or server code. Memoised: the dynamic import and the one-time setup run
 * once per page.
 */

import { configureAntv, type AntvModule } from './setup';

export type { AntvModule };

let loaded: Promise<AntvModule> | null = null;

export function loadAntv(): Promise<AntvModule> {
  if (!loaded) {
    loaded = import('@antv/infographic').then((mod) => {
      configureAntv(mod);
      return mod;
    });
  }
  return loaded;
}

/** Test seam: forget the memoised module. */
export function resetAntvForTests(): void {
  loaded = null;
}
