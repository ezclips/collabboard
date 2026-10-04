'use client';

/**
 * PATCH-277 Addendum 2. `ssr: false` is only allowed in a Client Component, so
 * this tiny wrapper owns the dynamic import of the harness and forwards the
 * props. The server route renders this wrapper; the harness (and Excalidraw)
 * never evaluates during server rendering.
 */

import dynamic from 'next/dynamic';

const AntvExcalidrawHarness = dynamic(() => import('./AntvExcalidrawHarness'), { ssr: false });

export default function AntvExcalidrawHarnessClient(props: {
  template?: string;
  theme?: string;
  pill?: string;
}) {
  return <AntvExcalidrawHarness {...props} />;
}
