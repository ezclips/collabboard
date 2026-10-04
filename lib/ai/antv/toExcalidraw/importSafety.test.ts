// @vitest-environment node
//
// PATCH-277 Addendum 1. The converter must NEVER evaluate the Excalidraw
// package at import time: a static runtime import dragged browser globals like
// `devicePixelRatio` into server rendering and made the harness page 500. This
// test imports the public module in a Node environment and fails loudly if that
// regression returns.
import { describe, expect, it } from 'vitest';

import { convertAntvSvg } from './index';

describe('PATCH-277 converter imports are server-safe', () => {
  it('imports index.ts and loadExcalidraw.ts in Node without evaluating Excalidraw', async () => {
    // Reaching here at all means the import chain did not evaluate Excalidraw:
    // a static runtime import would have thrown `devicePixelRatio is not
    // defined` at module scope, during this very import.
    expect(typeof convertAntvSvg).toBe('function');
    const { loadExcalidraw } = await import('./loadExcalidraw');
    expect(typeof loadExcalidraw).toBe('function');
  });
});
