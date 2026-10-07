import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-317. A drawing child inside a container shows a "Click to view full
 * size" affordance only when the host actually wires a viewer. Every host that
 * renders <RowColumnContainerCard> must pass onViewDrawing.
 */
const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walk(full));
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const HOST_FILES = ['components', 'app']
  .flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((file) => fs.readFileSync(file, 'utf8').includes('<RowColumnContainerCard'));

describe('PATCH-317: every RowColumnContainerCard host wires onViewDrawing', () => {
  it('finds the expected hosts', () => {
    expect(HOST_FILES.length).toBeGreaterThan(0);
  });

  it('each <RowColumnContainerCard> usage passes onViewDrawing', () => {
    for (const file of HOST_FILES) {
      const src = fs.readFileSync(file, 'utf8');
      let index = src.indexOf('<RowColumnContainerCard');
      while (index !== -1) {
        const props = src.slice(index, index + 8000);
        expect(props, `${path.relative(ROOT, file)} at offset ${index}`).toContain('onViewDrawing');
        index = src.indexOf('<RowColumnContainerCard', index + 1);
      }
    }
  });
});

describe('PATCH-317: the Scheduler popover closes before opening the viewer', () => {
  it('its onViewDrawing clears the popover then opens the drawing', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
    expect(src).toMatch(
      /onViewDrawing=\{\(p\) => \{\s*setSchedulerPopoverPadletId\(null\);\s*setViewDrawingPadlet\(p\);\s*\}\}/,
    );
  });
});
