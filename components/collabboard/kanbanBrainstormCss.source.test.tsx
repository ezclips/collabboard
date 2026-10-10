// PATCH-341 Addendum 2. The "From brainstorm" editor block (and PATCH-328's
// calendar note) had no CSS rules, so it rendered at the browser default size.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(ROOT, 'components/kanban-canvas/kanban-canvas.css'), 'utf8');

const CLASSES = [
  'kanban-editor-brainstorm-title',
  'kanban-editor-brainstorm-links',
  'kanban-editor-brainstorm-link',
  'kanban-editor-brainstorm-more',
  'kanban-editor-calendar-note',
];

describe('PATCH-341 Addendum 2 editor block styles', () => {
  it.each(CLASSES)('.%s has a CSS rule', (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
  });

  it('the title matches the field-label look and the links are quiet blue', () => {
    const title = css.match(/\.kanban-editor-brainstorm-title\s*\{([^}]*)\}/)![1];
    expect(title).toMatch(/font-size:\s*14px/);
    expect(title).toMatch(/font-weight:\s*500/);
    expect(title).toMatch(/color:\s*#2b2b2b/);

    const link = css.match(/\.kanban-editor-brainstorm-link\s*\{([^}]*)\}/)![1];
    expect(link).toMatch(/text-decoration:\s*none/);
    expect(link).toMatch(/gap:\s*6px/);
  });
});
