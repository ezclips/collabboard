import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-286 census. The drawing editor must not load its fonts from an outside
 * host: unpkg serves the latest npm release rather than our vendored fork, so a
 * content-hashed font file can 404 and the editor silently falls back. This
 * scans the app's own source and fails if the external CDN hostname returns.
 *
 * `excalidraw_fork` is excluded on purpose -- it is the upstream library we
 * vendor, and it is the only place allowed to carry upstream fallbacks. Test
 * files are excluded because a test may legitimately name the forbidden host to
 * assert against it; this census is about what production source ships.
 */

const root = process.cwd();
const SOURCE_ROOTS = ['app', 'components', 'lib'];
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.next', 'excalidraw_fork']);
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
]);
const TEST_FILE = /\.(test|spec)\.[tj]sx?$/;

function collect(dir: string, found: string[]) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, found);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (TEST_FILE.test(entry.name)) continue;
    found.push(full);
  }
}

describe('PATCH-286: external font CDN census', () => {
  it('no production source under app/, components/ or lib/ points at unpkg.com', () => {
    const files: string[] = [];
    for (const dir of SOURCE_ROOTS) collect(path.join(root, dir), files);

    const offenders = files
      .filter((file) => readFileSync(file, 'utf8').includes('unpkg.com'))
      .map((file) => path.relative(root, file));

    expect(offenders).toEqual([]);
  });
});
