import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// PATCH-299. The vendored fork is excluded from tsc, so guard the source
// directly: the Browse-libraries link must fall back to the real site instead
// of resolving the missing VITE_APP_LIBRARY_URL to the string "undefined".

const ROOT = process.cwd();
const BROWSE_BUTTON =
  'components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/LibraryMenuBrowseButton.tsx';

function source(): string {
  return fs.readFileSync(path.join(ROOT, BROWSE_BUTTON), 'utf8');
}

describe('PATCH-299 fork Browse-libraries link', () => {
  it('contains the real Excalidraw library site', () => {
    expect(source()).toContain('https://libraries.excalidraw.com');
  });

  it('no longer starts the href with the bare env value', () => {
    expect(source()).not.toContain(
      '${import.meta.env.VITE_APP_LIBRARY_URL}?target=',
    );
  });
});
