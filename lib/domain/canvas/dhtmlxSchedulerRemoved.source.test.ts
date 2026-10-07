import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-311. dhtmlx-scheduler is GPL-2.0 and cannot ship; the Kanban scheduler
 * now runs on react-big-calendar. No shipped source may import it again.
 */
const IMPORT_PATTERN = /(?:import|require)\s*\(?\s*['"]dhtmlx-scheduler/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', 'out', '.turbo']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('PATCH-311: dhtmlx-scheduler is gone from the source tree', () => {
  it('no file under components/, app/ or lib/ imports dhtmlx-scheduler', () => {
    const offenders = ['components', 'app', 'lib']
      .flatMap((dir) => sourceFiles(path.join(process.cwd(), dir)))
      .filter((file) => IMPORT_PATTERN.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
