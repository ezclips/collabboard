"use client";

// PATCH-299. Consumes a libraries.excalidraw.com hand-off: the site opens the
// referrer with `#addLibrary=<file URL>&token=<id>`. Runs once on mount,
// imports the library into the user's own library, and strips the hash so a
// reload never adds it twice.

import { useEffect } from 'react';
import { toast } from 'sonner';

import {
  hashWithoutLibraryReturn,
  parseLibraryFile,
  parseLibraryReturn,
} from '@/lib/domain/canvas/excalidrawLibraryReturn';
import {
  addItemsToExcalidrawLibrary,
  fetchExcalidrawLibrary,
  type ExcalidrawLibraryItem,
} from '@/lib/collabboard/excalidrawLibrary';

const FETCH_TIMEOUT_MS = 15_000;

export function useExcalidrawLibraryReturn(): void {
  useEffect(() => {
    const parsed = parseLibraryReturn(window.location.hash);
    if (!parsed) return;

    const { libraryUrl } = parsed;
    const newHash = hashWithoutLibraryReturn(window.location.hash);
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search + newHash,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    void (async () => {
      try {
        const response = await fetch(libraryUrl, {
          credentials: 'omit',
          signal: controller.signal,
        });
        if (!response.ok) {
          toast.error('Could not add the library: The library could not be downloaded.');
          return;
        }

        const text = await response.text();
        const parsedFile = parseLibraryFile(text, libraryUrl);
        if (!parsedFile.ok) {
          toast.error(`Could not add the library: ${parsedFile.reason}`);
          return;
        }

        const existing = await fetchExcalidrawLibrary();
        const existingSources = new Set(existing.map((item) => item.source));
        const fresh = parsedFile.items
          .map((item, index) => ({ ...item, source: `${libraryUrl}#${index}` }))
          .filter((item) => !existingSources.has(item.source));

        if (fresh.length === 0) {
          toast.info('This library is already in your library.');
          return;
        }

        const rows: ExcalidrawLibraryItem[] = fresh.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          elements: item.elements,
          source: item.source,
          created: Date.now(),
        }));

        const { saved, error } = await addItemsToExcalidrawLibrary(rows);
        if (error) {
          toast.error(`Could not add the library: ${error}`);
          return;
        }

        const noun = saved === 1 ? 'item' : 'items';
        toast.success(
          `Added ${saved} ${noun} to your library. Open the library in a drawing to use them.`,
        );
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Could not add the library: ${message}`);
      } finally {
        clearTimeout(timeout);
      }
    })();

    // PATCH-299 Addendum 1: deliberately NO cleanup abort. React Strict Mode
    // (the App Router default) runs the effect, its cleanup, then the effect
    // again. Aborting here killed the one download: run 1 stripped the hash and
    // started the fetch, cleanup aborted it, and run 2 saw no hash and did
    // nothing. The 15 s timeout still aborts a slow fetch.
  }, []);
}
