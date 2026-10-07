import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-310. dhtmlx-gantt 9 was GPL-2.0, which a closed-source app cannot ship.
 * From version 10 the public npm package is the MIT Community edition, and our
 * Gantt uses no feature that edition drops. The unused undo plugin must no
 * longer be requested.
 */
const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const installed = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/dhtmlx-gantt/package.json'), 'utf8'),
) as { version: string; license?: string };
const ganttConfig = fs.readFileSync(path.join(root, 'components/gantt-canvas/GanttConfig.ts'), 'utf8');

describe('PATCH-310: dhtmlx-gantt is the MIT Community edition', () => {
  it('package.json declares dhtmlx-gantt at major version 10 or newer', () => {
    const declared = packageJson.dependencies?.['dhtmlx-gantt'] ?? packageJson.devDependencies?.['dhtmlx-gantt'];
    expect(declared).toBeTruthy();
    const major = Number(declared!.match(/\d+/)?.[0] ?? NaN);
    expect(major).toBeGreaterThanOrEqual(10);
  });

  it('the installed package is MIT licensed', () => {
    expect(installed.license).toBe('MIT');
  });

  it('GanttConfig.ts does not request the undo plugin', () => {
    expect(ganttConfig).not.toContain('undo: true');
  });
});
