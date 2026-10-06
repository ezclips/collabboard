import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// PATCH-299 Addendum 2. A drawing's personal library was shown twice because
// the list was fed to Excalidraw on TWO paths: initialData.libraryItems (which
// Excalidraw merges asynchronously) AND updateLibrary(merge:false). The list
// must reach the editor through updateLibrary only.
//
// DrawingLayout has no render harness here (vitest.config.ts does not run
// components/collabboard/canvas/layouts/*.test.*), so both surfaces are guarded
// at the source level; DrawingEditor also has a render test.

const ROOT = process.cwd();

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('PATCH-299 Addendum 2: one library path', () => {
  it('DrawingLayout does not pass libraryItems on Excalidraw initialData', () => {
    const src = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    const start = src.indexOf('const excalidrawInitialData = useMemo(');
    const end = src.indexOf('}), [', start);
    const block = start === -1 || end === -1 ? '' : src.slice(start, end);
    // Guard against a mis-anchored empty slice trivially passing.
    expect(block).toContain('elements: initialElements');
    expect(block).not.toContain('libraryItems');
  });

  it('DrawingEditor does not pass libraryItems on Excalidraw initialData', () => {
    const src = read('components/collabboard/editors/DrawingEditor.tsx');
    const start = src.indexOf('<ExcalidrawWrapper');
    const end = src.indexOf('onChange={handleChange}', start);
    const block = start === -1 || end === -1 ? '' : src.slice(start, end);
    expect(block).toContain('initialData={');
    expect(block).not.toContain('libraryItems');
  });
});
