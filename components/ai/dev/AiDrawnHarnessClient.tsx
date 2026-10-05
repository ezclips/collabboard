'use client';

/**
 * PATCH-283 I. `ssr: false` is only allowed in a Client Component, so this thin
 * wrapper owns the dynamic import of the AI-drawn harness and forwards the
 * search params. Excalidraw is never evaluated during server rendering.
 */

import dynamic from 'next/dynamic';

const AiDrawnHarness = dynamic(() => import('./AiDrawnHarness'), { ssr: false });

export default function AiDrawnHarnessClient(props: {
  kind?: string;
  seed?: string;
  examples?: string;
  reasoning?: string;
  board?: string;
  export?: string;
}) {
  return <AiDrawnHarness {...props} />;
}
