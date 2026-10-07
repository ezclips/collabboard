// PATCH-319. The date format menu was under `.kanban-dropdown-overlay`, so a
// click hit the overlay and only closed the menu. It must sit above it, like
// the priority menu.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(process.cwd(), 'components/kanban-canvas/kanban-canvas.css'), 'utf8');

function zIndexOf(selector: string): number {
  const start = css.indexOf(selector);
  expect(start, `${selector} present`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf('}', start));
  const match = block.match(/z-index:\s*(-?\d+)/);
  expect(match, `${selector} has a z-index`).not.toBeNull();
  return Number(match![1]);
}

describe('PATCH-319: the date format menu sits above its overlay', () => {
  it('has a higher z-index than .kanban-dropdown-overlay', () => {
    expect(zIndexOf('.kanban-date-format-menu {')).toBeGreaterThan(zIndexOf('.kanban-dropdown-overlay {'));
  });
});
