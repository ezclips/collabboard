// PATCH-287 Addendum 1, item 7. `chartValues/**` and the values panel must not
// statically import the Excalidraw runtime: the wrapper loads the editor lazily
// on purpose, and a value import from '@excalidraw/excalidraw' would drag the
// whole editor into the wrapper's static graph. Type imports are allowed.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function collect(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collect(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
}

describe('PATCH-287 Addendum 1: no static Excalidraw runtime import', () => {
  it('chartValues and the panel import only types from @excalidraw/excalidraw', () => {
    const files: string[] = [];
    collect(path.join(process.cwd(), 'lib/ai/antv/chartValues'), files);
    files.push(path.join(process.cwd(), 'components/collabboard/editors/AntvChartValuesControl.tsx'));

    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const isValueImport =
          /^\s*import\s+/.test(line) && !/^\s*import\s+type\b/.test(line);
        if (isValueImport && line.includes("from '@excalidraw/excalidraw'")) {
          offenders.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
